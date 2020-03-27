"use strict";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const crypto              = require('crypto');
const EventEmitter        = require('events');
const fs                  = require('fs');
const http                = require('http');
const https               = require('https');
const url                 = require('url');
const WebSocket           = require('ws');

const ManagedTimeouts     = require('./src/managedTimeouts');
const Message             = require('./src/message');
const onHelo              = require('./src/events/helo');
const onPeers             = require('./src/events/peers');
const onTrusted           = require('./src/events/trusted');
const onUnknown           = require('./src/events/unknown');
const RSAKeyPair          = require('./src/RSAKeyPair.js');
const utils               = require('./src/utils');

const HTTPS_SERVER_MODES  = require('./src/httpsServerModes');
const NoSuchFileError     = require('./src/NoSuchFileError');

const WebSocketClient     = WebSocket;
const WebSocketServer     = WebSocket.Server;

module.exports = class Peer {
  constructor({
    conrirmMessages     = true,
    credentials         = { 'key': "https.key.pem", 'cert': "https.cert.pem" },
    debug               = false,
    discoveryAddresses  = [],
    discoveryRange      = [],
    httpsServer,
    httpsServerMode     = HTTPS_SERVER_MODES.CREATE,
    port                = process.env.RINGNET_LISTEN || 26781,
    privateKey,
    publicAddress,
    publicKey,
    ringPublicKey       = "ring.pub",
    signature           = "peer.signature",
    wsServerOptions     = {}
  }) {
    this.closing_ = false;
    this.credentials_ = credentials;
    this.discoveryAddresses_ = [];
    this.discoveryAddressesUnparsed_ = discoveryAddresses;
    this.discoveryOperation_ = null;
    this.discoveryRange_ = discoveryRange;
    this.eventEmitter_ = new EventEmitter();
    this.httpsCert_;
    this.httpsCertLocation_;
    this.httpsKey_;
    this.httpsKey_Location_;
    this.httpsServer_ = httpsServer;
    this.httpsServerMode_ = httpsServerMode;
    this.initializationOperation_;
    this.isDebugEnabled_ = debug;
    this.isDiscovering_ = false;
    this.isInitializing_ = true;
    this.isReady_ = false;
    this.managedTimeouts_ = new ManagedTimeouts();
    this.onErrorHandler_;
    this.peerRSAKeyPair_;
    this.peers_ = [];
    this.port_ = port;
    this.privateKey_;
    this.privateKeyLocation_ = privateKey;
    this.publicAddress_ = publicAddress;
    this.publicKey_;
    this.publicKey_Location_ = publicKey;
    this.ringPublicKey_;
    this.ringPublicKeyLocation_ = ringPublicKey;
    this.ringRSAKeyPair_;
    this.signature_;
    this.signatureLocation_ = signature;
    this.untrustedConnections_ = {};

    this.reservedEventHandlers_ = {
      connection: null,
      discovered: null,
      discovering: null,
      error: null,
      ready: null,
      request: null
    };

    this.wsServerOptions_ = {
      keepAlive: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false,
      noServer: false,
      ...wsServerOptions
    };

    if(typeof this.wsServerOptions_.noServer === 'boolean' && 
      this.wsServerOptions_.noServer === true) {
        this.httpsServerMode_ = HTTPS_SERVER_MODES.NONE;
    }
  }

  init() {
    if(this.isReady_) {
      return Promise.resolve();
    }

    if(this.isInitializing_ && this.initializationOperation_) {
      return this.initializationOperation_;
    }

    this.isInitializing_ = true;

    this.initializationOperation_ = this.checkFiles([{
        description: "Ring Public Key",
        location: this.ringPublicKeyLocation_
      }, {
        description: "Peer Private Key",
        location: this.privateKeyLocation_
      }, {
        description: "Signature",
        location: this.signatureLocation_
      }])
      .then(() => {
        /* 
         * NOTE: Peer public is optional, can be derrived from private if not 
         * provided. All other files must exist in order to initialize peer.
         */
        return Promise.all([
          this.readPeerPrivateKey(),
          this.readPeerPublicKey(),
          this.readRingPublicKey(),
          this.readSignature()
        ]);
      })
      .then(() => {
        this.peerRSAKeyPair_ = new RSAKeyPair({
          privateKeyBuffer: this.privateKey_,
          publicKeyBuffer: this.publicKey_
        });

        this.ringRSAKeyPair_ = 
          new RSAKeyPair({ publicKeyBuffer: this.ringPublicKey_ });

        const signatureBuffer = Buffer.from(this.signature_, 'hex');
        const isValidSignature = 
          this.ringRSAKeyPair_.verify(this.peerRSAKeyPair_.public, 
            signatureBuffer);

        if(!isValidSignature) {
          throw new Error(`Invalid signature for given peer public key ` + 
            `and ring public key.`);
        }

        this.signature_ = signatureBuffer;
        
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(`Peer signature (last 16 bytes): ` + 
            `\n\t${this.signature_.toString('hex').slice(-32)}`);
        }

        return this.initServer();
      })
      .then(() => {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(`HTTP server is now listening on port ` + 
            `${this.httpsServer_.address().port}`);
        }

        this.initWsServer();

        this.isInitializing_ = false;
        this.isReady_ = true;
        if(typeof this.reservedEventHandlers_.ready === 'function') {
          this.reservedEventHandlers_.ready.apply(this, []);
        }

        this.parseDiscoveryAddresses(this.discoveryAddressesUnparsed_);
        return this.discover();
      })
      .catch((err) => {
        if(typeof this.reservedEventHandlers_.error === 'function') {
          this.reservedEventHandlers_.error.apply(this, [err]);
        } else {
          throw err;
        }
      });

    return this.initializationOperation_;
  }

  get httpsServer() { return this.httpsServer_; }

  get port() { return this.port_; }

  get peers() {
    let peers = this.peers_.slice(0);
    for(let i=peers.length-1; i>=0; i--) {
      if(!peers[i].connection.connected) {
        peers.splice(i, 1);
      }
    }
    return peers;
  }

  readPeerPrivateKey(path) {
    return utils.readFileAsync(this.privateKeyLocation_)
      .then(data => {
        this.privateKey_ = data;
      });
  }

  readPeerPublicKey(path) {
    return utils.readFileAsync(this.publicKey_Location_)
      .then(data => {
        this.publicKey_ = data;
      })
      .catch(err => {
        if(!(err instanceof NoSuchFileError) && !this.privateKeyLocation_) {
          throw err;
        }
      });
  }

  readRingPublicKey() {
    return utils.readFileAsync(this.ringPublicKeyLocation_)
      .then(data => {
        this.ringPublicKey_ = data;
      });
  }

  readSignature(path) {
    return utils.readFileAsync(this.signatureLocation_)
      .then(data => {
        this.signature_ = data;
      });
  }

  checkFiles(checks) {
    return new Promise((resolve, reject) => {
      for(let check of checks) {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(`Checking for ${check.description} at ${check.location}`);
        }
          
        // Make sure we have all the files necessary.
        fs.exists(check.location, (err) => {
            if(err) {
              return reject(new NoSuchFileError(`Invalid ${check.description} ` + 
                `file location (given: ${check.location}).`));
            }
          });
      }

      return resolve();
    });
  }

  initServer() {
    if(this.httpsServerMode_ === HTTPS_SERVER_MODES.NONE) {
      this.wsServerOptions_.noServer = true;
      return Promise.resolve();
    } else if(this.httpsServerMode_ === HTTPS_SERVER_MODES.CREATE) {
      return this.createHTTPServer()
        .then(() => {
          this.wsServerOptions_.server = this.httpsServer_;
          return this.startHTTPServer();
        });
    } else if(this.httpsServerMode_ === HTTPS_SERVER_MODES.PASS) {
      this.wsServerOptions_.server = this.httpsServer_;
      return this.startHTTPServer();
    }
  }

  initWsServer() {
    this.wsServer = new WebSocketServer(this.wsServerOptions_);

    this.wsServer.on('connection', (connection, request) => {
      this.onWebSocketConnection.apply(this, [connection, request]);
    });

    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.log(`WebSocket server is now listening on port ` + 
        `${this.wsServer.address().port}`);
    }
  }

  createHTTPServer() {
    return this.checkFiles([{
        description: "HTTPS Server Key",
        location:  this.credentials_.hasOwnProperty("key") ? 
          this.credentials_.key : "https.key.pem"
      }, {
        description: "HTTPS Server Certificate",
        location: this.credentials_.hasOwnProperty("cert") ? 
          this.credentials_.cert : "https.cert.pem"
      }])
      .then(() => {
        this.httpsCertLocation_ = this.credentials_.cert;
        this.httpsKey_Location_ = this.credentials_.key;

        return Promise.all([
          utils.readFileAsync(this.httpsCertLocation_),
          utils.readFileAsync(this.httpsKey_Location_)
        ]);
      })
      .then(results => {
        this.httpsCert_ = results[0];
        this.httpsKey_ = results[1];

        const creds = { 'cert': this.httpsCert_, 'key': this.httpsKey_ };

        this.httpsServer_ = 
          https.createServer(creds, (request, response) => {
            response.end();
          });
      });
  }

  startHTTPServer() {
    if(!this.httpsServer_ || typeof this.httpsServer_.address !== 'function') {
      return Promise.reject(new Error(`HTTP server is not defined!`));
    }

    // Null address return means the server hasn't been started, so start it.
    if(this.httpsServer_.address() === null) {
      return new Promise((resolve, reject) => {
          this.httpsServer_.on('error', (e) => {
            if(this.onErrorHandler_) {
              this.onErrorHandler_.apply(this, [e]);
            } else {
              console.log(e.stack);
            }

            return reject(e);
          });

          this.httpsServer_.on('listening', () => {
            return resolve();
          })

          this.httpsServer_.listen(this.port_);
        });
    }

    this.port_ = this.httpsServer_.address().port;
    return Promise.resolve();
  }

  on(event, callback) {
    if(typeof event !== 'string') {
      throw new Error(`Invalid parameter 'event'!`);
    }

    if(typeof callback !== 'function') {
      throw new Error(`Invalid parameter 'callback'!`);
    }

    if(this.reservedEventHandlers_.hasOwnProperty(event)) {
      this.reservedEventHandlers_[event] = callback;
    } else {
      /* istanbul ignore if */
      if(this.isDebugEnabled_) {
        console.log(`Registered event listener for event '${event}'.`);
      }

      this.eventEmitter_.on(event, callback);
    }
  }

  removeListener(event, callback) {
    if(typeof event !== 'string') {
      throw new Error(`Invalid parameter 'event'!`);
    }

    if(typeof callback !== 'function') {
      throw new Error(`Invalid parameter 'callback'!`);
    }

    if(this.reservedEventHandlers_.hasOwnProperty(event)) {
      this.reservedEventHandlers_[event] = null;
    } else {
      this.eventEmitter_.removeListener(event, callback);
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
    if(this.isDebugEnabled_) {
      console.log(`New WebSocket server connection...`);

      console.log(`\tremoteAddress = ` + 
        `${request.connection.remoteAddress}`);

      if(request.headers.hasOwnProperty('x-forwarded-for')) {
        const xForwardedFor = request.headers['x-forwarded-for'];
        console.log(`\tx-forwarded-for = ` + 
          `${xForwardedFor.split(/\s*,\s*/)[0]}`);
      }
    }
    
    if(typeof this.reservedEventHandlers_.request === 'function') {
      this.reservedEventHandlers_.request.apply(this, 
        [{ connection, request }]);
    }

    this.setupConnection({ connection, request });
  }

  /**
   * Iterates through the given addresses for valid discovery addresses and 
   * adds those determined as valid to this.discoveryAddresses_.
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
        if(this.isDebugEnabled_) {
          console.log(e.stack);
        }
      }
    }
  }
  
  /**
   * Attempts to enqueue a given address (or object containing an address) to 
   * this peer's discovery array (this.discoveryAddresses_). This method only 
   * adds or enqueues addresses that are not already in this peer's discovery 
   * array, that this peer is not already connected to, and that do not have a 
   * signature equal to this peer's signature.
   * 
   * @param  {string|Object} obj 
   *         The address (as a string or object containing 'address' and 
   *         'signature' properties) to add to the discovery array.
   */
  enqueueDiscoveryAddress(obj) {
    let peer;

    if(typeof obj === 'string') {
      peer = { address: obj, signature: null };
    } else if(typeof obj === 'object') {
      const address = obj.hasOwnProperty("address") ? obj.address : null;
      const signature = obj.hasOwnProperty("signature") ? obj.signature : null;
      peer = { address, signature };
    } else {
      throw new Error(`Could not understand given addrress ${obj} ` +
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
      this.discoveryAddresses_.push(peer);
    } else if(this.isDebugEnabled_) {
      console.log(`Not connecting to peer ${JSON.stringify(peer)}`, 
        `\n\tinDiscoveryAddresses: ${inDiscoveryAddresses}`,
        `\n\tisConnectedTo: ${isConnectedTo}`,
        `\n\tisOwnSignature: ${isOwnSignature}`);
    }
  }

  /**
   * Starts discovery on the addresses listed in this peer's discovery array 
   * (this.discoveryAddresses_).
   */
  discover() {
    if(this.isDiscovering_ && this.discoveryOperation_) {
      return this.discoveryOperation_;
    }

    this.isDiscovering_ = true;

    if(typeof this.reservedEventHandlers_.discovering === 'function') {
      this.reservedEventHandlers_.discovering.apply(this, []);
    }

    this.discoveryOperation_ = new Promise((resolve) => {
      const discoveryLoopCycle = () => {
        if(!this.discoveryAddresses_ || this.discoveryAddresses_.length === 0) {
          this.isDiscovering_ = false;
          this.discoveryOperation_ = null;

          if(typeof this.reservedEventHandlers_.discovered === 'function') {
            this.reservedEventHandlers_.discovered.apply(this, []);
          }

          return resolve();
        }

        const peerToDiscover = this.discoveryAddresses_.splice(0,1)[0];

        return this.discoverPeer(peerToDiscover)
          .catch((err) => {
            /* istanbul ignore if */
            if(this.isDebugEnabled_) {
              console.error(err.stack);
            }
          })
          .then(() => {
            return discoveryLoopCycle();
          });
      };

      return discoveryLoopCycle();
    });
    
    return this.discoveryOperation_;
  }

  /* 
   * Cycle through our discoveryAddresses array and try to connect to each 
   * potential peer via WebSocketClient.
   */
  discoverPeer(peerToDiscover) {
    const isConnectedTo = this.isConnectedTo(peerToDiscover);
    const isOwnSignature = this.isOwnSignature(peerToDiscover.signature);
    
    if(isConnectedTo) {
      throw new Error(`Already connected to given peer!`);
    }

    if(isOwnSignature) {
      throw new Error(`Signature matches own signature!`);
    }

    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.log("------------------------------------------");
      console.log(JSON.stringify(peerToDiscover, true));
      console.log("------------------------------------------");
    }
    
    // Strip prefix of "::ffff:" (address is IPv4).
    peerToDiscover.address = utils.stripIpv4Prefix(peerToDiscover.address);

    let parsedAddress = utils.parseUrl(peerToDiscover.address);
    
    /*
     * If the parsed address doesn't contain a port and this peer has a given 
     * discovery range, expand the address into all discoverable addresses (for 
     * all ports specified in this peer's discovery range).
     */
    if(!parsedAddress.port) {
      let ports = [];

      if (utils.isValidRange(this.discoveryRange_)) {
        ports = utils.expandRange(this.discoveryRange_);
      } else if(this.port_) {
        ports = [this.port_];
      }

      for(let port of ports) {
        try {
          this.enqueueDiscoveryAddress({
              'address': `${url.format({ ...parsedAddress, port })}`,
              'signature': peerToDiscover.signature
            });
        } catch(e) {
          /* istanbul ignore next */
          if(this.isDebugEnabled_) {
            console.log(e.stack);
          }
        }
      }
      
      return Promise.resolve();
    }

    return this.attemptConnection(peerToDiscover.address, parsedAddress)
      .catch(err => {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log('Connect Error: ' + err.toString());
        }
      });
  };

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
    if(this.isDebugEnabled_) {
      console.log(`Attempting connection to ${url.format(parsedAddress)}`);
    }

    return new Promise((resolve, reject) => {
      const formattedAddress = url.format(parsedAddress);
      const client = new WebSocketClient(formattedAddress);

      client.connecting = true;

      client.on('error', reject);
      
      client.on('open', () => {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(`Successfully connected to remote peer` +
            `\n\t-> Address: ${client._socket.remoteAddress}` + 
            `\n\t-> Port: ${client._socket.remotePort}`);
        }
        
        client.originalAddress = originalAddress;
        client.originalPort = parsedAddress.port;
        client.parsedAddress = formattedAddress;
        
        //Set up the connection
        return this.setupConnection({ connection: client })
          .then((connection) => {
            delete this.untrustedConnections_[connection.id];
            return resolve(client);
          });
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
   * @return {Promise}
   *         A promise which resolves when the connection is determined to be 
   *         trustworthy or rejects when the connection is determined to be 
   *         untrustworthy.
   */
  async setupConnection({ connection, request=null }) {
    // We have to have a valid connection to the peer in order to continue
    if(!connection) {
      /* istanbul ignore if */
      if(this.isDebugEnabled_) {
        console.error("Connection is null or undefined!");
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

    connection.connected = true;
    connection.trusted = false;
    connection.id = crypto
      .createHash('sha256')
      .update(crypto.randomBytes(32))
      .digest('hex');
    
    if(!connection.hasOwnProperty("originalAddress")) {
      try {
        connection.originalAddress = utils.parseAddressFromRequest(request);
      } catch(e) {
        connection.originalAddress = request.connection.remoteAddress;
      }

      /* istanbul ignore if */
      if(this.isDebugEnabled_) {
        console.log(`Parsed request address: ${connection.originalAddress}`);
      }
    }
    
    if(!connection.hasOwnProperty("originalPort")) {
      connection.originalPort = connection._socket.remotePort;
    }

    this.peers_.push({ request, connection, created: utils.utcTimestamp() });
    
    // Set up our message receiver event handler for every connection
    connection.on('message', (data) => {
      this.receive({ connection, message: data });
    });
    
    // Set up our error event handler for every connection
    connection.on('error', (err) => {
      this.onPeerConnectionError({ connection, error: err });
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
          'publicKey': this.peerRSAKeyPair_.export({ mode: 'public' }),
          'signature': this.signature_.toString('hex')
        }
      });

      await this.broadcastTo(connection, heloMessage);

      return new Promise((resolve, reject) => {
        this.untrustedConnections_[connection.id] = { resolve, reject };
        this.managedTimeouts_.setTimeout(() => {
          reject(new Error(`Connection trust timeout!`));
        }, 30000);
      });
    } catch(e) {
      /*
       * In case of error, log the stack. Most likely, if we're here, it is the 
       * result of an export error in RSAKey (above) or a message send error 
       * (connection.send).
       */
      console.error(e.stack);

      if(this.onErrorHandler_) {
        this.onErrorHandler_.apply(this, [e]);
      }
    }
  }

  /**
   * The error handler for any given peer connection.
   * 
   * @param  {WebSocketClient} options.connection
   *         The peer connection.
   */
  onPeerConnectionError({ connection, error }) {
    // Remove peer trust, make the peer prove trust again.
    connection.connected = false;
    connection.trusted = false;
    
    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.error("Connection Error: " + error.toString());
      console.error(JSON.stringify(error));
      console.error(error.stack);
    }

    if(this.onErrorHandler_) {
      this.onErrorHandler_.apply(this, [connection, error]);
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
    connection.connected = false;
    connection.trusted = false;
      
    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.log(`Connection closed with code: ${closeCode}`);
    }
        
    // Detect abnormal closure.
    if(closeCode !== 1000) {
      if(connection.hasOwnProperty('originalAddress')) {
        const signature = 
          connection.hasOwnProperty('peerPublicKeySignature') ? 
            connection.peerPublicKeySignature.toString('hex') : null;

        
        /*
        this.enqueueDiscoveryAddress([{
            'address': connection.originalAddress,
            'signature': signature
          }]);
        
        this.discover();
        */
      }
    }

    if(this.onErrorHandler_) {
      this.onErrorHandler_.apply(this, [connection, closeCode]);
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
    if(!connection || !message) {
      throw new Error(`Invalid arguments.`);
    }

    // Convert the message to a Message class object, if not already.
    if(!(message instanceof Message)) {
      message = new Message({ message });
    }
    
    // Convert the header 'type' property from number to human-readable string.
    let headerTypeString = Message.TYPE_STRING(message.header.type);
    
    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.log(`Incoming message '${headerTypeString}' from `+
        `${connection.remoteAddress} - ${connection.originalAddress} ` +
        `on port ${connection.originalPort}`);
    }

    connection.active = new Date(new Date().toUTCString());
    
    if(message.header.type === Message.TYPES._helo) {
      onHelo.apply(this, [{ connection, message }]);
    } else {
      if(connection.trusted) {
        // The connection has been trusted prior (HELO handshake).
        if(message.header.type == Message.TYPES._trusted) {
          onTrusted.apply(this, [{ connection, message }]);
        } else if (message.header.type == Message.TYPES._peers) {
          onPeers.apply(this, [{ connection, message }]);
        } else {
          onUnknown.apply(this, [{ connection, message }]);
        }
      } else {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(`Message received from `+
            `${connection.remoteAddress} - ${connection.originalAddress} ` +
            `on port ${connection.originalPort} but the connection is not ` + 
            `trusted so the message will be discarded.`);
        }
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
  async broadcast(options = {}) {
    // If there are no peers to broadcast to, return.
    if(this.peers.length < 1) {
      throw new Error(`No peers to broadcast message to!`);
    }

    let messageObject;
    
    if(options instanceof Message) {
      messageObject = options;
    }
    
    let { message=messageObject, connection=false } = options;
    const isInstanceOfMessage = (message instanceof Message);
    
    if(!message) {
      throw new Error(`Message missing or not valid!`);
    } else if(!isInstanceOfMessage) {
      try {
        message = JSON.stringify({ message });
      } catch(e) {
        throw new Error(`Converting message to JSON failed.`);
      }
    }

    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.log(`Broadcasting ${message} to ${this.peers.length} peers...`);
    }
    
    // If we weren't given a specific connection, send to all peers
    let toSendTo = connection ? [{ connection }]: this.peers;
    let broadcastPromises = [];
    
    for(let { connection } of toSendTo) {
      const broadcastPromise = 
        this.broadcastTo(connection, new Message({ message }))
          .catch((e) => {
            /* istanbul ignore if */
            if(this.isDebugEnabled_) {
              console.error(e.stack);
            }
          });

      broadcastPromises.push(broadcastPromise);
    }

    return Promise.all(broadcastPromises);
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
  async broadcastTo(connection, message) {
    if(!connection || !message) {
      throw new Error(`Invalid connection or message!`);
    }

    if(!this.isReady_) {
      await this.init();
    }

    if(!connection.connected) {
      if(connection.connecting) {
        await connection.trustOperation;
      } else {
        throw new Error(`Connection is not open!`);
      }
    }

    if(message.header.type !== Message.TYPES._helo) {
      if(connection.trusted) {
        try {
          message.header.signature = 
            (this.peerRSAKeyPair_.sign(JSON.stringify(message.body)))
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
      } else {
        throw new Error(`Cannot send message before connection is trusted!`);
      }
    }

    return new Promise((resolve, reject) => {
      connection.send(message.toString(), (err) => {
        if(err) {
          return reject(err);
        }
        return resolve({ connection, message });
      });
    });
  }
  
  /** Closes the peer, all peer connections, etc. */
  async close() {
    if(!this.isReady_) {
      await this.init();
    }

    this.isReady_ = false;

    for(let p of this.peers_) {
      try {
        p.connection.close();
      } catch(e) {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.error(e.stack);
        }
      }
    }

    this.managedTimeouts_.destroy();

    if(this.wsServer) {
      this.wsServer.close();
    }

    if(this.httpsServer_) {
      this.httpsServer_.close();
    }
  }
  
  /** Checks if a given signature matches this peer's signature. */
  isOwnSignature(s) {
    if(!s) {
      return false;
    }

    if(Buffer.isBuffer(s)) {
      s = s.toString('hex');
    }

    return s === this.signature_.toString('hex');
  }
  
  /** Checks if the given peer is enqueued in the discovery addresses array. */
  inDiscoveryAddresses(peer) {
    let str = JSON.stringify(peer);
    for(let i=0; i<this.discoveryAddresses_.length; i++) {
      if(JSON.stringify(this.discoveryAddresses_[i]) == str) {
        return true;
      }
    }
    
    return false;
  }
  
  /** Checks if peer is connected to the given address / signature. */
  isConnectedTo(peer) {
    const { signature } = peer;

    for(let i=0; i<this.peers_.length; i++) {
      const connectedPeer = this.peers_[i];
      const hasPeerPublicKeySignature = 
        connectedPeer.connection.hasOwnProperty('peerPublicKeySignature');

      /*
       * Check if we're connected to the peer before checking if the peer is 
       * the same as the one given. If all the above, return true right away
       */
      if(hasPeerPublicKeySignature) {
        const connectedPeerSignature = 
          connectedPeer.connection.peerPublicKeySignature.toString('hex');
        
        if(connectedPeerSignature === signature) {
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
    for(let i=0; i<this.peers_.length; i++) {
      if(this.peers_[i].connection.hasOwnProperty("peerPublicKeySignature") && 
        this.peers_[i].connection.hasOwnProperty("originalAddress")) {
          let peerPublicKeySignatureHex = 
            this.peers_[i].connection.peerPublicKeySignature.toString('hex');
            
          if(signaturesToOmit.indexOf(peerPublicKeySignatureHex) < 0) {
            peerList.push({
              'address': `${this.peers_[i].connection.originalAddress
                .slice(0).replace(/^::ffff:(.*)$/i, "$1")}` + 
                (
                  this.peers_[i].connection.originalAddress.indexOf(":") > -1 ? 
                  `` : `:${this.peers_[i].connection.originalPort}`
                ),
              // 'remoteAddress': this.peers_[i].connection.remoteAddress,
              'signature': peerPublicKeySignatureHex,
              'created': this.peers_[i].created,
              'active': this.peers_[i].connection.active,
              'trusted': this.peers_[i].connection.trusted
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
        'key': this.httpsKey_Location_,
        'cert': this.httpsCertLocation_
      },
      'debug': this.isDebugEnabled_,
      'discoveryAddresses': this.discoveryAddresses_.concat(this.getPeerList()),
      'discoveryRange': this.discoveryRange_,
      'port': this.port_,
      'privateKey': this.privateKeyLocation_,
      'publicAddress': this.publicAddress_,
      'publicKey': this.publicKey_Location_,
      'ringPublicKey': this.ringPublicKeyLocation_,
      'signature': this.signatureLocation_,
      'wsServerOptions': {
        'autoAcceptConnections': 
          typeof this.wsServerOptions_.autoAcceptConnections !== "undefined" ? 
          this.wsServerOptions_.autoAcceptConnections : false,
        'ignoreXForwardedFor': 
          typeof this.wsServerOptions_.ignoreXForwardedFor !== "undefined" ? 
          this.wsServerOptions_.ignoreXForwardedFor : false,
        'keepAlive': typeof this.wsServerOptions_.keepAlive !== "undefined" ? 
          this.wsServerOptions_.keepAlive : false,
        'noServer': typeof this.wsServerOptions_.noServer !== "undefined" ? 
          this.wsServerOptions_.noServer : false
      }
    });
  }
  
};