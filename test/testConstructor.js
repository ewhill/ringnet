"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerConstructor", (assert) => {

  let copyObject = (o) => JSON.parse(JSON.stringify(o));

  assert.throwsErrorWithMessage = (fn, msg, text) => {
    try {
      fn();
      assert.fail(text);
    } catch(e) {
      assert.equals(e.message, msg, text);
    }
  }

  let constructorOptions = {
    'credentials': {
      'key': "https.key.pem",
      'cert': "https.cert.pem"
    },
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
  };

  let options, peer;

  // Missing peer `ringPublicKey`:
  options = copyObject(constructorOptions);
  delete options.ringPublicKey;
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(), 
    "Invalid Ring Public Key file location (given: ring.pub).",
    "Constructor when missing ringPublicKey should throw error.");

  // Missing peer `signature`:
  options = copyObject(constructorOptions);
  delete options.signature;
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(),
    "Invalid Signature file location (given: peer.signature).",
    "Constructor when missing signature should throw error.");

  // Missing/invalid peer `credentials`.`key`:
  options = copyObject(constructorOptions);
  options.credentials.key = "KeyDoesNotExist";
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(),
    "Invalid HTTPS Server Key file location (given: KeyDoesNotExist).",
    "Constructor when given invalid credentials.key should throw error.");

  // Missing/invalid peer `credentials`.`key`:
  options = copyObject(constructorOptions);
  options.credentials.cert = "CertDoesNotExist";
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(),
    "Invalid HTTPS Server Certificate file location (given: CertDoesNotExist).",
    "Constructor when given invalid credentials.cert should throw error.");

  // Incorrect peer `signature`:
  options = copyObject(constructorOptions);
  options.signature = "second.peer.signature";
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(),
    "Invalid signature for given peer public key and ring public key.",
    "Constructor when given incorrect signature should throw error.");

  // Missing peer `publicKey`:
  options = copyObject(constructorOptions);
  delete options.publicKey;
  peer = new Peer(options);
  assert.notEqual(peer.publicKey, null, 
    "Constructor when not given publicKey, but given privateKey should " +
    "derrive publicKey from privateKey.");
  peer.close();

  // Missing peer `privateKey`:
  options = copyObject(constructorOptions);
  delete options.privateKey;
  assert.throwsErrorWithMessage(() => (new Peer(options)).close(),
    "Invalid Peer Private Key file location (given: peer.pem).",
    "Constructor when missing privateKey should throw error.");
  
  assert.end();  
});