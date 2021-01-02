"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerExportImportTest", async (assert) => {
  const sink = () => {};
  const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };
  
  let p1 = new Peer({
      signaturePath: "first.peer.signature",
      publicKeyPath: "first.peer.pub",
      privateKeyPath: "first.peer.pem",
      ringPublicKeyPath: ".ring.pub",
      httpsServerConfig: {
        port: 26780,
      },
      logger: fakeLogger
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