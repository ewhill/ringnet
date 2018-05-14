"use strict";

const fs = require('fs');
const readline = require('readline');
const NodeRSA = require('node-rsa');

const Peer = require('../lib/peer');
const { PeerMessage, PEER_MESSAGE_TYPES, PEER_MESSAGE_STRING } 
  = require('../lib/message');

const args = require('../lib/expect')({
    'port': "", // optional (defaults to 26781)
    'peers': [","], // optional (defaults to [])
    'ring': "", // required (defaults to ring.pub)
    'private': "", // optional (defaults to peer.pem)
    'public': "", // optional (defaults to peer.pub)
    'signature': "", // required (peer won't start without)
    'd': "", // optional
    'range': [","] // optional (defaults to [26780,26790])
  });

console.log(args);

var DSCVRY_SAVEFILE = args.save || `${Date.now()}.json`;

var p = new Peer({
  'port': args.port,
  'addresses': args.peers,
  'debug': args.debug || args.v || args.verbose,
  'publicKey': args.public,
  'privateKey': args.private,
  'ringPublicKey': args.ring,
  'signature': args.signature,
  'range': args.range
});

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

var isReady = false;
p.on('ready', () => {
  isReady = true;
});

p.on('message', ({ message, connection }) => {
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
        readInterface.close(); //close return
        process.exit(1);
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
        var message = new PeerMessage({ messageType: PEER_MESSAGE_TYPES.update });
        message.body = { 'data': line };
        
        if(isReady && canSend)
          p.broadcast({ message });
        else
          queue.push(message);
      }
    }
  });
}

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
