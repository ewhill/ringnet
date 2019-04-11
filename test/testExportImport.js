"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, PeerMessage, Expectation } 
  = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerExportImportTest", (assert) => {
  let p1 = new Peer({
    'port': 26788,
    'discoveryAddresses': [ "127.0.0.1:26780" ],
    'signature': "first.peer.signature",
    'publicKey': "first.peer.pub",
    'privateKey': "first.peer.pem",
    'ringPublicKey': ".ring.pub",
    'debug': false,
    'range': [26780, 26790],
    'startDiscovery': false,
    'requireConfirmation': true
  });
  
  let peerJson = p1.toString();
  p1.close();
  
  let p2 = new Peer(JSON.parse(peerJson));
  
  assert.equal(peerJson, p2.toString(), 
    "Exported peer and corresponding import of exported peer should be equal");
    
  p2.close();
  assert.end();  
});