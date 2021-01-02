"use strict";
const fs = require('fs');
const test = require('tape');

const { Peer, Message } = require('../index.js');

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

test("PeerConstructor", async (assert) => {
  const copyConstructorOptions = (o) => {
      const sink = () => {};
      const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };
      return { ...JSON.parse(JSON.stringify(o)), logger: fakeLogger };
    };

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
      httpsServerOptions: {
        credentials: {
          key: "https.key.pem",
          cert: "https.cert.pem"
        },
        port: 26788,
      },
      signaturePath: "first.peer.signature",
      publicKeyPath: "first.peer.pub",
      privateKeyPath: "first.peer.pem",
      ringPublicKeyPath: ".ring.pub",
      discoveryOptions: {
        range: {
          start: 26780,
          end: 26790
        },
      },
    };

  // Missing peer `ringPublicKey`:
  let missingRingPublicKeyOptions = 
    copyConstructorOptions(constructorOptions);
  delete missingRingPublicKeyOptions.ringPublicKeyPath;
  await constructorThrowsWithMessage(missingRingPublicKeyOptions,
    "Invalid path!",
    "When missing ringPublicKey should throw error.");

  // Missing peer `signature`:
  let missingSignatgureOptions = copyConstructorOptions(constructorOptions);
  delete missingSignatgureOptions.signaturePath;
  await constructorThrowsWithMessage(missingSignatgureOptions,
    "Invalid path!",
    "When missing signature should throw error.");

  // Incorrect peer `signature`:
  let incorrectSignatureOptions = copyConstructorOptions(constructorOptions);
  incorrectSignatureOptions.signaturePath = "second.peer.signature";
  await constructorThrowsWithMessage(incorrectSignatureOptions,
    "Invalid signature for given peer public key and ring public key.",
    "When given incorrect signature should throw error.");

  // Missing peer `privateKey`:
  let missingPrivateKeyOptions = copyConstructorOptions(constructorOptions);
  delete missingPrivateKeyOptions.privateKeyPath;
  await constructorThrowsWithMessage(missingPrivateKeyOptions,
    "Invalid path!",
    "When missing privateKey should throw error.");

  // Missing peer `publicKey`:
  let missingPublicKeyOptions = copyConstructorOptions(constructorOptions);
  delete missingPublicKeyOptions.publicKeyPath;
  const peer = new Peer(missingPublicKeyOptions);
  await peer.init();
  assert.notEqual(peer.publicKey, null, 
    "When not given publicKey, but given privateKey should derrive publicKey " +
    " from privateKey.");
  await peer.close();

  assert.end();
});