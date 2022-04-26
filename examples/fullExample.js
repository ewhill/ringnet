const { Peer, Message } = require('../index');

/** Class for custom 'MySuperCoolMessage' Message. */
class MySuperCoolMessage extends Message {
  constructor(options = {}) {
    super();
    const { data='' } = options;
    this.data = data;
  }

  get data() { return this.body.data; }
  set data(value) { this.body.data = value; }
}

const firstPeer = new Peer({
  discoveryConfig: {
    range: {
      start: 26780,
      end: 26790,
    },
  },
  httpsServerConfig: {
    credentials: {
      key: 'https.key.pem',
      cert: 'https.cert.pem'
    },
    port: 26780,
  },
  ringPublicKeyPath: '.ring.pub',
  publicKeyPath: 'first.peer.pub',
  privateKeyPath: 'first.peer.pem',
  signaturePath: 'first.peer.signature',
  publicAddress: '127.0.0.1:26780',
});

const secondPeer = new Peer({
  discoveryConfig: {
    range: {
      start: 26780,
      end: 26790,
    },
  },
  httpsServerConfig: {
    credentials: {
      key: 'https.key.pem',
      cert: 'https.cert.pem'
    },
    port: 26781,
  },
  ringPublicKeyPath: '.ring.pub',
  publicKeyPath: 'second.peer.pub',
  privateKeyPath: 'second.peer.pem',
  signaturePath: 'second.peer.signature',
  publicAddress: '127.0.0.1:26781',
});

const main = async () => {
  await firstPeer.init();
  await secondPeer.init();
  await secondPeer.discover([ '127.0.0.1:26780' ]);

  let received = 0;
  let receivedPromiseResolve;
  let receivedPromiseTimeout;
  const receivedPromise = new Promise((resolve, reject) => {
      receivedPromiseResolve = resolve;
      receivedPromiseTimeout = setTimeout(reject, 5000);
    }).then(() => {
      clearTimeout(receivedPromiseTimeout);
    });

  const mySuperCoolMessageHandler = (message, connection) => {
    // The 'message' argument is here is given as an upgraded 
    // MySuperCoolMessage class so we can use the getter for data as we would 
    // if we had constructed the message using new MySuperCoolMessage()` 
    // manually.
    console.log(message.data);

    if(++received === 2) {
      receivedPromiseResolve();
    }
  };

  firstPeer.bind(MySuperCoolMessage).to(mySuperCoolMessageHandler);
  secondPeer.bind(MySuperCoolMessage).to(mySuperCoolMessageHandler);

  firstPeer.broadcast(new MySuperCoolMessage({ data: 'Hello from first!' }));
  secondPeer.broadcast(new MySuperCoolMessage({ data: 'Hello from second!'}));

  await receivedPromise;

  await firstPeer.close();
  await secondPeer.close();
};

main();