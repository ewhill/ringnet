"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("PeerConstructor", async (assert) => {
  let testPromises = [];
  let copyObject = (o) => JSON.parse(JSON.stringify(o));

  const constructorThrowsWithMessage = async (options, msg, text) => {
    let errorMessage = null;
    let peer = new Peer(options);

    try {
      await peer.init();
      await peer.close();
    } catch(e) {
      errorMessage = e.message;
    }
    
    assert.equals(errorMessage, msg, text);
  };

  let constructorOptions = {
    credentials: {
      key: "https.key.pem",
      cert: "https.cert.pem"
    },
    port: 26788,
    discoveryAddresses: [ "127.0.0.1:26780" ],
    signature: "first.peer.signature",
    publicKey: "first.peer.pub",
    privateKey: "first.peer.pem",
    ringPublicKey: ".ring.pub",
    range: [26780, 26790],
  };

  let options, peer;

  try {

    // Missing peer `ringPublicKey`:
    let missingRingPublicKeyOptions = copyObject(constructorOptions);
    delete missingRingPublicKeyOptions.ringPublicKey;
    await constructorThrowsWithMessage(missingRingPublicKeyOptions,
      "File does not exist: \'ring.pub\'!",
      "Constructor when missing ringPublicKey should throw error.");

    // Missing peer `signature`:
    let missingSignatgureOptions = copyObject(constructorOptions);
    delete missingSignatgureOptions.signature;
    await constructorThrowsWithMessage(missingSignatgureOptions,
      "File does not exist: \'peer.signature\'!",
      "Constructor when missing signature should throw error.");

    // Missing/invalid peer `credentials`.`key`:
    let missingCredentialsKeyOptions = copyObject(constructorOptions);
    missingCredentialsKeyOptions.credentials.key = "KeyDoesNotExist";
    await constructorThrowsWithMessage(missingCredentialsKeyOptions,
      "File does not exist: \'KeyDoesNotExist\'!",
      "Constructor when given invalid credentials.key should throw error.");

    // Missing/invalid peer `credentials`.`cert`:
    let missingCredentialsCertOptions = copyObject(constructorOptions);
    missingCredentialsCertOptions.credentials.cert = "CertDoesNotExist";
    await constructorThrowsWithMessage(missingCredentialsCertOptions,
      "File does not exist: \'CertDoesNotExist\'!",
      "Constructor when given invalid credentials.cert should throw error.");

    // Incorrect peer `signature`:
    let incorrectSignatureOptions = copyObject(constructorOptions);
    incorrectSignatureOptions.signature = "second.peer.signature";
    await constructorThrowsWithMessage(incorrectSignatureOptions,
      "Invalid signature for given peer public key and ring public key.",
      "Constructor when given incorrect signature should throw error.");

    // Missing peer `privateKey`:
    let missingPrivateKeyOptions = copyObject(constructorOptions);
    delete missingPrivateKeyOptions.privateKey;
    await constructorThrowsWithMessage(missingPrivateKeyOptions,
      "Invalid path!",
      "Constructor when missing privateKey should throw error.");

    // Missing peer `publicKey`:
    let missingPublicKeyOptions = copyObject(constructorOptions);
    delete missingPublicKeyOptions.publicKey;
    peer = new Peer(missingPublicKeyOptions);

    await peer.init();

    assert.notEqual(peer.publicKey, null, 
      "Constructor when not given publicKey, but given privateKey should " +
      "derrive publicKey from privateKey.");

    await peer.close();
  } catch(e) {
    console.error(e.stack);
  }

  assert.ok('hello world');
  assert.end();
});