"use strict";
const { Peer, PeerMessage, PeerMessageQueue, Expectation } 
  = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

let alphabet = "abcdefghijklmnopqrstuvwxyz";
let sharedQueue = [];

let nPeers = 3;
let peers = [];
let keyNames = ["first", "second", "third" ];

for(let i=0,lastPort=26780; i<nPeers; i++,lastPort=(26780+i-1)) {
  let options = {
    'port': (26780 + i),
    'publicAddress': '127.0.0.1',
    'discoveryAddresses': (i>0 ? [ `127.0.0.1:${lastPort}` ] : []),
    'signature': keyNames[i]+".peer.signature",
    'publicKey': keyNames[i]+".peer.pub",
    'privateKey': keyNames[i]+".peer.pem",
    'ringPublicKey': ".ring.pub",
    'debug': false
  };
  
  peers.push(new Peer(options));
}

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

var broadcastTake = (peer, jobs) => {
  if(jobs && !Array.isArray(jobs))
    jobs = [jobs];
    
  let jobsToSend = jobs.slice(0);
  let timestamp = (new Date()).getTime();
  
  for(let i=0; i<jobs.length; i++) {
    jobs[i] = {
      'needed': peer.peers.length,
      'responses': 0,
      'confirmed': 0,
      'dropped': 0,
      'enqueued': timestamp,
      'job': jobs[i]
    };
  }
  
  peer.jobs = jobs;
  
  let takeMessage = new PeerMessage({
    'type': 'take',
    'body': {
      'jobs': jobsToSend,
      'timestamp': timestamp
    }
  });
  
  console.log(`${peer.port} is ` + 
    `sending take message: ${takeMessage}`);
  
  peer.broadcast(takeMessage);
};

var takeHandler = (peer, { message, connection }) => {
  let got = [];
  let drop = [];
    
  if(peer.jobs && Array.isArray(peer.jobs) && peer.jobs.length > 0) {
    console.log(`${peer.port} received 'take' ` + 
      `message and has jobs in queue already.`);
      
    let incomingAfterSent = false;
    
    if(message.body.hasOwnProperty("timestamp") && typeof message.body.timestamp == "number") {
      try {
        message.body.timestamp = new Date(message.body.timestamp);
      } catch(e) {}
    } else {
      console.log(`message.body.timestamp (${typeof message.body.timestamp}): ${message.body.timestamp}`);
    }
    
    if(message.body.jobs && Array.isArray(message.body.jobs)) {
      for(let i=0; i<message.body.jobs.length; i++) {
        let found = false;
       
        for(let j=peer.jobs.length-1; j>=0; j--) {
          if(JSON.stringify(message.body.jobs[i]) == JSON.stringify(peer.jobs[j].job)) {
            found = true;
            let difference = (message.body.timestamp - peer.jobs[j].enqueued);
            
            if(difference > 0) {
              // Job ${message.body.jobs[i]} DOES conflict and will be DROPPED!
              
              drop.push(message.body.jobs[i]);
            } else if(difference === 0) {
              // Both jobs were enqueued at EXACTLY the same time. Cannot proceed,
              // and both peers must drop the job.
              
              drop.push(message.body.jobs[i]);
              peer.jobs.splice(j,1);
            } else {
              // Job ${message.body.jobs[i]} conflicts but was enqueued
              // by peer before it was locally enqueued. The job will be confirmed
              // to peer and dropped locally.
                
              got.push(message.body.jobs[i]);
              peer.jobs.splice(j,1);
            }
            
            break;
          }
        }
        
        if(!found) {
          // Job ${message.body.jobs[i]} does not conflict and will be CONFIRMED.
          got.push(message.body.jobs[i]);
        }
      }
    }
  } else {
    // Peer received 'take' message and doew not have jobs in queue. All requested 
    // jobs will be confirmed.
      
    got = message.body.jobs;
  }
  
  let takeResultMessage = new PeerMessage({
    'type': 'takeResult',
    'body': { got, drop }
  });
  
  console.log(`\t${peer.port} is sending 'takeResult' ` + 
      `message back to peer: ${takeResultMessage}`);
  
  peer.broadcast(takeResultMessage, connection);
};

var takeResultHandler = (peer, { message, connection }) => {
  if(message.body.hasOwnProperty("got") && Array.isArray(message.body.got)) {
    for(let i=0; i<message.body.got.length; i++) {
      for(let j=0; j<peer.jobs.length; j++) {
        if(JSON.stringify(message.body.got[i]) == JSON.stringify(peer.jobs[j].job)) {
          console.log(`\t${peer.port} has received 'got' `+
            `for job: ${message.body.got[i]}`);
            
          peer.jobs[j].confirmed++;
          peer.jobs[j].responses++;
        }
      }
    }
  }
  
  if(message.body.hasOwnProperty("drop") && Array.isArray(message.body.drop)) {
    for(let i=0; i<message.body.drop.length; i++) {
      for(let j=0; j<peer.jobs.length; j++) {
        if(JSON.stringify(message.body.drop[i]) == JSON.stringify(peer.jobs[j].job)) {
          console.log(`\t${peer.port} has received 'drop' `+
            `for job: ${message.body.drop[i]}`);
            
          peer.jobs[j].dropped++;
          peer.jobs[j].responses++;
        }
      }
    }
  }
  
  for(let j=peer.jobs.length-1; j>=0; j--) {
    if(peer.jobs[j].responses >= peer.jobs[j].needed) { 
      if(peer.jobs[j].confirmed >= peer.jobs[j].needed && peer.jobs[j].dropped === 0) {
        console.log(`\t${peer.port} has received all necessary `+
          `responses for job and will begin processing: ${peer.jobs[j].job}`);
        
        processJob(peer.jobs.splice(j,1)[0].job);
      } else {
        console.log(`\t${peer.port} has received all necessary `+
          `responses for job but job was dropped by one or more peers; dropping job.`);
        
        peer.jobs.splice(j,1);
      }
    }
  }
};

var processJob = (job) => {
  setTimeout(() => {
    for(let i=sharedQueue.length-1; i>=0; i--) {
      if(JSON.stringify(sharedQueue[i]) == JSON.stringify(job)) {
        console.log(`Job ${job} completed, removing it from the queue.`);
        sharedQueue.splice(i,1);
        console.log(`New sharedQueue: [ ${sharedQueue} ]`);
      }
    }
  }, 20000);
};


for(let peer of peers) {
  peer.on('take', (o) => { return takeHandler(peer, o); });
  peer.on('takeResult', (o) => { return takeResultHandler(peer, o); });
}

var loop = (peer) => {
  return new Promise((success, failure) => {
    return success(sharedQueue);
  })
  .then(results => {
    if(results && Array.isArray(results) && results.length > 0) {
      // Only choose a single job to process
      let rNum = parseInt(Math.floor(Math.random()*results.length));
      let singleJob = results.slice(rNum, rNum+1);
      
      console.log(`${peer.port} will ` + 
        `request to take job: ${singleJob}`);
      
      broadcastTake(peer, singleJob);
      return Promise.resolve();
    } else {
      return Promise.resolve();
    }
  })
  .catch(e => {
    console.error(`Loop error: ${JSON.stringify(e)}`);
  }).then(() => {
    return new Promise((success, failure) => {
      // Psuedo-random delay anywhere from 30s to 60s
      let timeout = 30000 + (parseInt(Math.floor(Math.random()*30000)));
      console.log(`continuing loop in ${timeout}ms`);
      
      setTimeout(() => {
        return success(peer);
      }, timeout);
    });
  }).then(loop);
};

// On a 10s interval, add a random letter from 'alphabet' into 'sharedQueue'
setInterval(function() {
  sharedQueue.push(alphabet[parseInt(Math.floor(Math.random()*alphabet.length))]);
  console.log(`New sharedQueue: [ ${sharedQueue} ]`);
}, 10000);

peers[peers.length-1].on('ready', () => {
  setTimeout(() => {
    console.log(`Peers linked, starting loops...`);
    
    let promises = [];
    
    for(let i=0; i<peers.length; i++)
      promises.push(loop(peers[i]));
    
    Promise.all(promises);
  }, 11000);
});