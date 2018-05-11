"use strict";

const fs = require('fs');
const readline = require('readline');
const NodeRSA = require('node-rsa');

const Peer = require('./lib/peer');
const { PeerMessage, PEER_MESSAGE_TYPES, PEER_MESSAGE_STRING } 
  = require('./lib/message');

const args = require('./lib/expect')({
    'port': "", //optional (defaults to 26781)
    'peers': [","], //optional (defaults to [])
    'ring': "", //required (defaults to ring.pub)
    'private': "", //optional (defaults to peer.pem)
    'public': "", // optional (defaults to peer.pub)
    'signature': "", //required (peer won't start without)
    'd': "" // optional
  });

console.log(args);

var DSCVRY_SAVEFILE = args.save || `${Date.now()}.json`;

var p = new Peer({
  'port': args.port,
  'addresses': args.peers,
  'debug': args.debug,
  'publicKey': args.public,
  'privateKey': args.private,
  'ringPublicKey': args.ring,
  'signature': args.signature
});

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

if(!args.d || args.d.length < 1) {
  p.on('discovered', () => {
    var readInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'NET> '
    });
    
    readInterface.prompt();
  
    readInterface.on('line', (line) => {
      if(line && line.toString().length > 0) {
        line = line.toString();
        
        if(line == 'exit') // User typed 'exit'
          return readInterface.close(); //close return
        
        var message = new PeerMessage({ messageType: PEER_MESSAGE_TYPES.update });
        message.body = { 'data': line };

        p.broadcast({ message });
      }
      
      //readInterface.prompt();
    });
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
