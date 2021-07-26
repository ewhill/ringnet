# ringnet

## A secure peer-to-peer networking NodeJS module based on HTTPS WebSockets using RSA and AES.

This package aims to create a secure, trusted network among decentralized peers, and make the aforementioned easy to setup and use right out-of-the-box.

### This package is (very much still) in development and, while unit testing exists for a fair bit of the code base, the coverage of said tests varies. Please ensure your project's usecase takes the status of this package into account before including this package into a "production" environment.

## Install
```bash
npm install ringnet
```

## Usage

### Include ringnet
```js
const { Peer, Message } = require('ringnet');
```

### Creating a new peer
```js
// See 'Constructor Options' below.
const peer = new Peer(options);
```

### Constructor Options

#### **discoveryConfig** (object)
  - *Optional*, defaults to `{ addresses: [], range: { start: 26780, end: 26790 } }`
  - The configuration used when discovering via `Peer.discover()`. The `addresses` and `range` properties can be configured accordingly.
  - **`discoveryConfig.addresses`** (array)
    - **_Required if `discoverConfig` is provided_**
    - The addresses with or without accompanying ports of peers that the created peer will try to connect to after intialization
  - **`discoveryConfig.range`** (object)
    - **_Required if `discoverConfig` is provided_**
    - If a discovery address does not contain a port, the peer will sequentially try connect to said entry using this range of ports (inclusive).
    - **`discoveryConfig.range.start`** (number)
      - **_Required if `discoverConfig` is provided_**
      - The starting port used for discovery.
    - **`discoveryConfig.range.end`** (number)
      - **_Required if `discoverConfig` is provided_**
      - The ending port used for discovery.

#### **httpsServerConfig** (object)
  - **credentials** (object)
    - *Optional*, defaults to `{'key: "https.key.pem", 'cert': "https.cert.pem"}`.
    - If provided, the peer will use the key (`credentials.key`) and cert (`credentials.cert`) properties for creation of the https server in which to listen for incomming `wss` (secure) connections. Previously an insecure http server was used for peer-to-peer communcation and has since been deprecated. The peer *must* have valid https key and certificate in order to run. Self-signed certificates are acceptable for use.
    - NOTE: If the a server is passed properly via the `httpsServerConfig.server` property, this property will be ignored.
  - **`httpsServerConfig.server`** (object)
    - *Optional*, defaults to `false`.
    - If provided, the peer will use the given HTTPS Server for creation of the underyling WebSocket server.
  - **`httpsServerConfig.mode`** (enum)
    - *Optional*, defaults to `HTTPS_SERVER_MODES.CREATE`,
    - See all available HTTPS server modes in `./lib/Server.js`
  - **`httpsServerConfig.port`** (number)
    - The port that the created peer will listen on, accepting new requests via HTTP server and WebSocket connections

#### **privateKeyPath** (string)
  - **_Required_**, defaults to "peer.pem"
  - This is the path/location of the peer private key file. This is necessary in order to communicate securely with other peers in the decentralized network

#### **publicKeyPath** (string)
  - *Optional*, defaults to "peer.pub"
  - This is the path/location of the peer public key file. This is necessary in order to communicate securely with other peers in the decentralized network. If missing, the publicKey will attempt to be derrived from privateKey, if privateKey is given and valid.

#### **ringPublicKeyPath** (string)
  - **_Required_**, defaults to "ring.pub"
  - This is the path/location of the ring public key file. This is necessary in order to establish trust amongst the decentralized peers

#### **signaturePath** (string)
  - **_Required_**, defaults to "peer.signature"
  - This is the path/location of the peer signature file which is the signature of the peer's public key as signed by a ring private key. This is necessady in order to establish trust amongst the decentralized peers.

#### **wsServerOptions** (object)
  - *Optional*, defaults to empty object `{}`
  - If given, the peer will use the provided object to create the `ws` (WebSockets) server. See https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback for more options and additional information.

### Peer Constructor Example
```js
/*
  Create a peer, `peer`, using `myRingPulicKey.pub`, `myPeerPublicKey.pub`, 
  `myPeerPublicKey.pem`, and `myPeerSignature` files, that listens on port 
  `26780` and will attempt to discover the address `127.0.0.1:26781` when 
  discovering. This peer will, if given an IP to discover with no port, scan 
  ports 26780-26790 (inclusive) against the IP in order to attempt to 
  establish a secure connection with said IP.
*/

const peer = new Peer({
  discoveryConfig: {
    range: {
      start: 26780,
      end: 26790,
    },
  },
  httpsServerConfig: {
    credentials: {
      key: 'myHttpsServer.key.pem',
      cert: 'myHttpsServer.cert.pem'
    },
    port: 26780,
  },
  ringPublicKeyPath: 'myRingPulicKey.pub',
  publicKeyPath: 'myPeerPublicKey.pub',
  privateKeyPath: 'myPeerPrivateKey.pem',
  signaturePath: 'myPeerSignature.signature',
});

await peer.init();
await peer.discover([ '127.0.0.1:26781' ]);
```

### Initialization and Discovery
Clients can also leverage async / await to detemine peer readiness or the completion of the discovery operation.

```js
const peer = new Peer({ /* ... */ });

// Wait for peer to initialize.
await peer.init();

// (Optional) Wait for Peer to finish discover operation.
await peer.discover();
```

### Creating and Sending Messages
```js
/** Class for custom 'MySuperCoolMessage' Message. */
class MySuperCoolMessage extends Message {
  constructor(options = {}) {
    super();
    const { data='' } = options;
    this.body = { data };
  }

  get data() { return this.body.data; }
  set data(data) { this.body = { ...this.body, data }; }
}

/** Creates and sends a new 'MySuperCoolMessage' with arbitrary data. */
async function sendMySuperCoolMessage() {
  try {
    // Broadcast the message to all connected, verified peers
    await peer.broadcast(new MySuperCoolMessage({ data: "hello!" });
  } catch(e) {
    console.error(e.stack);
  }
}
```

### Listening for Messages
```js
/** Class for custom 'MySuperCoolMessage' Message. */
class MySuperCoolMessage extends Message {
  constructor(options = {}) {
    super();
    const { data='' } = options;
    this.body = { data };
  }

  get data() { return this.body.data; }
  set data(data) { this.body = { ...this.body, data }; }
}

const mySuperCoolMessageHandler = (message, connection, logger=console) => {
  // Do something here; e.g. to send a reply, use `connection.send()`.
};

peer.bind(MySuperCoolMessage).to(mySuperCoolMessageHandler);
```

### Complete Example
A full example can be seen in "./examples/fullExample.js". The file illustrates a complete example of creating two peers, and each broadcasting a message to the other. While this sort of setup is purely exemplary, it showcases usage of the package and typical setup, etc.