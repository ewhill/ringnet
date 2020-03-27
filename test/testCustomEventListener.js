"use strict";
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerCustomEventListener", async (assert) => {
  const customMessageType = 'Cu570m_M3554g3';

  let peer1 = new Peer({
    port: 26784,
    publicAddress: '127.0.0.1',
    signature: "first.peer.signature",
    publicKey: "first.peer.pub",
    privateKey: "first.peer.pem",
    ringPublicKey: ".ring.pub"
  });
  
  let peer2 = new Peer({
    port: 26785,
    discoveryAddresses: [ "127.0.0.1:26784" ],
    publicAddress: '127.0.0.1',
    signature: "second.peer.signature",
    publicKey: "second.peer.pub",
    privateKey: "second.peer.pem",
    ringPublicKey: ".ring.pub",
  });
      
  peer2.on(customMessageType, async ({ message, connection }) => {
    assert.equal(message.body, "Hey, let's test this custom event listener!", 
      'Message with custom Message header type should be received by custom ' +
      'event listener.');
    assert.ok(true, `Custom event listener fired; test passed.`);
    
    await peer2.close();
    await peer1.close();
    
    assert.end();
  });

  try {
    await peer1.init();
    await peer2.init();
    await peer2.discover();
    await peer1.discover();
  } catch(e) {
    console.error(e.stack);
  }

  try {
    peer1.broadcast(new Message({
      type: customMessageType,
      body: "Hey, let's test this custom event listener!"
    }));
  } catch(e) {
    console.error(e.stack);
  }
});

