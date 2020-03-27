"use strict";

const fs = require('fs');
const dns = require('dns');
const readline = require('readline');

const Expectation = require('./expectation');
const { Peer, Message } = require('../index.js');

const args = (new Expectation({
    'publicAddress': "", //optional (defaults to false)
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
  'publicAddress': args.publicAddress,
  'discoveryAddresses': args.peers,
  'debug': args.debug || args.v || args.verbose,
  'publicKey': args.public,
  'privateKey': args.private,
  'ringPublicKey': args.ring,
  'signature': args.signature,
  'range': args.range,
  'conrirmMessages': args.requireConfirmation || args.rc
});

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

(async () => {
  try {
    await p.init();
    await p.discover();
  } catch(e) {
    console.error(e.stack);
    process.exit(1);
  }

  p.on('msg', ({ message, connection }) => {
    // TODO: Do something with the message (Update DB, Blockchain, etc...)
    // console.log(`\n\n`,JSON.stringify(message, true),`\n\n`);
    console.log(`[${connection.originalAddress}:${connection.originalPort}]: ` + 
      `${message.body.text}`);
    readInterface.prompt();
  });

  if(!args.d || args.d.length < 1) {
    var queue = [];
    var canSend = true;

    readInterface.on('line', (line) => {
      if(line && line.toString().length > 0) {
        line = line.toString();
        
        if(line == 'exit') { // User typed 'exit'
          p.close();
          readInterface.close(); //close return
          process.exit(0);
        } else if(line == '/peers') {
          console.log(p.getPeerList());
        } else if(line == '/queue') {
          console.log(queue);
        } else if(line == '/queue on') {
          canSend = false;
          console.log(`Queue is now on.`);
        } else if(line == '/queue off') {
          canSend = true;
          console.log(`Queue is now off.`);
        } else if(line == '/queue send' || line == '/send') {
          // Send all the queued messages
          while(queue.length > 0) {
            const message = queue.splice(0,1)[0];
            try {
              p.broadcast({ message });
            } catch(e) {
              console.error(e.message);
              console.error(e.stack);
            }
          }
        } else if(line == '/self') {
          console.log(JSON.parse(p.toString()));
        } else {
          var message = new Message({
            type: 'msg',
            body: {
              'text': line
            }
          });
          
          if(isReady && canSend) {
            try {
              p.broadcast({ message });
            } catch(e) {
              console.error(e.message);
              console.error(e.stack);
            }
          } else {
            queue.push(message);
          }
        }
      }
      
      readInterface.prompt();
    });
  }

  readInterface.prompt();
})();

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
