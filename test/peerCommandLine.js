"use strict";

const fs = require('fs');
const dns = require('dns');
const readline = require('readline');

const { Peer, PeerMessage, PeerMessageQueue, Expectation } = require('../index.js');

const args = (new Expectation({
    'port': "", // optional (defaults to 26781)
    'peers': [","], // optional (defaults to [])
    'ring': "", // required (defaults to ring.pub)
    'private': "", // optional (defaults to peer.pem)
    'public': "", // optional (defaults to peer.pub)
    'signature': "", // required (peer won't start without)
    'd': "", // optional
    'range': [","], // optional (defaults to [26780,26790])
    'requireConfirmation': "",
    'rc': ""
  })).args;

console.log(args);

var DSCVRY_SAVEFILE = args.save || `${Date.now()}.json`;

var readInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

readInterface.setPrompt('NET> ');

var p = new Peer({
  'port': args.port,
  'discoveryAddresses': args.peers,
  'debug': args.debug || args.v || args.verbose,
  'publicKey': args.public,
  'privateKey': args.private,
  'ringPublicKey': args.ring,
  'signature': args.signature,
  'range': args.range,
  'requireConfirmation': args.requireConfirmation || args.rc
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
  readInterface.prompt();
});

if(!args.d || args.d.length < 1) {
  var queue = [];
  var canSend = true;
  
  p.on('discovered', () => {
    readInterface.prompt();
  });

  readInterface.on('line', (line) => {
    if(line && line.toString().length > 0) {
      line = line.toString();
      
      if(line == 'exit') { // User typed 'exit'
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
      } else if(line == 'toString()') {
        console.log(p.toString());
      } else {
        var message = new PeerMessage({
          type: PeerMessage.PEER_MESSAGE_TYPES.update,
          body: { 'data': line  }
        });
        
        if(isReady && canSend)
          p.broadcast({ message });
        else
          queue.push(message);
      }
    }
    
    readInterface.prompt();
  });
}

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
