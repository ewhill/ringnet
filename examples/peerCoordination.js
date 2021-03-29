"use strict";

const crypto = require('crypto');
const dns = require('dns');
const url = require('url');
const util = require('util');

const { Peer, Message } = require('../index.js');
const Expectation = require('./expectation');
const colors = require('./colors');

const sink = () => {};
const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

const nslookup = (host) => {
  return new Promise((resolve, reject) => {
      dns.resolve(host, (err, result) => {
        return err ? reject(err) : resolve(result);
      });
    });
};

const lookupSeed = async (seed) => {
  if(!seed || typeof seed !== 'string') {
    throw new Error(`Invalid seed given.`);
  }

  let seedUrl = url.parse(seed);
  let addresses = [];

  try {
    const ips = await nslookup(seedUrl.hostname || seedUrl.href);
    
    if(ips && Array.isArray(ips) && ips.length > 0) {
      if(seedUrl.hostname) {
        // Change the hostname (minus port)
        seedUrl.hostname = ips[0];
      } else {
        seedUrl.href = ips[0];
      }
      
      return seedUrl.href;
    }
  } catch(e) {
    // Proceed, don't error out.
    if(typeof seed == "string") {
      return seed;
    }
  }
}

class TakeRequestMessage extends Message {
  constructor(options = {}) {
    super();
    const { jobs=[], timestamp=Date.now() } = options;
    this.body = { jobs, timestamp };
  }

  clone() {
    return new TakeRequestMessage({
        jobs: this.jobs,
        timestamp: this.timestamp
      });
  }

  get jobs() { return this.body.jobs; }
  set jobs(value) { this.body = { ...this.body, jobs: value }; }
  get timestamp() { return this.body.timestamp; }
  set timestamp(value) {
    this.body = { ...this.body, timestamp: value };
  }
}

class JobMessage extends Message {
  constructor(options = {}) {
    super();
    const { job={} } = options;
    this.body = { job };
  }

  clone() {
    return new JobMessage({ job: this.job });
  }

  get job() { return this.body.job; }
  set job(value) { this.body = { ...this.body, job: value }; }
}

class TakeResponseMessage extends Message {
  constructor(options = {}) {
    super();
    const { got=[], drop=[] } = options;
    this.body = { got, drop };
  }

  clone() {
    return new TakeResponseMessage({ got: this.got, drop: this.drop });
  }

  get got() { return this.body.got; }
  set got(value) { this.body = { ...this.body, got: value }; }
  get drop() { return this.body.drop; }
  set drop(value) { this.body = { ...this.body, drop: value }; }
}

class JobResultMessage extends Message {
  constructor(options = {}) {
    super();
    const { jobId } = options;
    this.body = { jobId };
  }

  clone() {
    return new JobResultMessage({ jobId: this.jobId });
  }

  get jobId() { return this.body.jobId; }
  set jobId(value) { this.body = { ...this.body, jobId: value }; }
}

class PeersRequestMessage extends Message {
  constructor(options = {}) {
    super();
    const { since } = options;
    this.body = { since };
  }

  clone() {
    return new PeersRequestMessage({ since: this.since });
  }

  get since() { return this.body.since; }
  set since(value) { this.body = { ...this.body, since: value }; }
}

class PeersResponseMessage extends Message {
  constructor(options = {}) {
    super();
    const { peers } = options;
    this.body = { peers };
  }

  clone() {
    return new PeersResponseMessage({ peers: this.peers });
  }

  get peers() { return this.body.peers; }
  set peers(value) { this.body = { ...this.body, peers: value }; }
}

class Worker extends Peer {
  _logger = fakeLogger;
  _peersInterval = null;
  _work = {};
  _workQueue = {};

  constructor(options) {
    super({ ...options, logger: fakeLogger });

    this._logger = 
      options.hasOwnProperty('logger') ? options.logger : fakeLogger;

    this.bind(PeersRequestMessage).to((message, connection) => {
        this.peersRequestMessageHandler(message, connection);
      });
    this.bind(PeersResponseMessage).to((message, connection) => {
        this.peersResponseMessageHandler(message, connection);
      });
    this.bind(JobMessage).to((message, connection) => {
        this.jobMessageHandler(message, connection);
      });
    this.bind(TakeRequestMessage).to((message, connection) => {
        this.takeRequestMessageHandler(message, connection);
      });
    this.bind(TakeResponseMessage).to((message, connection) => {
        this.takeResponseMessageHandler(message, connection);
      });
    this.bind(JobResultMessage).to((message, connection) => {
        this.jobResultMessageHandler(message, connection);
      });

    this.on('connection', (wsClient) => {
        this.wsConnectionHandler(wsClient);
      });
  }

  get work() {
    return this._work;
  }

  get workQueue() {
    return this._workQueue;
  }

  hasJob(id) {
    return this._work.hasOwnProperty(id);
  }

  getJob(id) {
    if(!this.hasJob(id)) {
      throw new Error(`Cannot find job for id '${id}'!`);
    }
    return this._work[id];
  }

  addJob(job, timestamp) {
    const jobId = this.getJobId(job);
    const trustedPeers = this.trustedPeers;

    this._work[jobId] = {
      /*
       * Want > 50%, should only ever be between 50%-100%. Less than 50% may 
       * have unintended consequences such as double work, network congestion, 
       * etc.
       */
      needed: parseInt(Math.floor(trustedPeers.length / 2) + 1), // > 50%
      /*
       * Snapshot of all connected, trusted peers at the time when the job is 
       * added. This will be used to verify only these peers are able to 
       * respond and confirm or drop take requests and new peers which may join 
       * in the time between the job being added and the job being confirmed 
       * will not be able to participate in the process.
       */
      available: trustedPeers.reduce((r, p) => 
        ({ ...r, [p.connection.remoteSignature]: false }), {}),
      /*
       * Tallies for the total received, confirmed and dropped takeResult 
       * messages.
       */
      responses: 0,
      confirmed: 0,
      dropped: 0,
      /*
       * The time at which the job was added. This is used to determine which 
       * workers have the eligibility to take this job.
       */
      enqueued: timestamp ? timestamp : (new Date()).getTime(),
      /* 
       * The actual job (some object / data).
       */
      job
    };

    return jobId;
  }

  removeJob(idOrJob) {
    let id;

    if(typeof idOrJob === 'string') {
      id = idOrJob;
    } else if(typeof idOrJob === 'object') {
      id = this.getJobId(job);
    }

    if(this.hasJob(id)) {
      delete this._work[id];
    }
  }

  getJobId(job) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(job))
        .digest('hex');
  }

  wsConnectionHandler (wsClient) {
    let since = 0;
    this._peersInterval = setInterval(() => {
        if(wsClient.isConected && wsClient.isTrusted) {
          wsClient.send(new PeersRequestMessage({ since }));
          since = (new Date()).getTime();
        }
      }, 1000 * 60 /* 1 minute */);
  }

  async peersRequestMessageHandler (message, connection) {
    const since = { message };

    let sinceDate;
    try {
      sinceDate = new Date(since);
    } catch(e) {
      connection.send(new PeersResponseMessage({ peers: [] }));
    }

    let peers = this.peers
      .filter((p) => p.created >= sinceDate)
      .map((p) => {
          return {
            address: p.connection.address,
            created: p.created,
            publicKey: p.connection.remotePublicKey,
            signature: p.connection.remoteSignature,
          };
        });

    const peersResponseMessage = new PeersResponseMessage({ peers });
    try {
      await connection.send(peersResponseMessage);
    } catch(e) {
      this._logger.error(e.stack);
    }
  }

  async peersResponseMessageHandler (message, connection) {
    let { peers } = message;

    this.discover(peers.filter((p) => {
        return this.isConnectedTo({ signature: p.signature });
      }));
  }

  async broadcastTake (jobs) {
    if(jobs && !Array.isArray(jobs)) {
      jobs = [jobs];
    }
      
    let jobsObject = {};
    let takeJobIds = [];
    
    const timestamp = (new Date()).getTime();

    for(let i=0; i<jobs.length; i++) {
      const jobId = this.addJob(jobs[i], timestamp);

      jobsObject[jobId] = {
        enqueued: timestamp,
        job: jobs[i]
      };

      takeJobIds.push(jobId);
    }
    
    let takeMessage = new TakeRequestMessage({ jobs: jobsObject, timestamp });
    
    this._logger.log(`${this.port} requests to take: ${takeJobIds}`);
    
    try {
      await this.broadcast(takeMessage);
    } catch(e) {
      this._logger.error(e.stack);
    }
  };

  async takeRequestMessageHandler (message, connection) {
    let got = [];
    let drop = [];
      
    if(this._work && Object.keys(this._work).length > 0) {
      if(message.timestamp && typeof message.timestamp === "number") {
          try {
            message.timestamp = new Date(message.timestamp);
          } catch(e) {}
      } else {
        this._logger.log(`message.timestamp ` + 
          `(${typeof message.timestamp}): ${message.timestamp}`);
      }
      
      if(message.jobs) {
        const remoteJobIds = Object.keys(message.jobs);
        const localJobIds = Object.keys(this._work);

        for(let remoteJobId of remoteJobIds) {
          if(localJobIds.includes(remoteJobId)) {
            const difference = 
              (message.timestamp - this._work[remoteJobId].enqueued);
            
            if(difference > 0) {
              this._logger.log(
                `Job ${remoteJobId} DOES conflict, will be DROPPED!`);
              drop.push(remoteJobId);
            } else if(difference === 0) {
              this._logger.log(
                `Both jobs were enqueued at EXACTLY the same time. Cannot ` + 
                `proceed, and both peers must drop the job.`);
              drop.push(remoteJobId);
              // this.removeJob(remoteJobId);
            } else {
              this._logger.log(
                `Job ${remoteJobId} conflicts but was enqueued by peer ` + 
                `before it was locally enqueued. The job will be confirmed ` + 
                `to peer and dropped locally.`);
              got.push(remoteJobId);
              // this.removeJob(remoteJobId);
            }
          } else {
            this._logger.log(
              `Job ${remoteJobId} DOES NOT conflict, will be CONFIRMED.`);
            got.push(remoteJobId);
          }
        }
      }
    } else {
      // Peer received 'take' message and does not have jobs in queue. All 
      // requested jobs will be confirmed.
      got = Object.keys(message.jobs);

      for(let id of got) {
        this._logger.log(`Job ${id} DOES NOT conflict, will be CONFIRMED.`);
      }
    }
    
    let takeResponseMessage = new TakeResponseMessage({ got, drop });
    
    try {
      await connection.send(takeResponseMessage);
    } catch(e) {
      this._logger.error(e.stack);
    }
  };

  async takeResponseMessageHandler (message, connection) {
    let jobIdsResponded = [];

    const isValidTakeResponseForJobId = (jobId) => {
      if(!this._work.hasOwnProperty(jobId)) {
        this._logger.error(`Invalid job id: '${jobId}'!`);
        return false;
      }

      if(!this._work[jobId].available.hasOwnProperty(
        connection.remoteSignature)) {
          this._logger.error(
            `Response from ineligible worker: '${connection.remoteSignature}'!`);
          this._logger.error(
            `Eligble workers: ${Object.keys(this._work[jobId].available)}`);
          return false;
      }

      if(this._work[jobId].available[connection.remoteSignature] === true) {
        this._logger.error(
          `Worker with signature '${connection.remoteSignature}' already ` +
          `responded!`);
        return false;
      }

      return true;
    };

    /*
     * Process 'got' first; if response contains 'got' and 'drop' for the same
     * job id, then this order will ensure the job will be dropped (default to 
     * ignoring peer's response as it was malformed or invalid).
     */
    if(message.got && message.got.length > 0) {
      for(let jobId of message.got) {
        if(!isValidTakeResponseForJobId(jobId)) continue;
        
        this._work[jobId].confirmed++;
        this._work[jobId].responses++;
        this._work[jobId].available[connection.remoteSignature] = true;
        
        if(!jobIdsResponded.includes(jobId)) {
          jobIdsResponded.push(jobId);
        }
      }
    }

    if(message.drop && message.drop.length > 0) {
      for(let jobId of message.drop) {
        if(!isValidTakeResponseForJobId(jobId)) continue;
          
        this._work[jobId].dropped++;
        this._work[jobId].responses++;
        this._work[jobId].available[connection.remoteSignature] = true;

        if(!jobIdsResponded.includes(jobId)) {
          jobIdsResponded.push(jobId);
        }
      }
    }
    
    for(let jobId of jobIdsResponded) {
      if(this._work[jobId].responses >= this._work[jobId].needed) {
        if(this._work[jobId].confirmed >= this._work[jobId].needed) {
          this._logger.log(`${this.port} has received all necessary responses; ` + 
            `starting work on: ${jobId}`);
          
          this.processJob(jobId);
        } else {
          this._logger.log(`${this.port} has received all necessary responses ` + 
            `but job was not approved by one or more other peers; dropping ` + 
            `job: ${jobId}`);
          this.removeJob(jobId);
        }
      }
    }
  };

  jobMessageHandler (message, connection) {
    const { job } = message; 
    const jobId = this.getJobId(job);

    this._logger.log(`${this.port} received a new job: ${jobId}`);

    if(!this._workQueue.hasOwnProperty(jobId)) {
      this._workQueue[jobId] = job;
    }
  };

  async processJob (jobId) {
    this._logger.log(colors.Background.White, colors.Foreground.Blue, 
      `${this.port} is starting work on job: ${jobId}`, colors.Reset);

    // Simualte working on a job...
    await new Promise((resolve) => {
      setTimeout(() => {
          return resolve();
        }, parseInt(Math.random()*20000));
    });
    return this.completeJob(jobId);
  };

  async completeJob (jobId) {
    this._logger.log(colors.Background.White, colors.Foreground.Green, 
      `${this.port} has completed work on job: ${jobId}`, colors.Reset);
    this.removeJob(jobId);
    delete this._work[jobId];
    delete this._workQueue[jobId];
    return this.sendJobResult(jobId);
  };

  async sendJobResult (jobId) {
    const completeMessage = new JobResultMessage({ jobId });
    try {
      await this.broadcast(completeMessage);
    } catch(e) {
      this._logger.error(e.stack);
    }
  };

  jobResultMessageHandler (message, connection) {
    const { jobId } = message; 
    if(this._workQueue.hasOwnProperty(jobId)) {
      delete this._workQueue[jobId];
    }
  };
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const args = (new Expectation({
    'seed': "", // optional
    'port': "", // optional
    'peers': [","], // optional
    'ring': "", // required
    'private': "", // optional
    'public': "", // optional
    'signature': "", // required (peer won't start without)
    'd': "", // optional debug mode
    'range': [","] // optional discovery range])
  })).args;

if(!args.ring || !args.private || !args.signature) {
  throw new Error(
    `Must provide valid ring and private keys, and peer signature!`);
  process.exit(1);
}

let alphabet = "abcdefghijklmnopqrstuvwxyz";
let sharedQueue = [];

const seed = args.seed;
let toDiscover = args.peers ? args.peers : [];

const seedUrl = lookupSeed(seed);
toDiscover.push(seedUrl);

const worker = new Worker({
  httpsServerConfig: {
    port: args.port ? args.port : 26780
  },
  discoveryConfig: {
    addresses: toDiscover,
    range: {
      start: args.range && args.range[0] ? args.range[0] : 26780,
      end: args.range && args.range[1] ?  args.range[1] : 26790
    }
  },
  signaturePath: args.signature,
  publicKeyPath: args.private,
  privateKeyPath: args.private,
  ringPublicKeyPath: args.ring,
  logger: args.d ? console : fakeLogger
});

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const loop = () => {
  return new Promise((success, failure) => {
      // Simulate getting available jobs. This could be replaced with a DB 
      // lookup, bus dequeue, etc., as your application sees fit.
      let availableJobs = { ...worker.workQueue };

      // Remove jobs that this peer is already working on (if any)...
      if(worker.work) {
        for(let jobId of Object.keys(worker.work)) {
          if(availableJobs.hasOwnProperty(jobId)) {
            delete availableJobs[jobId];
          }
        }
      }

      // Return remaining, available jobs
      return success(availableJobs);
    }).then(results => {
      const jobIds = Object.keys(results);
      if(results && jobIds.length > 0) {
        // Only choose a single job to process
        let randomJobId = 
          jobIds[parseInt(Math.floor(Math.random()*jobIds.length))];
        let singleJob = results[randomJobId];
        
        return worker.broadcastTake(singleJob);
      } else {
        return Promise.resolve();
      }
    }).catch(e => {
      console.error(`Loop error: `);
      console.error(e.stack);
    }).then(() => {
      return new Promise((success, failure) => {
        // Psuedo-random delay anywhere from 1s to 2s
        let timeout = 1000 + (parseInt(Math.floor(Math.random()*1000)));
        console.log(`${worker.port} waiting for ${timeout}ms`);
        
        setTimeout(() => {
          return success();
        }, timeout);
      });
    }).then(loop);
};

const main = async () => {
  try {
    console.log(`Initializing worker...`);
    await worker.init();
    console.log(`Worker initialized.`);

    console.log(`Worker starting discovery...`);
    await worker.discover();
    console.log(`Worker finished discovery.`);
  } catch(e) {
    console.error(e.stack);
  }

  // On a 5s interval, create a 'psuedo' job and simulate a peer receiving it.
  setInterval(async function() {
    // Simulate random, async job posting...
    if(parseInt(Math.random() * 5) === 0) {
      const job = {
        data: {
          something: 
            alphabet[parseInt(Math.floor(Math.random()*alphabet.length))]
        },
        salt: crypto.randomBytes(8).toString('hex')
      }

      const jobMessage = new JobMessage({ job });

      worker.jobMessageHandler(jobMessage);

      console.log(`New jobs queue:`);
      for(let jobId of Object.keys(worker.workQueue)) {
        console.log(`\t${util.inspect(jobId, {colors: true, depth: null})}`);
      }

      try {
        await worker.broadcast(jobMessage);
      } catch(e) {
        console.error(e.stack);
      }
    }
  }, 5000);

  console.log(`Worker ready, starting loop...`);
  return loop();
};

main().then(() => {
  process.exit(0);
});