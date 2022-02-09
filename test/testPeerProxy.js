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

// Peer1 (alpha) -->
//   --> Peer2 (alpha)
//   --> Peer3 (beta)
test("PeerProxy_proxiesMessageFromAlphaToBeta", async (assert) => {
  assert.plan(8);
  await setup();
  await before();

  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer1alpha!' });

  let peer2alphaReceivePromiseResolver;
  const peer2alphaReceivePromise = new Promise((resolve) => {
    peer2alphaReceivePromiseResolver = resolve;
  });
  const peer2alphaMessageHandler = (message) => {
    assert.ok('peer2alpha should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer2alphaReceivePromiseResolver();
  };
  peer2alpha.bind(GreetingMessage).to(peer2alphaMessageHandler);

  let peer3betaReceivePromiseResolver;
  const peer3betaReceivePromise = new Promise((resolve) => {
    peer3betaReceivePromiseResolver = resolve;
  });
  const peer3betaMessageHandler = (message) => {
    assert.ok('peer3beta should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer3betaReceivePromiseResolver();
  };
  peer3beta.bind(GreetingMessage).to(peer3betaMessageHandler);

  console.log("Sending greeting from peer1alpha...");
  await peer1alpha.broadcast(greeting);

  await Promise.all([ peer2alphaReceivePromise, peer3betaReceivePromise ]);
  await after();
  await teardown();
});

// Peer2 (alpha) -->
//   --> Peer1 (alpha)
//   --> Peer3 (beta)
test("PeerProxy_proxiesMessageFromAlphaOtherToBeta", async (assert) => {
  assert.plan(8);
  await setup();
  await before();

  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer2alpha!' });

  let peer1alphaReceivePromiseResolver;
  const peer1alphaReceivePromise = new Promise((resolve) => {
    peer1alphaReceivePromiseResolver = resolve;
  });
  const peer1alphaMessageHandler = (message) => {
    assert.ok('peer1alpha should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer1alphaReceivePromiseResolver();
  };
  peer1alpha.bind(GreetingMessage).to(peer1alphaMessageHandler);

  let peer3betaReceivePromiseResolver;
  const peer3betaReceivePromise = new Promise((resolve) => {
    peer3betaReceivePromiseResolver = resolve;
  });
  const peer3betaMessageHandler = (message) => {
    assert.ok('peer3beta should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer3betaReceivePromiseResolver();
  };
  peer3beta.bind(GreetingMessage).to(peer3betaMessageHandler);

  await peer2alpha.broadcast(greeting);

  await Promise.all([ peer1alphaReceivePromise, peer3betaReceivePromise ]);
  await after();
  await teardown();
});

// Peer3 (beta) -->
//   --> Peer1 (alpha)
//   --> Peer2 (alpha)
test("PeerProxy_proxiesMessageFromBetaToAlpha", async (assert) => {
  assert.plan(8);
  await setup();
  await before();

  const greeting = 
    new GreetingMessage({ greeting: 'Hello from peer3beta!' });

  let peer1alphaReceivePromiseResolver;
  const peer1alphaReceivePromise = new Promise((resolve) => {
    peer1alphaReceivePromiseResolver = resolve;
  });
  const peer1alphaMessageHandler = (message) => {
    assert.ok('peer1alpha should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer1alphaReceivePromiseResolver();
  };
  peer1alpha.bind(GreetingMessage).to(peer1alphaMessageHandler);

  let peer2alphaReceivePromiseResolver;
  const peer2alphaReceivePromise = new Promise((resolve) => {
    peer2alphaReceivePromiseResolver = resolve;
  });
  const peer2alphaMessageHandler = (message) => {
    assert.ok('peer2alpha should receive message broadcasted from peer1alpha.');
    assert.equal(message.hash.toString(), greeting.hash.toString());
    assert.equal(message.body.toString(), greeting.body.toString());
    assert.equal(message.timestamp.toString(), greeting.timestamp.toString());
    return peer2alphaReceivePromiseResolver();
  };
  peer2alpha.bind(GreetingMessage).to(peer2alphaMessageHandler);

  await peer3beta.broadcast(greeting);

  await Promise.all([ peer1alphaReceivePromise, peer2alphaReceivePromise ]);
  await after();
  await teardown();
});

