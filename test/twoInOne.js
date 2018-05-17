"use strict";

const { Peer, PeerMessage, PeerMessageQueue, Expectation } = require('../index.js');

// =========================================================================
// =========================================================================

// Craft the messages that we will pass between peers later

let messageFromPeer1 = new PeerMessage({
  type: PeerMessage.PEER_MESSAGE_TYPES.update,
  body: "Howdy, it's peer1!!!"
});

let messageFromPeer2 = new PeerMessage({
  type: PeerMessage.PEER_MESSAGE_TYPES.update,
  body: "Hello, from peer2!!!"
});

// =========================================================================
// =========================================================================

// Create peer1, the first peer, which will listen on port 26780
let peer1 = new Peer({
  'port': 26780,
  'signature': "first.peer.signature",
  'publicKey': "first.peer.pub",
  'privateKey': "first.peer.pem",
  'ringPublicKey': ".ring.pub",
  'debug': false
});

// We've received a new, trusted connection (from peer2)
peer1.on('connection', ({ connection }) => {
  console.log(`PEER1:\n\tNew connection from ${connection.remoteAddress}\n`);
  
  console.log(`PEER1: Sending message with body (length ` + 
    `${messageFromPeer1.body.length}) - ${messageFromPeer1.body}`);
    
  peer1.broadcast({ message: messageFromPeer1, connection });
});

// We've received a new, trusted message (from peer2)
peer1.on('message', ({ message, connection }) => {
  console.log(`PEER1:\n\tNew message (body length ${message.body.length}) ` +
      `from ${connection.remoteAddress}: ${message.body}`);
      
  console.log(`\tExpected (body length ${messageFromPeer2.body.length}): ` +
    `${messageFromPeer2.body}`);
    
  // Check to make sure that peer2's message arrived the same as peer2 sent it
  if(message.body && message.body == messageFromPeer2.body) {
    // The entire dialogue is now confirmed, we can exit.
    console.log("Done.");
    process.exit(0);
  } else {
    // Somehow the message from peer1 got corrupted, etc. Throw error.
    throw new Error("`peer1` received message, but content was not correct.");
  }
});

// =========================================================================
// =========================================================================

// Once peer1 starts accepting connections (denoted by the 'ready' event), 
// peer2 can be created with peer1's address (localhost) and port (26780) as
// a known peer to discover.
peer1.on('ready', () => {
  let peer2 = new Peer({
    'port': 26781,
    'addresses': [ "127.0.0.1:26780" ],
    'signature': "second.peer.signature",
    'publicKey': "second.peer.pub",
    'privateKey': "second.peer.pem",
    'ringPublicKey': ".ring.pub",
    'debug': false
  });
  
  // We've received a new, trusted connection (from peer1)
  peer2.on('connection', ({ connection }) => {
    console.log(`PEER2:\n\tNew connection from ${connection.remoteAddress}\n`);
  });
  
  // We've received a new, trusted message (from peer1)
  peer2.on('message', ({ message, connection }) => {
    console.log(`PEER2:\n\tNew message (body length ${message.body.length}) ` +
      `from ${connection.remoteAddress}: ${message.body}`);
      
    console.log(`\tExpected (body length ${messageFromPeer1.body.length}): ` +
      `${messageFromPeer1.body}`);
      
    // Check to make sure that peer1's message arrived the same as peer1 sent it
    if(message.body && message.body == messageFromPeer1.body) {
      console.log(`PEER2: Sending message with body (length ` + 
        `${messageFromPeer2.body.length}) - ${messageFromPeer2.body}`);
        
      // Continue the dialogue by replying with a different message
      peer2.broadcast({ message: messageFromPeer2, connection });
    } else {
      // Somehow the message from peer1 got corrupted, etc. Throw error.
      throw new Error("`peer2` received message, but content was not correct.");
    }
  });
});

