"use strict";

const fs = require('fs');
const dns = require('dns');
const url = require('url');
const readline = require('readline');

const { Peer, PeerMessage, Expectation } = require('../index.js');

const args = (new Expectation({
    'seed': "", // optional
    'port': "", // optional (defaults to 26781)
    'peers': [","], // optional (defaults to [])
    'ring': "", // required (defaults to ring.pub)
    'private': "", // optional (defaults to peer.pem)
    'public': "", // optional (defaults to peer.pub)
    'signature': "", // required (peer won't start without)
    'd': "", // optional
    'range': [","] // optional (defaults to [26780,26790])
  })).args;

const nslookup = (host) => {
  return new Promise((resolve, reject) => {
    dns.resolve(host, (err, result) => {
      return err ? reject(err) : resolve(result);
    });
  });
};

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

const SEED_HOST = args.seed || process.env.RINGNET_SEED;

var task = Promise.resolve(false);
try {
  var SEED_HOST_URL = url.parse(SEED_HOST);
  task = nslookup(SEED_HOST_URL.hostname || SEED_HOST_URL.href);
} catch(e) {
  // Proceed, task stays as Promise.resolve
}

if(!args.peers) args.peers = [];

return task
  .then(ips => {
    console.log(ips);
    if(ips && Array.isArray(ips) && ips.length > 0) {
      if(SEED_HOST_URL.hostname) {
        SEED_HOST_URL.hostname = ips[0]; // Change the hostname (minus port)
      } else {
        SEED_HOST_URL.href = ips[0];
      }
      
      args.peers.push(SEED_HOST_URL.href); // ... and tack the port back on
    }
  })
  .catch(e => {
    if(typeof SEED_HOST == "string")
      args.peers.push(SEED_HOST_URL.href);
      
    console.error(e);
  })
  .then(() => {
    console.log(args); // Debugging...
    
    var p = new Peer({
      'port': args.port,
      'discoveryAddresses': args.peers,
      'discoveryRange': args.range,
      'ringPublicKey': args.ring,
      'publicKey': args.public,
      'privateKey': args.private,
      'signature': args.signature,
      'debug': args.debug || args.v || args.verbose
    });
    
    // ----------------------------------------------------------------------------------
    // ----------------------------------------------------------------------------------
    // ----------------------------------------------------------------------------------
    // ----------------------------------------------------------------------------------
    
    var isReady = false;
    p.on('ready', () => {
      isReady = true;
    });
    
    p.on('cliMessage', ({ message, connection }) => {
      // TODO: Do something with the message (Update DB, Blockchain, etc...)
      console.log(`\n\n`,JSON.stringify(message, true),`\n\n`);
    });
    
    if(!args.d || args.d.length < 1) {
      var queue = [];
      var canSend = true;
      
      var readInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'NET> '
      });
    
      readInterface.on('line', (line) => {
        if(line && line.toString().length > 0) {
          line = line.toString();
          
          if(line == 'exit') { // User typed 'exit'
            p.close();
            readInterface.close(); //close return
            process.exit(0);
          } else if(line == 'peers') {
            console.log(`\n\n${JSON.stringify(p.getPeerList())}\n\n`);
          } else if(line == 'queue') {
            console.log(`\n\n${JSON.stringify(queue)}\n\n`);
          } else if(line == 'queue on') {
            canSend = false;
          } else if(line == 'queue off') {
            canSend = true;
          } else if(line == 'queue send' || line == 'send') {
            // Send all the queued messages
            while(queue.length > 0)
              p.broadcast({ message: queue.splice(0,1)[0] });
          } else {
            var message = new PeerMessage({
              type: "cliMessage",
              body: { 'data': line }
            });
            
            if(isReady && canSend)
              p.broadcast({ message });
            else
              queue.push(message);
          }
        }
      });
    }
  });



// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------


//////////////////////////////////////
// Take care of a clean exit below //
////////////////////////////////////
// function save(eventType) {
//   console.log(`Exiting as a result of '${eventType}'`);
  
//   // if(!p.saved) {
//   //   fs.writeFile(Date.now() + ".json", new Buffer(p.toString(), 'utf8'), () => {
//   //     p.saved = true;
//   //     process.exit(1);
//   //   });
//   // }
  
//   process.exit(1);
// }

// [`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`]
//   .forEach((eventType) => {
//     process.on(eventType, save.bind(null, eventType));
//   });
