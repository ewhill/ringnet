"use strict";

const crypto = require('crypto');
const util = require('util');

const Expectation = require('./expectation');
const { Peer, Message } = require('../index.js');

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

class Worker extends Peer {
  _work = {};
  _workQueue = [];

  constructor(options) {
    super(options);

    this.bind(JobMessage).to(this.jobMessageHandler);
    this.bind(TakeRequestMessage).to(this.takeRequestMessageHandler);
    this.bind(TakeResponseMessage).to(this.takeResponseMessageHandler);
    this.bind(JobResultMessage).to(this.jobResultMessageHandler);
  }

  get work() {
    return this._work;
  }

  get workQueue() {
    return this._workQueue.slice(0);
  }

  hasJob(id) {
    return this._work.hasOwnProperty[id];
  }

  getJob(id) {
    if(!this.hasJob(id)) {
      throw new Error(`Cannot find job for id '${id}'!`);
    }
    return this._work[id];
  }

  addJob(job) {
    const jobId = getJobId(job);
    this._work[jobId] = {
      // Want everyone to respond, can be updated to > 50% as you see fit
      needed: this.peers.length,
      responses: 0,
      confirmed: 0,
      dropped: 0,
      enqueued: timestamp,
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

  async broadcastTake (jobs) {
    if(jobs && !Array.isArray(jobs)) {
      jobs = [jobs];
    }
      
    let jobsObject = {};
    let takeJobIds = [];
    let timestamp = (new Date()).getTime();
    
    for(let i=0; i<jobs.length; i++) {
      const jobId = this.addJob(jobs[i]);

      jobsObject[jobId] = {
        enqueued: timestamp,
        job: jobs[i]
      };

      takeJobIds.push(jobId);
    }
    
    let takeMessage = new TakeRequestMessage({ jobs: jobsObject, timestamp });
    
    console.log(`${this.port} requests to take: ${takeJobIds}`);
    
    try {
      await this.broadcast(takeMessage);
    } catch(e) {
      console.error(e.stack);
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
        console.log(`message.timestamp ` + 
          `(${typeof message.timestamp}): ${message.timestamp}`);
      }
      
      if(message.jobs) {
        const remoteJobIds = Object.keys(message.jobs);
        const localJobIds = Object.keys(this._work);

        for(let remoteJobId of remoteJobIds) {
          if(localJobIds.indexOf(remoteJobId) > -1) {
            const difference = 
              (message.timestamp - this._work[remoteJobId].enqueued);
            
            if(difference > 0) {
              // Job ${message.jobs[id]} DOES conflict, will be DROPPED!
              drop.push(remoteJobId);
            } else if(difference === 0) {
              // Both jobs were enqueued at EXACTLY the same time. Cannot 
              // proceed, and both peers must drop the job.
              drop.push(remoteJobId);
              this.removeJob(remoteJobId);
            } else {
              // Job ${message.jobs[id]} conflicts but was enqueued by 
              // peer before it was locally enqueued. The job will be 
              // confirmed to peer and dropped locally.
              got.push(remoteJobId);
              this.removeJob(remoteJobId);
            }
          } else {
            // Job ${message.jobs[i]} DOES NOT conflict, will be CONFIRMED.
            got.push(remoteJobId);
          }
        }
      }
    } else {
      // Peer received 'take' message and does not have jobs in queue. All 
      // requested jobs will be confirmed.
      got = Object.keys(message.jobs);
    }
    
    let takeResponseMessage = new TakeResponseMessage({ got, drop });
    
    try {
      await connection.send(takeResponseMessage);
    } catch(e) {
      console.error(e.stack);
    }
  };

  async takeResponseMessageHandler (message, connection) {
    let jobIdsResponded = [];

    if(message.got && Array.isArray(message.got)) {
      for(let jobId of message.got) {
        if(!this._work.hasOwnProperty(jobId)) continue;
        
        this._work[jobId].confirmed++;
        this._work[jobId].responses++;
        
        if(jobIdsResponded.indexOf(jobId) < 0) {
          jobIdsResponded.push(jobId);
        }
      }
    }
    
    if(message.drop && Array.isArray(message.drop)) {
      for(let jobId of message.drop) {
        if(!this._work.hasOwnProperty(jobId)) continue;
          
        this._work[jobId].dropped++;
        this._work[jobId].responses++;

        if(jobIdsResponded.indexOf(jobId) < 0) {
          jobIdsResponded.push(jobId);
        }
      }
    }
    
    for(let jobId of jobIdsResponded) {
      if(this._work[jobId].responses >= this._work[jobId].needed) {
        if(this._work[jobId].confirmed >= this._work[jobId].needed) {
          console.log(`${this.port} has received all necessary responses; ` + 
            `starting work on: ${jobId}`);
          
          this.processJob(jobId);
        } else {
          console.log(`${this.port} has received all necessary responses ` + 
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

    if(!this._workQueue.hasOwnProperty(jobId)) {
      this._workQueue[jobId] = job;
    }
  };

  async processJob (peer, jobId) {
    console.log(`${this.port} is starting work on job: ${jobId}`);

    // Simualte working on a job...
    await new Promise((resolve) => {
      setTimeout(() => {
          return resolve();
        }, parseInt(Math.random()*20000));
    });
    return this.completeJob(jobId);
  };

  async completeJob (jobId) {
    console.log(`${this.port} has completed work on job: ${jobId}`);
    this.removeJob(jobId);
    return this.sendJobResult(jobId);
  };

  async sendJobResult (jobId) {
    const completeMessage = new JobResultMessage({ jobId });
    try {
      await this.broadcast(completeMessage);
    } catch(e) {
      console.error(e.stack);
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

const sink = () => {};
const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

let alphabet = "abcdefghijklmnopqrstuvwxyz";
let sharedQueue = [];

const worker = new Worker({
  httpsServerConfig: {
    port: args.port ? args.port : 26780
  },
  discoveryConfig: {
    addresses: args.peers ? args.peers : [],
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
    if(worker.jobs) {
      for(let jobId of Object.keys(worker.jobs)) {
        if(availableJobs.hasOwnProperty(jobId)) {
          delete availableJobs[jobId];
        }
      }
    }

    // Return remaining, available jobs
    return success(availableJobs);
  })
  .then(results => {
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
  })
  .catch(e => {
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
    if (parseInt(Math.random() * 5) === 0) {
      const job = {
        data: {
          something: alphabet[parseInt(Math.floor(Math.random()*alphabet.length))]
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