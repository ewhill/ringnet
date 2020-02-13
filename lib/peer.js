"use strict";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const crypto            = require('crypto');
const EventEmitter      = require('events');
const fs                = require('fs');
const http              = require('http');
const https             = require('https');
const url               = require('url');
const WebSocket         = require('ws');

const ManagedTimeouts   = require('./src/managedTimeouts');
const Message           = require('./src/message');
const onConfirm         = require('./src/events/confirm');
const onHelo            = require('./src/events/helo');
const onPeers           = require('./src/events/peers');
const onTrusted         = require('./src/events/trusted');
const onUnknown         = require('./src/events/unknown');
const RSAKeyPair        = require('./src/RSAKeyPair.js');
const utils             = require('./src/utils');

const WebSocketClient     = WebSocket;
const WebSocketServer     = WebSocket.Server;

module.exports = class Peer extends EventEmitter {
  constructor({
    credentials         = { 'key': "https.key.pem", 'cert': "https.cert.pem" },
    debug               = false,
    discoveryAddresses  = [],
    discoveryRange      = [26780, 26790],
    httpsServer         = false,
    port                = process.env.RINGNET_LISTEN || 26781,
    privateKey          = null,
    publicAddress       = false,
    publicKey           = null,
    requireConfirmation = true,
    ringPublicKey       = "ring.pub",
    signature           = "peer.signature",
    startDiscovery      = true,
    wsServerOptions     = {}
  }) {
    super();
    
    // Set defaults on this
    this.closing = false;
    this.debug = debug;
    this.discovering = false;
    this.discoveryAddresses = [];
    this.httpsServer = httpsServer;
    this.managedTimeouts = new ManagedTimeouts();
    this.peers = [];
    this.port = port;
    this.publicAddress = publicAddress;
    this.range = discoveryRange;
    this.ready = false;
    this.requireConfirmation = requireConfirmation;
    this.startDiscovery = startDiscovery;

    this.wsServerOptions = {
      // maxReceivedFrameSize: 64 * 1024 * 1024, //64MiB
      // maxReceivedMessageSize: 64 * 1024 * 1024, //64MiB
      // fragmentOutgoingMessages: false,
      keepAlive: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false,
      noServer: false
    };

    // Overwrite websocket server options if given options in constructor
    this.wsServerOptions = Object.assign(this.wsServerOptions, wsServerOptions);

    this.noServer = (this.wsServerOptions.hasOwnProperty("noServer") && 
      typeof this.wsServerOptions.noServer == "boolean") ? 
      this.wsServerOptions.noServer : false;
    
    // We will be cycling through 'checks' in order to make sure we are given 
    // the correct files needed to create this peer.
    let checks = [{
        // We require a ring public key to join the network.
        description: "Ring Public Key",
        location: ringPublicKey
      }, {
        // We require a valid peer privateKey to join network.
        description: "Peer Private Key",
        location: privateKey
      }, {
        // We require a valid signature to join / validate peers on network.
        description: "Signature",
        location: signature
      }];
    
    /* istanbul ignore else */
    if(!this.noServer) {
      /*
       * If valid 'httpsServer' option not provided, check to make sure at 
       * least given HTTPS credentials in order to create a HTTPS server later.
       */
      
      /* istanbul ignore else */
      if(!this.httpsServer || 
        utils.getClassName(this.httpsServer) !== "Server") {
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`A valid 'httpsServer' option was not given; the ` + 
              `'credentials' option will be checked for valid HTTPS ` + 
              `credentials instead.`);
          }
          
          checks = checks.concat([{
            description: "HTTPS Server Key",
            location:  credentials.hasOwnProperty("key") ? 
              credentials.key : "https.key.pem"
          }, {
            description: "HTTPS Server Certificate",
            location: credentials.hasOwnProperty("cert") ? 
              credentials.cert : "https.cert.pem"
          }]); 
      } else {
        /* istanbul ignore if */
        if(this.debug) {
          console.log(`A valid 'httpsServer' option given; the ` + 
            `'credentials' option will be IGNORED.`);
        }
      }
    } else {
      /* instanbul ignore if */
      if(this.debug) {
        console.log(`Option 'noServer' set to true; SKIPPING creation of ` + 
          `HTTPS server.`);
      }
    }
    
    for(let check of checks) {
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`Checking for ${check.description} at ${check.location}`);
      }
        
      // Make sure we have all the files necessary.
      if(!fs.existsSync(check.location)) {
        throw new Error(`Invalid ${check.description} file location (given: ` + 
          `${check.location}).`);
      }
    }

    // Read the ring public RSA key (this is required to exist)
    this.ringPublicKeyLocation = ringPublicKey;
    this.ringRSAKeyPair = new RSAKeyPair({ publicKeyPath: ringPublicKey });

    // Read the peer private RSA key (this is required to exist)
    this.privateKeyLocation = privateKey;
    this.publicKeyLocation = publicKey;

    this.peerRSAKeyPair = new RSAKeyPair({
        privateKeyPath: this.privateKeyLocation,
        publicKeyPath: this.publicKeyLocation
      });
    
    // Read the peer signature (this is required to exist)
    this.signatureLocation = signature;

    const signatureData = fs.readFileSync(this.signatureLocation, 'utf8');
    this.signature = Buffer.from(signatureData, 'hex');
    
    /*
     * Check to make sure that our signature is verifiable by the ring PUBLIC 
     * key. In other words, check to make sure the signature was generated by 
     * ring PRIVATE key from our peer PUBLIC key. If not, we're probably not 
     * going to be allowed on the network so we will have to abort peer 
     * creation altogether.
     */
    const signatureIsValid = 
      this.ringRSAKeyPair.verify(this.peerRSAKeyPair.public, this.signature);

    if(!signatureIsValid) {
      throw new Error(`Invalid signature for given peer public key and ring ` +
        `public key.`);
    }
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Peer signature (last 50 bytes): ` +
        `\n\t${this.signature.slice(-50).toString("hex")}`);
    }
    
    /* 
     * Only create the https server if we haven't specified the `noServer` 
     * property in `this.wsServerOptions`.
     */
    /* istanbul ignore else */
    if(!this.noServer) {
      // Not given an 'httpsServer' in constructor arguments; maybe create one.
      /* istanbul ignore else */
      if(!this.httpsServer || 
        utils.getClassName(this.httpsServer) !== "Server") {
          this.createHttpServer(credentials);
      } else {
        /* istanbul ignore if */
        if(this.debug) {
          console.log(`HTTPS server already created.`);
        }
      }

      this.startHttpServer();

      // Make sure the WebSocket server knows to use this newly created server
      this.wsServerOptions.server = this.httpsServer;
    } else {
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`'noServer' option given; HTTPS server will NOT be ` + 
          `created.`);
      }

      this.emit('ready');
      this.ready = true;
    }

    // Create the WebSocket server
    this.wsServer = new WebSocketServer(this.wsServerOptions);
    
    this.wsServer.on('connection', (connection, request) => {
        this.onWebSocketConnection.apply(this, [connection, request]);
      });

    this.parseDiscoveryAddresses(discoveryAddresses);
    
    if(this.startDiscovery) {
      this.discover();
    }
  }

  /**
   * Creates a HTTP server from the given credentials.
   * 
   * @param  {Object} credentials 
   *         The HTTP server credentials. Valid properties are 'cert' and 'key'.
   */
  createHttpServer(credentials = {}) {
    const { key, cert } = credentials;

    if(!key || !cert) {
      throw new Error(`Error creating HTTP server; invalid ` + 
        `or no key or cert given.`);
    }

    /* istanbul ignore if */
    if(this.debug) {
      console.log("Creating HTTPS server...");
    }

    // Read the HTTPS Server key (this is required to exist)
    this.httpsKeyLocation = key;
    this.httpsKey = fs.readFileSync(key, 'utf8');
    
    // Read the HTTPS Server key (this is required to exist)
    this.httpsCertLocation = cert;
    this.httpsCert = fs.readFileSync(cert, 'utf8');

    // Create the httpsServer (dummy)
    this.httpsServer = https.createServer({
        'cert': this.httpsCert,
        'key': this.httpsKey
      }, (request, response) => {
        /* 
         * Process HTTP request. Since we're writing just WebSockets server 
         * we don't have to implement anything.
         */
        /* istanbul ignore next */
        return response.end();
      });
  }

  /** Starts the peer HTTP server. */
  startHttpServer() {
    /*
     * Either start the HTTPS server if we created one, or proceed by emitting 
     * the 'ready' event if one has already been created and we are simply 
     * leveraging it instead.
     */
    if(this.httpsServer.address() === null) {
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`Starting HTTPS server listening on ${this.port}...`);
      }

      // Server isn't already listening (possible created from 'if' block 
      // direcrtly above) so we need to tell it to start listening on port 
      // defined by 'port'.
      this.httpsServer.listen(this.port, () => {
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Server listening on ${this.port}`);
          }

          this.emit('ready');
          this.ready = true;
        });
    } else {
      this.port = this.httpsServer.address().port;

      /* istanbul ignore if */
      if(this.debug) {
        console.log(`HTTPS server already listening on ${this.port}.`);
      }

      // Server is already listening, emit ready and set the ready flag.
      this.emit('ready');
      this.ready = true;
    }
  }

  /**
   * The handler called when the WebSocketServer receives a new connection.
   * 
   * @param  {WebSocketClient} connection 
   *         The remote connection.
   * @param  {Object} request 
   *         The HTTP request object made to establish the WebSocket 
   *         connecction.
   */
  onWebSocketConnection(connection, request) {
    /* istanbul ignore if */
    if(this.debug) {
      console.log("New WebSocket server connection...");

      console.log(`\tremoteAddress = ` + 
        `${request.connection.remoteAddress}`);

      if(request.headers.hasOwnProperty("x-forwarded-for")) {
        const xForwardedFor = request.headers['x-forwarded-for'];
        console.log(`\tx-forwarded-for = ` + 
          `${xForwardedFor.split(/\s*,\s*/)[0]}`);
      }
    }
    
    this.emit('request', { connection, request });
    this.setupConnection({ connection, request });
  }

  /**
   * Iterates through the given addresses for valid discovery addresses and 
   * adds those determined as valid to this.discoveryAddresses.
   * 
   * @param  {Array} addresses 
   *         The list of addresses to parse.
   */
  parseDiscoveryAddresses(addresses) {
    for(let obj of addresses) {
      try {
        this.enqueueDiscoveryAddress(obj);
      } catch(e) {
        /* istanbul ignore next */
        if(this.debug) {
          console.log(e.message);
        }
      }
    }
  }
  
  /**
   * Attempts to enqueue a given address (or object containing an address) to 
   * this peer's discovery array (this.discoveryAddresses). This method only 
   * adds or enqueues addresses that are not already in this peer's discovery 
   * array, that this peer is not already connected to, and that do not have a 
   * signature equal to this peer's signature.
   * 
   * @param  {string|Object} obj 
   *         The address (as a string or object containing 'address' and 
   *         'signature' properties) to add to the discovery array.
   */
  enqueueDiscoveryAddress(obj)  {
    let peer;

    if(typeof obj === 'string') {
      peer = { address: obj, signature: null };
    } else if(typeof obj === 'object') {
      const address = obj.hasOwnProperty("address") ? obj.address : null;
      const signature = obj.hasOwnProperty("signature") ? obj.signature : null;
      peer = { address, signature };
    } else {
      throw new Error(`Could not understand given addrress ${obj.toString()} ` +
        `because it was neither a valid address string nor an object ` + 
        `with valid address properties ('address', 'signature').`);
    }

    const inDiscoveryAddresses = this.inDiscoveryAddresses(peer);
    const isConnectedTo = this.isConnectedTo(peer);
    const isOwnSignature = this.isOwnSignature(peer.signature);
      
    /*
     * If we haven't seen this discovery address before and we aren't already 
     * connected to it, push it to our discovery queue.
     */
      
    /* istanbul ignore else */
    if(!inDiscoveryAddresses && !isConnectedTo && !isOwnSignature) {
      this.discoveryAddresses.push(peer);
    } else if(this.debug) {
      console.log(`Not connecting to peer ${JSON.stringify(peer)}`, 
        `\n\tinDiscoveryAddresses: ${inDiscoveryAddresses}`,
        `\n\tisConnectedTo: ${isConnectedTo}`,
        `\n\tisOwnSignature: ${isOwnSignature}`);
    }
  }

  /**
   * Starts discovery on the addresses listed in this peer's discovery array 
   * (this.discoveryAddresses).
   */
  discover() {
    if(!this.discoveryAddresses || this.discoveryAddresses.length < 1) {
      this.discovering = false;
      this.emit('discovered');
      return Promise.resolve();
    }
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Discovering on ${this.discoveryAddresses.length} ` + 
        `addresses...`);
    }
    
    this.discovering = true;
    this.emit('discovering');

    /* 
     * Cycle through our discoveryAddresses array and try to connect to each 
     * potential peer via WebSocketClient.
     */
    const discoverOne = (peerToDiscover) => {
        const isConnectedTo = this.isConnectedTo(peerToDiscover);
        const isOwnSignature = this.isOwnSignature(peerToDiscover.signature);
        
        if(isConnectedTo || isOwnSignature) {
            return Promise.resolve();
        }

        /* istanbul ignore if */
        if(this.debug) {
          console.log("------------------------------------------");
          console.log(JSON.stringify(peerToDiscover, true));
          console.log("------------------------------------------");
        }
        
        // Strip prefix of "::ffff:" (address is IPv4).
        peerToDiscover.address = utils.stripIpv4Prefix(peerToDiscover.address);

        let parsedAddress = utils.parseUrl(peerToDiscover.address);
        
        /*
         * If the parsed address doesn't contain a port and this peer has a 
         * given discovery range, expand the address into all discoverable 
         * addresses (for all ports specified in this peer's discovery range).
         */
        if(!parsedAddress.port) {
          let ports = [];

          if(utils.isValidRange(this.range)) {
            ports = utils.expandRange(this.range);
          } else {
            ports = [this.port];
          }

          for(let port of ports) {
            try {
              this.enqueueDiscoveryAddress({
                  'address': `${url.format({ ...parsedAddress, port })}`,
                  'signature': peerToDiscover.signature
                });
            } catch(e) {
              /* istanbul ignore next */
              if(this.debug) {
                console.log(e.message);
              }
            }
          }
          
          return Promise.resolve();
        }

        return this.attemptConnection(peerToDiscover.address, parsedAddress)
          .catch((err) => {
            /* istanbul ignore if */
            if(this.debug) {
              console.log('Connect Error: ' + err.toString());
            }
          });
      };

    // Called after discovering on a single address, and can move on to next.
    const discoverNext = () => {
        if(this.discoveryAddresses.length === 0) {
          this.emit('discovered');
          return;
        }

        return discoverOne(this.discoveryAddresses.splice(0,1)[0])
          .then(discoverNext); // recurse
      };
    
    return discoverNext();
  }

  /**
   * Attempts to establish a WebSocket client connection to the given address.
   * 
   * @param  {string} originalAddress 
   *         The original address, as enqueued by this peer.
   * @param  {[type]} parsedAddress 
   *         The parsed address containing information extracted from the 
   *         original address, such as scheme, address, port, hash, etc.
   * @return {Promise} 
   *         A promise which resolves or rejects based on result of the 
   *         attempted connection.
   */
  attemptConnection(originalAddress, parsedAddress) {
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Attempting connection to ${url.format(parsedAddress)}`);
    }

    return new Promise((resolve, reject) => {
        const formattedAddress = url.format(parsedAddress);
        const client = new WebSocketClient(formattedAddress);

        client.on('error', reject);
        
        client.on('open', () => {
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Successfully connected to:\n\t` +
              `Address: ${client._socket.remoteAddress}\n\t` + 
              `Port: ${client._socket.remotePort}`);
          }
          
          client.originalAddress = originalAddress;
          client.originalPort = parsedAddress.port;
          client.parsedAddress = formattedAddress;
          
          //Set up the connection
          this.setupConnection({ connection: client });
          
          return resolve(client);
        });
      });
  }

  /**
   * Adds connection properties and event handlers in order to start a channel 
   * of communication.
   * 
   * @param  {WebSocketClient} options.connection 
   *         The connection to set up.
   * @param  {Object} options.request 
   *         The HTTP request object. Defaults to null if not given.
   */
  setupConnection({ connection, request=null }) {
    // We have to have a valid connection to the peer in order to continue
    if(!connection) {
      /* istanbul ignore if */
      if(this.debug) {
        console.error("Peer.setupConnection: connection is null or undefined!");
      }

      return;
    }
    
    /*
     * We CANNOT trust the connection until after the HELO handshake takes 
     * place and we are able to verify the connection's (peer's) public key via 
     * a 'trusted' message exchange. Until the said is complete, the connection 
     * cannot and will not be trusted and no other messages will be sent or 
     * received other than 'helo'.
     */

    connection.confirmedMessages = [];
    connection.connected = true;
    connection.requireConfirmation = false;
    connection.trusted = false;
    connection.unconfirmedMessages = [];
    
    if(!connection.hasOwnProperty("originalAddress")) {
      try {
        connection.originalAddress = utils.parseAddressFromRequest(request);
      } catch(e) {
        connection.originalAddress = request.connection.remoteAddress;
      }

      /* istanbul ignore if */
      if(this.debug) {
        console.log(`Parsed request address: ${connection.originalAddress}`);
      }
    }
    
    if(!connection.hasOwnProperty("originalPort")) {
      connection.originalPort = connection._socket.remotePort;
    }

    // Add the connection to our list of peers
    this.peers.push({ request, connection, created: utils.utcTimestamp() });
    
    // Set up our message receiver event handler for every connection
    connection.on('message', (data) => {
      this.receive({ connection, 'message': data });
    });
    
    // Set up our error event handler for every connection
    connection.on('error', (err) => {
      this.onPeerConnectionError({ connection });
    });
    
    // Set up our connection close event handler for every connection
    connection.on('close', (code) => {
      this.onPeerConnectionClose({ connection, closeCode: code });
    });
    
    /* 
     * Now it's time to perform the HELO handshake to the Connection. This 
     * handshake happens BOTH ways - e.g. a received HELO is responded to 
     * by sending a HELO, in total, making the handshake.
     */
    try {
      /*
       * We have to send our public key and public key signature (signed by the 
       * ring private key) to the connection (peer) for validation. The peer 
       * will do the same for this peer, so both can establish trust with one 
       * another.
       */
      let heloMessage = new Message({
        type: Message.TYPES._helo,
        body: {
          'publicKey': this.peerRSAKeyPair.export({ mode: 'public' }),
          'signature': this.signature.toString('hex')
        }
      });

      this.broadcastTo(connection, heloMessage);
    } catch(e) {
      /*
       * In case of error, log the stack. Most likely, if we're here, it is the 
       * result of an export error in RSAKey (above) or a message send error 
       * (connection.send).
       */
      console.error(e.stack);
    }
  }

  /**
   * The error handler for any given peer connection.
   * 
   * @param  {WebSocketClient} options.connection
   *         The peer connection.
   */
  onPeerConnectionError({ connection }) {
    // Remove peer trust, make the peer prove trust again.
    connection.trusted = false;
      
    /* istanbul ignore if */
    if(this.debug) {
      console.error("Connection Error: " + err.toString());
      console.error(JSON.stringify(err));
      console.error(err.stack);
    }
  }

  /**
   * The close handler for any given peer connection.
   * 
   * @param  {WebSocketClient} options.connection 
   *         The peer connection.
   * @param  {number} options.closeCode  
   *         The close code describing the close event.
   */
  onPeerConnectionClose({ connection, closeCode }) {
    // Remove peer trust, make the peer prove trust again.
    connection.trusted = false;
      
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Connection closed with code: ${closeCode}`);
    }
        
    // Detect abnormal closure.
    if(closeCode !== 1000) {
      if(connection.hasOwnProperty("originalAddress")) {
        const hasSignature = 
          connection.hasOwnProperty("peerPublicKeySignature");
        const signature = 
          hasSignature ? connection.peerPublicKeySignature.toString('hex') : 
          null;

        this.discoveryAddresses.push({
          'address': connection.originalAddress,
          'signature': signature
        });
        
        /* 
         * On an abnormal close, we should try to discover in order to 
         * reattempt connection with the peer we lost.
         */
        if(!this.discovering && this.ready) {
          this.discover.apply(this, null);
        }
      }
    }
  }
  
  /**
   * The handler called when the peer receives a message.
   * 
   * @param  {WebSocketClient} options.connection 
   *         The connection that sent the message.
   * @param  {[type]} options.message    
   *         The message received by the peer.
   */
  receive({ connection, message }) {
    if(message) {
      // Convert the message to a Message class object.
      message = new Message({ message });
    } else {
      return;
    }
    
    // Convert the header 'type' property from number to human-readable string.
    let headerTypeString = Message.TYPE_STRING(message.header.type);
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Incoming message '${headerTypeString}' from `+
        `${connection.remoteAddress} - ${connection.originalAddress} ` +
        `on port ${connection.originalPort}`);
    }

    connection.active = new Date(new Date().toUTCString());
    
    if(message.header.type === Message.TYPES._helo) {
      onHelo.apply(this, [{ connection, message }]);
    } else if(connection.trusted) {
      // The connection has been trusted prior (HELO handshake).
      if(message.header.type == Message.TYPES._trusted) {
        onTrusted.apply(this, [{ connection, message }]);
      } else if(message.header.type == Message.TYPES._confirm) {
        onConfirm.apply(this, [{ connection, message }]);
      } else if (message.header.type == Message.TYPES._peers) {
        onPeers.apply(this, [{ connection, message }]);
      } else {
        onUnknown.apply(this, [{ connection, message }]);
      }
    }
  }

  /**
   * Broadcasts a message to all connected peers. This method will throw an 
   * error if there are no peers or if the message to send is invalid.
   * 
   * @param  {Object|Message|String} options 
   *         The broadcast options. If the options parameter is a Message, the 
   *         options will be used as the message to send. If the options 
   *         parameter is a string, it will be converted into a Message and 
   *         sent. If the options parameter is an object, valid properties can 
   *         be 'message' (a message to send) and 'connection' (the connection 
   *         to which to send the message).
   */
  broadcast(options = {}) {
    // If there are no peers to broadcast to, return.
    if(this.peers.length < 1) {
      throw new Error(`No peers to broadcast message to!`);
    }

    let msg = false;
    
    if(options instanceof Message) {
      // Support for `peer.broadcast(<Message>);`
      msg = options;
    } else if(typeof options === 'string') {
      // Support for `peer.broadcast(<string>);`
      msg = new Message({
        type: Message.TYPES._message,
        body: options
      });  
    }
    
    let { message=msg, connection=false } = options;
    
    if(!message || typeof message == 'undefined') {
      throw new Error(`Message missing or not valid!`);
    } else if(!(message instanceof Message)) {
      try {
        message = JSON.stringify({ message });
      } catch(e) {
        throw new Error(`Converting message to JSON failed.`);
      }
    }

    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Broadcasting ${message} to ${this.peers.length} peers...`);
    }
    
    // If we weren't given a specific connection, send to all peers
    let toSendTo = connection ? [{ connection }]: this.peers;
    
    toSendTo.map(peer => {
      try {
        const messageCopy = new Message({ message });
        this.broadcastTo(peer.connection, messageCopy)
      } catch(e) {
        /* istanbul ignore if */
        if(this.debug) {
          console.error(e.message);
          console.error(e.stack);
        }
      }
    });
  }

  /**
   * Broadcasts a message to a single connection and tries to resent the 
   * message if the send fails.
   * 
   * @param  {WebSocketClient} connection 
   *         The connection to send the message to.
   * @param  {Message} message 
   *         The message to send to the connection.
   * @param  {Number} backoff 
   *         A backoff time (in ms) used as a delay before trying to resend the 
   *         message when the message send fails.
   */
  broadcastTo(connection, message, backoff=5000) {
    if(!connection || !message) {
      throw new Error(`Invalid connection or message!`);
    }

    if(!connection.connected) {
      throw new Error(`Connection is not open!`);
    }

    const isConfirmationMessage = 
      message.header.type === Message.TYPES._confirm;
    const isHeloMessage = message.header.type == Message.TYPES._helo;

    if(!isHeloMessage && !connection.trusted) {
      throw new Error(`Connection is not trusted!`);
    }
    
    if(!isConfirmationMessage && this.requireConfirmation) {
      connection.unconfirmedMessages.push(message);
      /*
       * Create timeout to check if the mssage was confirmed by the remote 
       * peer. If so, we simply step out of the timeout function, but if not 
       * then we try to resend the message to the remote peer. Wrap in 
       * anonymous function in order to preserve scope.
       */
      this.managedTimeouts.setTimeout(() => {
        for(let i=connection.confirmedMessages.length-1; i>=0; i--) {
          const { hash, timestamp } = connection.confirmedMessages[i].header;
          const hashesMatch = hash === msg.header.hash;
          const timestampsMatch = 
            timestamp.toString() === msg.header.timestamp;

          if(hashesMatch && timestampsMatch) {
            connection.confirmedMessages.splice(i,1)[0];
            return;
          }
        }
        
        // Message hasn't been confirmd by peer yet, try send again.
        this.broadcastTo(connection, message, backoff*1.5);
      }, backoff);
    }
    
    if(!isHeloMessage) {
      try {
        message.header.signature = 
          (this.peerRSAKeyPair.sign(JSON.stringify(message.body)))
            .toString('hex');

        const cipher = 
          crypto.createCipheriv('aes-256-cbc', connection.key, connection.iv);

        const messageBodyBuffer = Buffer.from(JSON.stringify(message.body));

        const encryptedMessageBodyBuffer = 
          Buffer.concat([cipher.update(messageBodyBuffer), cipher.final()]);

        message.body = encryptedMessageBodyBuffer.toString('base64');
      } catch(e) {
        throw new Error(`Could not encrypt message!`);
      }
    }
      
    const sendCallback = (err, backoff, connection, message, self) => {
      if(!err) return;

      /* istanbul ignore if */
      if(self.debug) {
        console.error(`ERROR (${err.code}): broadcast failed!`);
        console.error(`Attempting to resend message in ${backoff}ms.`);
      }
      
      self.managedTimeouts.setTimeout(() => {
        connection.send(message.toString(), (err) => {
          sendCallback(err, backoff*1.5, connection, message, self);
        });
      }, backoff);
    };
    
    connection.send(message.toString(), (err) => {
      sendCallback(err, backoff, connection, message, this);
    });
  }
  
  /** Closes the peer, all peer connections, etc. */
  close() {
    this.ready = false;
    
    for(let p of this.peers) {
      try {
        p.connection.close();
      } catch(e) {
        /* istanbul ignore if */
        if(this.debug) console.error(e.stack);
      }
    }

    this.managedTimeouts.destroy();
    this.wsServer.close();
    this.httpsServer.close();
  }
  
  /** Checks if a given signature matches this peer's signature. */
  isOwnSignature(s) {
    if(!s) return false;
    if(typeof s !== "string") s = s.toString('hex');
    return s == this.signature.toString('hex');
  }
  
  /** Checks if the given peer is enqueued in the discovery addresses array. */
  inDiscoveryAddresses(peer) {
    let str = JSON.stringify(peer);
    for(let i=0; i<this.discoveryAddresses.length; i++) {
      if(JSON.stringify(this.discoveryAddresses[i]) == str) {
        return true;
      }
    }
    
    return false;
  }
  
  /** Checks if peer is connected to the given address / signature. */
  isConnectedTo({ address, signature }) {
    if(this.signature.toString('hex') == signature) return true;
    
    for(let i=0; i<this.peers.length; i++) {
      const hasPeerPublicKeySignature = 
        this.peers[i].connection.hasOwnProperty('peerPublicKeySignature');

      /*
       * Check if we're connected to the peer before checking if the peer is 
       * the same as the one given. If all the above, return true right away
       */
      if(hasPeerPublicKeySignature) {
        const peerSignature = 
          this.peers[i].connection.peerPublicKeySignature.toString('hex');
        
        if(peerSignature == signature) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /** Returns a list of peers to which this peer is connected. */
  getPeerList(signaturesToOmit) {
    let peerList = [];
    
    if(!signaturesToOmit || !Array.isArray(signaturesToOmit))
      signaturesToOmit = [];
    
    /*
     * Add list of our known peers to the body, so that, when received by the 
     * other peer, it can discover those addresses as well, creating a fully 
     * connected, bidirectional graph (network).
     */
    for(let i=0; i<this.peers.length; i++) {
      if(this.peers[i].connection.hasOwnProperty("peerPublicKeySignature") && 
        this.peers[i].connection.hasOwnProperty("originalAddress")) {
          let peerPublicKeySignatureHex = 
            this.peers[i].connection.peerPublicKeySignature.toString('hex');
            
          if(signaturesToOmit.indexOf(peerPublicKeySignatureHex) < 0) {
            peerList.push({
              'address': `${this.peers[i].connection.originalAddress
                .slice(0).replace(/^::ffff:(.*)$/i, "$1")}` + 
                (
                  this.peers[i].connection.originalAddress.indexOf(":") > -1 ? 
                  `` : `:${this.peers[i].connection.originalPort}`
                ),
              // 'remoteAddress': this.peers[i].connection.remoteAddress,
              'signature': peerPublicKeySignatureHex,
              'created': this.peers[i].created,
              'active': this.peers[i].connection.active,
              'trusted': this.peers[i].connection.trusted
            });
          }
      }
    }
    
    return peerList;
  }
  
  /** Converts peer to a stringified JSON object. */
  toString() {
    return JSON.stringify({
      'credentials': {
        'key': this.httpsKeyLocation,
        'cert': this.httpsCertLocation
      },
      'debug': this.debug,
      'discoveryAddresses': this.discoveryAddresses.concat(this.getPeerList()),
      'discoveryRange': this.range,
      'port': this.port,
      'privateKey': this.privateKeyLocation,
      'publicAddress': this.publicAddress,
      'publicKey': this.publicKeyLocation,
      'requireConfirmation': this.requireConfirmation,
      'ringPublicKey': this.ringPublicKeyLocation,
      'signature': this.signatureLocation,
      'startDiscovery': this.startDiscovery,
      'wsServerOptions': {
        'autoAcceptConnections': 
          typeof this.wsServerOptions.autoAcceptConnections !== "undefined" ? 
          this.wsServerOptions.autoAcceptConnections : false,
        'ignoreXForwardedFor': 
          typeof this.wsServerOptions.ignoreXForwardedFor !== "undefined" ? 
          this.wsServerOptions.ignoreXForwardedFor : false,
        'keepAlive': typeof this.wsServerOptions.keepAlive !== "undefined" ? 
          this.wsServerOptions.keepAlive : false,
        'noServer': typeof this.wsServerOptions.noServer !== "undefined" ? 
          this.wsServerOptions.noServer : false
      }
    });
  }
  
};