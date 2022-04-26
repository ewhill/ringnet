"use strict";

const crypto = require('crypto');
const util = require('util');

const { Peer, Message } = require('../index.js');

class TakeRequestMessage extends Message {
  constructor(options = {}) {
    super();
    const { jobs=[], timestamp=Date.now() } = options;
    this.jobs = jobs;
    this.timestamp = timestamp;
  }

  get jobs() { return this.body.jobs; }
  set jobs(value) { this.body.jobs = value; }
  get timestamp() { return this.body.timestamp; }
  set timestamp(value) { this.body.timestamp = value; };
}

class JobMessage extends Message {
  constructor(options = {}) {
    super();
    const { job={} } = options;
    this.job = job;
  }

  get job() { return this.body.job; }
  set job(value) { this.body = { ...this.body, job: value }; }
}

class TakeResponseMessage extends Message {
  constructor(options = {}) {
    super();
    const { got=[], drop=[] } = options;
    this.got = got;
    this.drop = drop;
  }

  get got() { return this.body.got; }
  set got(value) { this.body.got = value; }
  get drop() { return this.body.drop; }
  set drop(value) { this.body.drop = value; }
}

class JobResultMessage extends Message {
  constructor(options = {}) {
    super();
    const { jobId } = options;
    this.jobId = jobId;
  }

  get jobId() { return this.body.jobId; }
  set jobId(value) { this.body.jobId = value; }
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const sink = () => {};
const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

let alphabet = "abcdefghijklmnopqrstuvwxyz";
let sharedQueue = [];

let nPeers = 3;
let peers = [];
let keyNames = ["first", "second", "third" ];
const startingPort = 26780;

const discoveryAddresses = 
  (Array.from(new Array(nPeers)))
    .map((e, i) => `127.0.0.1:${(startingPort+i)}`);

console.log(discoveryAddresses);

for(let i=0; i<nPeers; i++) {
  const port = (startingPort + i);

  const addressesExcludingOwn = discoveryAddresses.slice(0);
  const index = addressesExcludingOwn.indexOf(`127.0.0.1:${(startingPort+i)}`);
  addressesExcludingOwn.splice(index, 1);
  const toDiscover = i == 0 ? [] : addressesExcludingOwn;

  let options = {
    httpsServerConfig: {
      port,
    },
    discoveryConfig: {
      addresses: toDiscover,
      range: {
        start: 26780,
        end: 26790,
      }
    },
    signaturePath: `${keyNames[i]}.peer.signature`,
    publicKeyPath: `${keyNames[i]}.peer.pub`,
    privateKeyPath: `${keyNames[i]}.peer.pem`,
    ringPublicKeyPath: `.ring.pub`,
    publicAddress: `127.0.0.1:${port}`,
    logger: fakeLogger
  };

  peers.push(new Peer(options));
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const getJobId = (job) => {
  return crypto
      .createHash('sha256')
      .update(JSON.stringify(job))
      .digest('hex');
}

const broadcastTake = async (peer, jobs) => {
  if(jobs && !Array.isArray(jobs)) {
    jobs = [jobs];
  }

  if(!peer.hasOwnProperty('jobs')) {
    peer.jobs = {};
  }
    
  let jobsObject = {};
  let takeJobIds = [];
  let timestamp = (new Date()).getTime();
  
  for(let i=0; i<jobs.length; i++) {
    const jobData = jobs[i];
    const jobId = getJobId(jobData);

    takeJobIds.push(jobId);

    jobsObject[jobId] = {
      'enqueued': timestamp,
      'job': jobData
    };

    peer.jobs[jobId] = {
      // Want everyone to respond, can be updated to > 50% as you see fit
      needed: peer.peers.length,
      responses: 0,
      confirmed: 0,
      dropped: 0,
      ...jobsObject[jobId]
    };
  }
  
  let takeMessage = new TakeRequestMessage({ jobs: jobsObject, timestamp });
  
  console.log(`${peer.port} requests to take: ${takeJobIds}`);
  
  try {
    await peer.broadcast(takeMessage);
  } catch(e) {
    console.error(e.stack);
  }
};

const takeRequestMessageHandler = async (peer, message, connection) => {
  let got = [];
  let drop = [];
    
  if(peer.jobs && Object.keys(peer.jobs).length > 0) {
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
      const localJobIds = Object.keys(peer.jobs);

      for(let remoteJobId of remoteJobIds) {
        if(localJobIds.indexOf(remoteJobId) > -1) {
          const difference = 
            (message.timestamp - peer.jobs[remoteJobId].enqueued);
          
          if(difference > 0) {
            // Job ${message.jobs[id]} DOES conflict, will be DROPPED!
            drop.push(remoteJobId);
          } else if(difference === 0) {
            // Both jobs were enqueued at EXACTLY the same time. Cannot 
            // proceed, and both peers must drop the job.
            drop.push(remoteJobId);
            delete peer.jobs[remoteJobId];
          } else {
            // Job ${message.jobs[id]} conflicts but was enqueued by 
            // peer before it was locally enqueued. The job will be 
            // confirmed to peer and dropped locally.
            got.push(remoteJobId);
            delete peer.jobs[remoteJobId];
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

const takeResponseMessageHandler = async (peer, message, connection) => {
  let jobIdsResponded = [];

  if(message.got && Array.isArray(message.got)) {
    for(let id of message.got) {
      if(!peer.jobs.hasOwnProperty(id)) continue;
      
      peer.jobs[id].confirmed++;
      peer.jobs[id].responses++;
      
      if(jobIdsResponded.indexOf(id) < 0) {
        jobIdsResponded.push(id);
      }
    }
  }
  
  if(message.drop && Array.isArray(message.drop)) {
    for(let id of message.drop) {
      if(!peer.jobs.hasOwnProperty(id)) continue;
        
      peer.jobs[id].dropped++;
      peer.jobs[id].responses++;

      if(jobIdsResponded.indexOf(id) < 0) {
        jobIdsResponded.push(id);
      }
    }
  }
  
  for(let id of jobIdsResponded) {
    if(peer.jobs[id].responses >= peer.jobs[id].needed) {
      if(peer.jobs[id].confirmed >= peer.jobs[id].needed) {
          console.log(`${peer.port} has received all necessary responses; ` + 
            `starting work on: ${id}`);
          
          return processJob(peer, id);
      } else {
        console.log(`${peer.port} has received all necessary responses ` + 
          `but job was not approved by one or more other peers; dropping ` + 
          `job: ${id}`);
        delete peer.jobs[id];
      }
    }
  }
};

const jobMessageHandler = (peer, message, connection) => {
  const jobId = getJobId(message.job);

  if(!peer.jobsQueue.hasOwnProperty(jobId)) {
    peer.jobsQueue[jobId] = message.job;
  }
};

const processJob = async (peer, jobId) => {
  console.log(`${peer.port} is starting work on job: ${jobId}`);

  await new Promise((resolve) => {
    setTimeout(() => {
        return resolve();
      }, parseInt(Math.random()*20000));
  });
  return completeJob(peer, jobId);
};

const completeJob = async (peer, jobId) => {
  console.log(`${peer.port} has completed work on job: ${jobId}`);
  delete peer.jobsQueue[jobId];
  return sendJobResult(peer, jobId);
};

const sendJobResult = async (peer, jobId) => {
  const completeMessage = new JobResultMessage({ jobId });
  try {
    await peer.broadcast(completeMessage);
  } catch(e) {
    console.error(e.stack);
  }
};

const jobResultMessageHandler = (peer, message, connection) => {
  if(peer.jobsQueue.hasOwnProperty(message.jobId)) {
    delete peer.jobsQueue[message.jobId];
  }
};

const loop = (peer) => {
  return new Promise((success, failure) => {
    // Simulate getting available jobs. This could be replaced with a DB 
    // lookup, bus dequeue, etc., as your application sees fit.
    let availableJobs = { ...peer.jobsQueue };

    // Remove jobs that this peer is already working on (if any)...
    if(peer.jobs) {
      for(let jobId of Object.keys(peer.jobs)) {
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
      
      return broadcastTake(peer, singleJob);
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
      console.log(`${peer.port} waiting for ${timeout}ms`);
      
      setTimeout(() => {
        return success(peer);
      }, timeout);
    });
  }).then(loop);
};

const main = async () => {
  console.log(`Initializing...`);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  for(let i=0; i<peers.length; i++) {
    console.log(`Initializing peer[${i}]...`);
    try {
      await peers[i].init();
    } catch(e) {
      console.error(e.stack);
    }
    console.log(`peer[${i}] initialized.`);
  }

  for(let i=1; i<peers.length; i++) {
    console.log(`peer[${i}] starting discovery...`);
    await peers[i].discover();
    console.log(`peer[${i}] finished discovery.`);
  }

  // On a 5s interval, create a 'psuedo' job and simulate a peer receiving it.
  setInterval(async function() {
    const job = {
      data: {
        something: alphabet[parseInt(Math.floor(Math.random()*alphabet.length))]
      },
      salt: crypto.randomBytes(8).toString('hex')
    }

    // Simulate a job receiving a job.
    const randomPeer = peers[parseInt(Math.floor(Math.random()*peers.length))];
    const jobMessage = new JobMessage({ job });

    jobMessageHandler(randomPeer, jobMessage);

    console.log(`New jobs queue:`);
    for(let jobId of Object.keys(randomPeer.jobsQueue)) {
      console.log(`\t${util.inspect(jobId, {colors: true, depth: null})}`);
    }

    try {
      await randomPeer.broadcast(jobMessage);
    } catch(e) {
      console.error(e.stack);
    }
  }, 5000);

  console.log(`Peers linked, starting loops...`);

  let promises = [];
  for(let peer of peers) {
    peer.bind(JobMessage).to(
      (message, connection) => 
        jobMessageHandler(peer, message, connection));
    peer.bind(TakeRequestMessage).to(
      (message, connection) => 
        takeRequestMessageHandler(peer, message, connection));
    peer.bind(TakeResponseMessage).to(
      (message, connection) => 
        takeResponseMessageHandler(peer, message, connection));
    peer.bind(JobResultMessage).to(
      (message, connection) => 
        jobResultMessageHandler(peer, message, connection));

    peer.jobsQueue = {};
    promises.push(loop(peer));
  }

  return Promise.all(promises);
};

main().then(() => {
  process.exit(0);
});