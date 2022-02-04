"use strict";
const { spawn } = require("child_process");
const test = require('tape');

const { Peer, Message } = require('../index.js');
const { createPeerProxy } = require('../lib/PeerProxy.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

class GreetingMessage extends Message {
  constructor(options={}) {
    super();

    const { greeting='' } = options;
    this.greeting = greeting;
  }

  get greeting() { return this.body.greeting; }
  set greeting(greeting) { this.body.greeting = greeting; }
}

const sink = () => {};
const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

let peer1alpha;
let peer2alpha;
let peer3beta;
let peer4beta;
let peer4alpha;
let peerProxy;

const exec = async ({ command, args=[], timeout=-1 }) => {
  return new Promise((resolve, reject) => {
    if (timeout > 0) {
      setTimeout(
        reject(new Error(`Command failed to finish before timeout!`)), timeout);
    }

    const proc = spawn(command, args);

    // proc.stdout.on('data', (data) => {
    //     console.log(`stdout: ${data.toString()}`);
    //   });

    // proc.stderr.on('data', (data) => {
    //     console.log(`stderr: ${data.toString()}`);
    //   });

    proc.on('exit', (code) => {
        // console.log(`child process exited with code: ${code.toString()}`);
        if (code !== 0) {
          return reject();
        }
        return resolve();
      });
  });
};

const setup = async () => {
  await exec({
      command: "openssl",
      args: [
        "genrsa -out /tmp/https.key.pem 2048",
      ]
    });
  await exec({
      command: "openssl",
      args: [
        "req -new -key /tmp/https.key.pem -out /tmp/https.csr.pem",
      ]
    });
  await exec({
      command: "openssl",
      args: [
        "x509 -req -days 9999 -in /tmp/https.csr.pem " +
        "-signkey /tmp/https.key.pem -out /tmp/https.cert.pem",
      ]
    });
  await exec({
      command: "node",
      args: [
        "examples/peerSetup.js",
        "-o=/tmp/one.alpha",
        "-ro=/tmp/alpha",
        "-b=2048",
      ]
    });
  await exec({
      command: "node",
      args: [
        "examples/peerSetup.js",
        "-o=/tmp/two.alpha",
        "-b=2048",
        "-ring=/tmp/alpha.ring.pem",
      ]
    });
  await exec({
      command: "node",
      args: [
        "examples/peerSetup.js",
        "-o=/tmp/three.beta",
        "-ro=/tmp/beta",
        "-b=2048",
      ]
    });
  await exec({
      command: "node",
      args: [
        "examples/peerSetup.js",
        "-o=/tmp/four.alpha",
        "-b=2048",
        "-ring=/tmp/alpha.ring.pem",
      ]
    });
  await exec({
      command: "node",
      args: [
        "examples/peerSetup.js",
        "-o=/tmp/four.beta",
        "-b=2048",
        "-ring=/tmp/beta.ring.pem",
      ]
    });
};

const teardown = async () => {
  await exec({
      command: "rm",
      args: [
        "/tmp/alpha.ring.pem",
        "/tmp/alpha.ring.pub",
        "/tmp/beta.ring.pem",
        "/tmp/beta.ring.pub",
        "/tmp/one.alpha.peer.pem",
        "/tmp/one.alpha.peer.pub",
        "/tmp/one.alpha.peer.signature",
        "/tmp/two.alpha.peer.pem",
        "/tmp/two.alpha.peer.pub",
        "/tmp/two.alpha.peer.signature",
        "/tmp/three.beta.peer.pem",
        "/tmp/three.beta.peer.pub",
        "/tmp/three.beta.peer.signature",
        "/tmp/four.beta.peer.pem",
        "/tmp/four.beta.peer.pub",
        "/tmp/four.beta.peer.signature",
        "/tmp/four.alpha.peer.signature",
      ]
    });
};

const before = async () => {
  const sink = () => {};
  const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

  peer1alpha = new Peer({
    signaturePath: "/tmp/one.alpha.peer.signature",
    publicKeyPath: "/tmp/one.alpha.peer.pub",
    privateKeyPath: "/tmp/one.alpha.peer.pem",
    ringPublicKeyPath: "/tmp/alpha.ring.pub",
    httpsServerConfig: {
      port: 26781,
    },
    logger: fakeLogger
  });

  peer2alpha = new Peer({
    signaturePath: "/tmp/two.alpha.peer.signature",
    publicKeyPath: "/tmp/two.alpha.peer.pub",
    privateKeyPath: "/tmp/two.alpha.peer.pem",
    ringPublicKeyPath: "/tmp/alpha.ring.pub",
    httpsServerConfig: {
      port: 26782,
    },
    logger: fakeLogger,
  });

  peer3beta = new Peer({
    signaturePath: "/tmp/three.beta.peer.signature",
    publicKeyPath: "/tmp/three.beta.peer.pub",
    privateKeyPath: "/tmp/three.beta.peer.pem",
    ringPublicKeyPath: "/tmp/beta.ring.pub",
    httpsServerConfig: {
      port: 26783,
    },
    logger: fakeLogger,
  });

  peer4beta = new Peer({
    signaturePath: "/tmp/four.beta.peer.signature",
    publicKeyPath: "/tmp/four.beta.peer.pub",
    privateKeyPath: "/tmp/four.beta.peer.pem",
    ringPublicKeyPath: "/tmp/beta.ring.pub",
    httpsServerConfig: {
      port: 26784,
    },
    logger: fakeLogger,
  });

  peer4alpha = new Peer({
    signaturePath: "/tmp/four.alpha.peer.signature",
    publicKeyPath: "/tmp/four.alpha.peer.pub",
    privateKeyPath: "/tmp/four.alpha.peer.pem",
    ringPublicKeyPath: "/tmp/alpha.ring.pub",
    httpsServerConfig: {
      port: 26785,
    },
    logger: fakeLogger,
  });

  await peer1alpha.init();
  await peer2alpha.init();
  await peer3beta.init();
  await peer4beta.init();
  await peer2alpha.discover(["127.0.0.1:26781", "127.0.0.1:26785"]);
  await peer4beta.discover(["127.0.0.1:26783"]);
  await peer4alpha.discover(["127.0.0.1:26781", "127.0.0.1:26782"]);

  peerProxy = createPeerProxy({
      peers: [
        peer4alpha,
        peer4beta,
      ],
      messageClasses: [
        GreetingMessage,
      ],
      logger: fakeLogger,
    });
};

const after = async () => {
  await peer1alpha.close();
  await peer2alpha.close();
  await peer3beta.close();
  await peer4beta.close();
  await peer4alpha.close();
};

const runTest = async (assert, testCase) => {
  await before();
  await testCase(assert);
  await after();
};

test("PeerProxy", async (assert) => {
  await setup();

  await runTest(assert, testProxiesMessageFromAlphaToBeta);
  await runTest(assert, testProxiesMessageFromAlphaOtherToBeta);
  await runTest(assert, testProxiesMessageFromBetaToAlpha);
  assert.pass(`PeerProxy successfully proxies messages; test passed.`);

  await teardown();
  assert.end();
});

const testProxiesMessageFromAlphaToBeta = async (assert) => {
  // Peer1 (alpha) -->
  //   --> Peer2 (alpha)
  //   --> Peer3 (beta)
  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer1alpha!' });

  let peer2alphaResolver = Promise.reject;
  const peer2alphaPromise = new Promise((resolve) => {
      peer2alphaResolver = resolve;
    });
  peer2alpha.bind(GreetingMessage).to(peer2alphaResolver);

  let peer3betaResolver = Promise.reject;
  const peer3betaPromise = new Promise((resolve) => {
      peer3betaResolver = resolve;
    });
  peer3beta.bind(GreetingMessage).to(peer3betaResolver);

  await peer1alpha.broadcast(greeting);
  const peer2alphaMessage = await peer2alphaPromise;
  const peer3betaMessage = await peer3betaPromise;
    
  assert.equal(peer2alphaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer2alphaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer2alphaMessage.timestamp.toString(), greeting.timestamp.toString());
  assert.equal(peer3betaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer3betaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer3betaMessage.timestamp.toString(), greeting.timestamp.toString());

  peer2alpha.unbind(GreetingMessage, peer2alphaResolver);
  peer3beta.unbind(GreetingMessage, peer3betaResolver);
};

const testProxiesMessageFromAlphaOtherToBeta = async (assert) => {
  // Peer2 (alpha) -->
  //   --> Peer1 (alpha)
  //   --> Peer3 (beta)
  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer2alpha!' });

  let peer1alphaResolver;
  const peer1alphaPromise = new Promise((resolve) => {
      peer1alphaResolver = resolve;
    });
  peer1alpha.bind(GreetingMessage).to(peer1alphaResolver);

  let peer3betaResolver;
  const peer3betaPromise = new Promise((resolve) => {
      peer3betaResolver = resolve;
    });
  peer3beta.bind(GreetingMessage).to(peer3betaResolver);

  await peer2alpha.broadcast(greeting);
  const peer1alphaMessage = await peer1alphaPromise;
  const peer3betaMessage = await peer3betaPromise;

  assert.equal(peer1alphaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer1alphaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer1alphaMessage.timestamp.toString(), greeting.timestamp.toString());
  assert.equal(peer3betaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer3betaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer3betaMessage.timestamp.toString(), greeting.timestamp.toString());

  peer1alpha.unbind(GreetingMessage, peer1alphaResolver);
  peer3beta.unbind(GreetingMessage, peer3betaResolver);
};

const testProxiesMessageFromBetaToAlpha = async (assert) => {
  // Peer3 (beta) -->
  //   --> Peer1 (alpha)
  //   --> Peer2 (alpha)
  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer3beta!' });

  let peer1alphaResolver;
  const peer1alphaPromise = new Promise((resolve) => {
      peer1alphaResolver = resolve;
    });
  peer1alpha.bind(GreetingMessage).to(peer1alphaResolver);

  let peer2alphaResolver;
  const peer2alphaPromise = new Promise((resolve) => {
      peer2alphaResolver = resolve;
    });
  peer2alpha.bind(GreetingMessage).to(peer2alphaResolver);

  await peer3beta.broadcast(greeting);
  const peer1alphaMessage = await peer1alphaPromise;
  const peer2alphaMessage = await peer2alphaPromise;

  assert.equal(peer1alphaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer1alphaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer1alphaMessage.timestamp.toString(), greeting.timestamp.toString());
  assert.equal(peer2alphaMessage.hash.toString(), greeting.hash.toString());
  assert.equal(peer2alphaMessage.body.toString(), greeting.body.toString());
  assert.equal(
    peer2alphaMessage.timestamp.toString(), greeting.timestamp.toString());

  peer1alpha.unbind(GreetingMessage, peer1alphaResolver);
  peer2alpha.unbind(GreetingMessage, peer2alphaResolver);
};

