"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerExportImportTest", async (assert) => {
  let p1 = new Peer({
    port: 26788,
    discoveryAddresses: [ "127.0.0.1:26780" ],
    signature: "first.peer.signature",
    publicKey: "first.peer.pub",
    privateKey: "first.peer.pem",
    ringPublicKey: ".ring.pub",
    range: [26780, 26790],
  });

  await p1.init();

  let peerJson = p1.toString();
  p1.close();

  let p2 = new Peer(JSON.parse(peerJson));
  
  await p2.init();

  assert.equal(peerJson, p2.toString(), 
    "Exported peer and corresponding import of exported peer should be equal");
    
  await p2.close();
  assert.end();
});