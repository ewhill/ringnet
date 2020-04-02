"use strict";

const crypto = require('crypto');
const util = require('util');

const { Peer, Message } = require('../index.js');

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

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
    port,
    publicAddress: `127.0.0.1:${port}`,
    discoveryAddresses: toDiscover,
    signature: `${keyNames[i]}.peer.signature`,
    publicKey: `${keyNames[i]}.peer.pub`,
    privateKey: `${keyNames[i]}.peer.pem`,
    ringPublicKey: `.ring.pub`,
    // debug: true
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

const broadcastTake = (peer, jobs) => {
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
  
  let takeMessage = new Message({
    type: 'take',
    body: {
      jobs: jobsObject,
      timestamp
    }
  });
  
  console.log(`${peer.port} requests to take: ${takeJobIds}`);
  
  try {
    peer.broadcast(takeMessage);
  } catch(e) {
    console.error(e.stack);
  }
};

const takeRequestHandler = (peer, { message, connection }) => {
  let got = [];
  let drop = [];
    
  if(peer.jobs && Object.keys(peer.jobs).length > 0) {
    if(message.body.hasOwnProperty("timestamp") && 
      typeof message.body.timestamp == "number") {
        try {
          message.body.timestamp = new Date(message.body.timestamp);
        } catch(e) {}
    } else {
      console.log(`message.body.timestamp ` + 
        `(${typeof message.body.timestamp}): ${message.body.timestamp}`);
    }
    
    if(message.body.jobs && message.body.jobs) {
      const remoteJobIds = Object.keys(message.body.jobs);
      const localJobIds = Object.keys(peer.jobs);

      for(let remoteJobId of remoteJobIds) {
        if(localJobIds.indexOf(remoteJobId) > -1) {
          const difference = 
            (message.body.timestamp - peer.jobs[remoteJobId].enqueued);
          
          if(difference > 0) {
            // Job ${message.body.jobs[id]} DOES conflict, will be DROPPED!
            drop.push(remoteJobId);
          } else if(difference === 0) {
            // Both jobs were enqueued at EXACTLY the same time. Cannot 
            // proceed, and both peers must drop the job.
            drop.push(remoteJobId);
            delete peer.jobs[remoteJobId];
          } else {
            // Job ${message.body.jobs[id]} conflicts but was enqueued by 
            // peer before it was locally enqueued. The job will be 
            // confirmed to peer and dropped locally.
            got.push(remoteJobId);
            delete peer.jobs[remoteJobId];
          }
        } else {
          // Job ${message.body.jobs[i]} DOES NOT conflict, will be CONFIRMED.
          got.push(remoteJobId);
        }
      }
    }
  } else {
    // Peer received 'take' message and does not have jobs in queue. All 
    // requested jobs will be confirmed.
    got = Object.keys(message.body.jobs);
  }
  
  let takeResultMessage = new Message({
    'type': 'takeResult',
    'body': { got, drop }
  });
  
  try {
    peer.broadcast({ message: takeResultMessage, connection });
  } catch(e) {
    console.error(e.stack);
  }
};

const takeResultHandler = (peer, { message, connection }) => {
  let jobIdsResponded = [];

  if(message.body.hasOwnProperty("got") && Array.isArray(message.body.got)) {
    for(let id of message.body.got) {
      if(!peer.jobs.hasOwnProperty(id)) continue;
      
      peer.jobs[id].confirmed++;
      peer.jobs[id].responses++;
      
      if(jobIdsResponded.indexOf(id) < 0) {
        jobIdsResponded.push(id);
      }
    }
  }
  
  if(message.body.hasOwnProperty("drop") && Array.isArray(message.body.drop)) {
    for(let id of message.body.drop) {
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
          
          processJob(peer, id);
      } else {
        console.log(`${peer.port} has received all necessary responses ` + 
          `but job was not approved by one or more other peers; dropping ` + 
          `job: ${id}`);
        delete peer.jobs[id];
      }
    }
  }
};

const jobHandler = (peer, { message, connection }) => {
  const jobId = getJobId(message.body.job);

  if(!peer.jobsQueue.hasOwnProperty(jobId)) {
    peer.jobsQueue[jobId] = message.body.job;
  }
};

const processJob = (peer, jobId) => {
  console.log(`${peer.port} is starting work on job: ${jobId}`);

  setTimeout(() => {
    completeJob(peer, jobId);
  }, parseInt(Math.random()*20000));
};

const completeJob = (peer, jobId) => {
  console.log(`${peer.port} has completed work on job: ${jobId}`);
  delete peer.jobsQueue[jobId];
  sendJobResult(peer, jobId);
};

const sendJobResult = (peer, jobId) => {
  const completeMessage = new Message({
    type: 'jobResult',
    body: { jobId }
  });
  peer.broadcast(completeMessage);
};

const jobResultHandler = (peer, { message, connection }) => {
  if(peer.jobsQueue.hasOwnProperty(message.body.jobId)) {
    delete peer.jobsQueue[message.body.jobId];
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
      // Psuedo-random delay anywhere from 10s to 20s
      let timeout = 50 + (parseInt(Math.floor(Math.random()*50)));
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
  setInterval(function() {
    const job = {
      data: {
        something: alphabet[parseInt(Math.floor(Math.random()*alphabet.length))]
      },
      salt: crypto.randomBytes(8).toString('hex')
    }

    // Simulate a job receiving a job.
    const randomPeer = peers[parseInt(Math.floor(Math.random()*peers.length))];
    const jobMessage = new Message({
        type: 'job',
        body: { job }
      });

    jobHandler(randomPeer, { message: jobMessage });

    console.log(`New jobs queue:`);
    for(let jobId of Object.keys(randomPeer.jobsQueue)) {
      console.log(`\t${util.inspect(jobId, {colors: true, depth: null})}`);
    }

    randomPeer.broadcast(jobMessage);
  }, 5000);

  console.log(`Peers linked, starting loops...`);

  let promises = [];
  for(let peer of peers) {
    peer.on('job', (o) => { return jobHandler(peer, o); });
    peer.on('take', (o) => { return takeRequestHandler(peer, o); });
    peer.on('takeResult', (o) => { return takeResultHandler(peer, o); });
    peer.on('jobResult', (o) => { return jobResultHandler(peer, o); });

    peer.jobsQueue = {};
    promises.push(loop(peer));
  }

  return Promise.all(promises);
};

main().then(() => {
  process.exit(0);
});