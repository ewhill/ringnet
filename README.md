# ringnet

## A secure peer-to-peer networking NodeJS module based on HTTPS WebSockets using RSA and AES.

This package aims to create a secure, trusted network among decentralized peers, and make the aforementioned easy to setup and use right out-of-the-box.

### This package is (still) in development and, while unit testing exists for a fair bit of the code base, the coverage of said tests varies. Please ensure your project's usecase takes the status of this package into account before including this package into a "production" environment.

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
var peer = new Peer(options);
```

### Constructor Options
#### **credentials** (object)
  - *Optional*, defaults to `{'key: "https.key.pem", 'cert': "https.cert.pem"}`.
  - If provided, the peer will use the key (`credentials.key`) and cert (`credentials.cert`) properties for creation of the https server in which to listen for incomming `wss` (secure) connections. Previously an insecure http server was used for peer-to-peer communcation and has since been deprecated. The peer *must* have valid https key and certificate in order to run. Self-signed certificates are acceptable for use.
  - NOTE: If the `httpsServer` is provided, and is a valid HTTPS server instance, this option, `credentials`, will be ignored.
#### **debug** (boolean)
  - *Optional*, defaults to `false`
  - If set to true, the peer will output useful diagnostic information to `stdout` while running
#### **discoveryAddresses** (array)
  - *Optional*, defaults to empty array `[]`
  - The addresses with or without accompanying ports of peers that the created peer will try to connect to after intialization
#### **discoveryRange** (array, length=2)
  - *Optional*, defaults to `[26780, 26790]`
  - If a member of `discoveryAddresses` does not contain a port, the peer will sequentially try connect to said entry using this range of ports (inclusive). The first index of this array should be the starting port and the second and last index of this array should be the ending port
#### **httpsServer** (object)
  - *Optional*, defaults to `false`.
  - If provided, the peer will use the given HTTPS Server for creation of the underyling WebSocket server.
#### **port** (integer)
  - *Optional*, defaults to `DSCVRY_LISTEN` environment variable with a fallback of `26780`
  - The port that the created peer will listen on, accepting new requests via HTTP server and WebSocket connections
#### **privateKey** (string)
  - **_Required_**, defaults to `peer.pem`
  - This is the path/location of the peer private key file. This is necessary in order to communicate securely with other peers in the decentralized network
#### **publicAddress** (array)
  - *Optional*, defaults to `false`.
  - The addresses that will be used to tell other peers where they can find us when new peers connect to them. This address should be a publicly accessible FQDN or IP address that will resolve to this instantiated peer.
#### **publicKey** (string)
  - **_Required_**, defaults to `peer.pub`
  - This is the path/location of the peer public key file. This is necessary in order to communicate securely with other peers in the decentralized network
#### **requireConfirmation** (boolean)
  - *Optional*, defaults to `true`
  - If set to true, the peer will request that all other peers in the ringnet send confirmation of message receipts back to it.
  - If set to false, the peer will not request message receipt confirmations and any confirmation messages received will be ignored.
#### **ringPublicKey** (string)
  - **_Required_**, defaults to `ring.pub`
  - This is the path/location of the ring public key file. This is necessary in order to establish trust amongst the decentralized peers
#### **signature** (string)
  - **_Required_**, defaults to `peer.signature`
  - This is the path/location of the peer signature file which is the signature of the peer's public key as signed by a ring private key. This is necessady in order to establish trust amongst the decentralized peers.
#### **startDiscovery** (boolean)
  - *Optional*, defaults to `true`
  - If set to true, the peer will automatically start the discovery process after creation and initialization
  - If set to false, the peer will not automatically start the discovery process
#### **wsServerOptions** (object)
  - *Optional*, defaults to empty object `{}`
  - If given, the peer will use the provided object to create the `ws` (WebSockets) server. See https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback for more options and additional information.

### Peer Constructor Example
```js
/*
  Create a peer, `peer`, using `myRingPulicKey.pub`, `myPeerPublicKey.pub`, 
  `myPeerPublicKey.pem`, and `myPeerSignature` files, that listens on port 
  `26780` and will attempt to discover the address `127.0.0.1:26781` via 
  autodiscovery (`startDiscovery`), post-creation. This peer will, if given 
  an IP to discover with no port, scan ports 26780-26790 (inclusive) against 
  the IP in order to attempt to establish a secure connection with said IP. 
  This peer will report that it's public IP address is "127.0.0.1" and it 
  will also output diagnostics (`debug`).
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
  'publicAddress': "127.0.0.1",
  'startDiscovery': true,
  'debug': true,
});
```

### Setting up the event handlers
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
  /*
    A message has been received by the WebSocket server.

    NOTE:
      This event is only emitted if the message header's 'type' property is not 
      set or is not of type string. See custom message header type example below.
  */
});

peer.on('discovering', () => {
  /* The peer is discovering based on it's list of known or potential peers */
});

peer.on('discovered', () => {
  /* The peer is done discovering */
});

peer.on('your_custom_message_header_type', () => {
  /*
    The peer has received a message of "unknown" (custom) type and emits the 
    message header's 'type' property.
    
    NOTE:
      These "unknown" (custom) events are only emitted if the message header's 'type' 
      property is a string.
  */
});
```

### Creating and Sending Messages
```js
// Create a new Message object with header type of 'blahblahblah' and an object for its body.
var message = new Message({
  'type': "MySuperCoolMessage",
  'body': {
    'someProperty': someValue
  }
});

// Broadcast the message to all connected, verified peers
peer.broadcast({ message });
```

### Listening for Messages
```js
peer.on("MySuperCoolMessage", ({ message, connection }) => {
  // Do something here
});
```

### Testing On Local Machine
1. Generate or bring-your-own HTTPS server key and certificate:
    ```bash
    $ npm run setup
    ```
2. In a terminal window, start the first peer (peer1):
    
    ```bash
    $ npm run peer1
    ```
    
3. In a second terminal window, start the second peer (peer2):
    
    ```bash
    $ npm run peer2
    ```
    
4. Once the peer-to-peer network has been established (post-HELO handshake), messages from one peer can be sent out to all other peers in the network securely, just as in a typical client-server scenario, but in a decentralized fashion. Every peer is a server and every peer is a client. There is no central management.
5. Type some text into terminal/prompt while the second peer (peer2) is running and hit enter. The second peer will send the message securely to the first peer (peer1), as the peers have established trust in the decentralized network.
6. Quit (`Ctrl^C` or type `exit` and hit enter) on the second terminal window to quit the second peer.
7. Verify the encrypted message sent by the second peer made it to the first peer (peer1) by returning to the first terminal window. The last few lines of output will now reflect the message sent by the second peer to the first peer and received by the first peer from the second peer.
8. Quit (`Ctrl^C` or type `exit` and hit enter) on the first terminal window to quit the first peer.