# ringnet

## A secure peer-to-peer networking NodeJS module based on HTTPS WebSockets using RSA and AES.

This package aims to create a secure, trusted network among decentralized peers, and make the aforementioned easy to setup and use right out-of-the-box.

### This package is in ALPHA development; you've been warned.

### Install
```bash
npm install ringnet
```

### Usage

#### Include ringnet
```js
const { Peer, PeerMessage, PeerMessageQueue, Expectation } = require('ringnet');
```

#### Creating a new peer
```js
var peer = new Peer(options);
```

##### Constructor Options
- **ringPublicKey** (string)
  - **_Required_**, defaults to `ring.pub`
  - This is the path/location of the ring public key file. This is necessary in order to establish trust amongst the decentralized peers
- **publicKey** (string)
  - **_Required_**, defaults to `peer.pub`
  - This is the path/location of the peer public key file. This is necessary in order to communicate securely with other peers in the decentralized network
- **privateKey** (string)
  - **_Required_**, defaults to `peer.pem`
  - This is the path/location of the peer private key file. This is necessary in order to communicate securely with other peers in the decentralized network
- **signature** (string)
  - **_Required_**, defaults to `peer.signature`
  - This is the path/location of the peer signature file which is the signature of the peer's public key as signed by a ring private key. This is necessady in order to establish trust amongst the decentralized peers.
- **credentials** (object)
  - *Optional*, defaults to `{'key: "https.key.pem", 'cert': "https.cert.pem"}`.
  - If provided, the peer will use the key (`credentials.key`) and cert (`credentials.cert`) properties for creation of the https server in which to listen for incomming `wss` (secure) connections. Previously an insecure http server was used for peer-to-peer communcation and has since been deprecated. The peer *must* have valid https key and certificate in order to run. Self-signed certificates are acceptable for use.
- **port** (integer)
  - *Optional*, defaults to `DSCVRY_LISTEN` environment variable with a fallback of `26780`
  - The port that the created peer will listen on, accepting new requests via HTTP server and WebSocket connections
- **discoveryAddresses** (array)
  - *Optional*, defaults to empty array `[]`
  - The addresses with or without accompanying ports of peers that the created peer will try to connect to after intialization
- **discoveryRange** (array, length=2)
  - *Optional*, defaults to `[26780, 26790]`
  - If a member of `discoveryAddresses` does not contain a port, the peer will sequentially try connect to said entry using this range of ports (inclusive). The first index of this array should be the starting port and the second and last index of this array should be the ending port
- **startDiscovery** (boolean)
  - *Optional*, defaults to true
  - If set to true, the peer will automatically start the discovery process after creation and initialization
  - If set to false, the peer will not automatically start the discovery process
- **debug** (boolean)
  - *Optional*, defaults to false
  - If set to true, the peer will output useful diagnostic information to `stdout` while running

##### Peer Constructor Example
```js
/*
  Create a peer, `peer`, using `myRingPulicKey.pub`, `myPeerPublicKey.pub`, 
  `myPeerPublicKey.pem`, and `myPeerSignature` files, that listens on port 
  `26780` and will attempt to discover the address `127.0.0.1:26781` via 
  autodiscovery (`startDiscovery`), post-creation. This peer will, if given 
  an IP to discover with no port, scan ports 26780-26790 (inclusive) against 
  the IP in order to attempt to establish a secure connection with said IP. 
  This peer will also output diagnostics (`debug`).
*/

var peer = new Peer({
  'credentials': {
    'key': "myHttpsServer.key.pem",
    'cert': "myHttpsServer.cert.pem"
  },
  'ringPublicKey': "myRingPulicKey.pub",
  'publicKey': "myPeerPublicKey.pub",
  'privateKey': "myPeerPrivateKey.pem",
  'signature': "myPeerSignature.signature",
  'port': 26780,
  'discoveryAddresses': [ "127.0.0.1:26781" ],
  'discoveryRange': [ 26780, 27900 ],
  'startDiscovery': true,
  'debug': true,
});
```

#### Setting up the event handlers
```js
peer.on('ready', () => {
  /* Underyling HTTP Server is ready */
});

peer.on('request', ({connection, request }) => {
  /* A new request has been received by the WebSocket server */
});

peer.on('connection', ({connection }) => {
  /* A new VERIFIED AND TRUSTED connection has been made */
});

peer.on('message', () => ({ message, connection }) => {
  /* A message has been received by the WebSocket server */
});

peer.on('discovering', () => {
  /* The peer is discovering based on it's list of known or potential peers */
});

peer.on('discovered', () => {
  /* The peer is done discovering */
});
```

#### Creating and Sending Messages
```js
// Create a new PeerMessage object with header type of 'update' and an object for its body.
// (See PeerMessage.PEER_MESSAGE_TYPES object for additional message types or to add your own)
var message = new PeerMessage({
  'type': PeerMessage.PEER_MESSAGE_TYPES.update,
  'body': {
    'someProperty': someValue
  }
});

// Broadcast the message to all connected, verified peers
peer.broadcast({ message });
```

### Testing On Local Machine
0. Generate or bring-your-own HTTPS server certificates
    ```bash
    $ openssl genrsa -out https.key.pem 2048`
    $ openssl req -new -key https.key.pem -out https.csr.pem
    $ openssl x509 -req -days 9999 -in https.csr.pem -signkey https.key.pem -out https.cert.pem
    ```
1. Set up initial peer - Use peerSetup.js to generate ring public / private key pair and peer1 public/private key pair and signature

    ```bash
    $ node peerSetup.js -o=first -b=2048
    ```

2. Set up second peer - Use peerSetup.js to generate second peer public / private key pair and signature

    ```bash
    $ node peerSetup.js -o=second -b=2048 -ring=.ring.pem
    ```

4. Start first peer (in background, logging stdout and stderr to `first.peer.log`):
    
    ```bash
    $ node test/peerCommandLine.js -port=26781 -ring=.ring.pub -private=first.peer.pem -public=first.peer.pub -signature=first.peer.signature -v -d > "first.peer.log" 2>&1 &
    ```
    
5. Start second peer (in foreground, with user interaction):
    
    ```bash
    $ node test/peerCommandLine.js -port=26782 -peers=127.0.0.1:26781 -ring=.ring.pub -private=second.peer.pem -public=second.peer.pub -signature=second.peer.signature -v
    ```
    
6. Once the peer-to-peer network has been established (post-HELO handshake), messages from one peer can be sent out to all other peers in the network securely, just as in a typical client-server scenario. The catch? Decentralization. Every peer is a server and every peer is a client. There is no central management.
7. Type some text into terminal/prompt while the second peer is running and hit enter. The second peer will send the message securely to the first peer, as the peers have established trust in the decentralized network.
8. Quit (`Ctrl^C` or type `exit` and hit enter) on the second peer to quit the second peer.
9. Verify the encrypted message sent by the second peer made it to the first peer by opening `first.peer.log`. The last few lines will now reflect the message sent by the second peer to the first peer and received by the first peer from the second peer.
10. Quit (`kill -9 <pidOfFirstPeer>`) the second peer, as it is still running in the background.