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
    let checks = [{ // We require a ring public key to join the network
        description: "Ring Public Key",
        location: ringPublicKey
      }, { // We require a valid peer privateKey to join network
        description: "Peer Private Key",
        location: privateKey
      }, { // We require a valid signature to join / validate peers on network
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

  createHttpServer(credentials = {}) {
    const { key, cert } = credentials;

    if(!key || !cert) {
      throw new Error(`Error creating HTTP server; invalid ` + 
        `or no key or cert given.`);
    }

    /* istanbul ignore if */
    if(this.debug) console.log("Creating HTTPS server...");

    // Read the HTTPS Server key (this is required to exist)
    this.httpsKeyLocation = key;
    this.httpsKey = fs.readFileSync(key, 'utf8');
    
    // Read the HTTPS Server key (this is required to exist)
    this.httpsCertLocation = cert;
    this.httpsCert = fs.readFileSync(cert, 'utf8');

    // Create the httpsServer (dummy)
    this.httpsServer = https.createServer({
        'key': this.httpsKey,
        'cert': this.httpsCert
      }, (request, response) => {
        /* 
         * Process HTTP request. Since we're writing just WebSockets server 
         * we don't have to implement anything.
         */
        /* istanbul ignore next */
        return response.end();
      });
  }

  startHttpServer() {
    // Either start the HTTPS server if we created one, or proceed by emitting 
    // the 'ready' event if one has already been created and we are simply 
    // leveraging it instead.
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
          if(this.debug) console.log(`Server listening on ${this.port}`);

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
    let address = obj;

    if(typeof obj === 'string') {
      address = {
          address: obj,
          signature: null
        };
    } else if(typeof obj === 'object') {
      address = {
          address: obj.hasOwnProperty("address") ? obj.address : null,
          signature: obj.hasOwnProperty("signature") ? obj.signature : null
        };
    } else {
      throw new Error(`Could not understand given addrress ${obj.toString()} ` +
        `because it was neither a valid address string nor an object ` + 
        `with valid address properties ('address', 'signature').`);
    }

    // Ensure address not already in queue, already connected to, or self.
    let inDiscoveryAddresses = this.inDiscoveryAddresses(address),
      isConnectedTo = this.isConnectedTo(address),
      isOwnSignature = this.isOwnSignature(address.signature);
      
    /* istanbul ignore else */
    if(!inDiscoveryAddresses && !isConnectedTo && !isOwnSignature) {
      /*
       * If we haven't seen this discovery address before and we aren't already 
       * connected to it, push it to our discovery queue.
       */

      /* istanbul ignore if */
      if(this.debug) {
        console.log(`\t${JSON.stringify(address)}`);
      }

      this.discoveryAddresses.push(address);
    } else {
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`Not connecting to peer ${JSON.stringify(address)}`, 
          `\n\tinDiscoveryAddresses: ${inDiscoveryAddresses}`,
          `\n\tisConnectedTo: ${isConnectedTo}`,
          `\n\tisOwnSignature: ${isOwnSignature}`);
      }
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
      return;
    }
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Starting discovery on ${this.discoveryAddresses.length} ` + 
        `addresses...`);
    }
    
    this.discovering = true;
    this.emit('discovering');
    
    // Called after discovering on a single address, and can move on to next.
    const discoverNext = () => {
      if(this.discoveryAddresses.length === 0) {
        this.emit('discovered');
        return;
      }

      return discoverOne();
    };

    /* 
     * Cycle through our discoveryAddresses array and try to connect to each 
     * potential peer via WebSocketClient.
     */
    const discoverOne = () => {
      let peerToDiscover = this.discoveryAddresses.splice(0,1)[0];

      const isConnectedTo = this.isConnectedTo(peerToDiscover);
      const isOwnSignature = this.isOwnSignature(peerToDiscover.signature);
      
      if(isConnectedTo || isOwnSignature) {
          return discoverNext();
      }

      /* istanbul ignore if */
      if(this.debug) {
        console.log("------------------------------------------");
        console.log(JSON.stringify(peerToDiscover));
        console.log("------------------------------------------");
      }
      
      // Strip prefix of "::ffff:" (address is IPv4).
      peerToDiscover.address = 
        peerToDiscover.address.replace(/^::ffff:(.*)$/i, "$1");

      let parsedAddress = utils.parseUrl(peerToDiscover.address);
      
      /*
       * If the parsed address doesn't contain a port and this peer has a given 
       * discovery range, expand the address into all discoverable addresses 
       * (for all ports specified in this peer's discovery range).
       */
      if(!parsedAddress.port) {
        if(utils.isValidRange(this.range)) {
          for(let port of utils.expandRange(this.range)) {
            parsedAddress.port = port;
            
            try {
              this.enqueueDiscoveryAddress({
                  'address': `${url.format(parsedAddress)}`,
                  'signature': peerToDiscover.signature
                });
            } catch(e) {
              /* istanbul ignore next */
              if(this.debug) {
                console.log(e.message);
              }
            }
          }
        } else {
          // Try this peer's port
          parsedAddress.port = this.port;
          
          try {
            this.enqueueDiscoveryAddress({
                'address': `${url.format(parsedAddress)}`,
                'signature': peerToDiscover.signature
              });
          } catch(e) {
            /* istanbul ignore next */
            if(this.debug) {
              console.log(e.message);
            }
          }
        }
        
        return discoverNext();
      }
      
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`Attempting connection to ${url.format(parsedAddress)}`);
      }

      return this.attemptConnection(peerToDiscover.address, parsedAddress)
        .catch((err) => {
          /* istanbul ignore if */
          if(this.debug) {
            console.log('Connect Error: ' + err.toString());
          }
        })
        .then(discoverNext);
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

  setupConnection({ connection, request=null }) {
    // We have to have a valid connection to the peer in order to continue
    if(!connection) {
      /* istanbul ignore if */
      if(this.debug) {
        console.error("Peer.setupConnection: connection is null or undefined!");
      }

      return false;
    }
    
    /*
     * We CANNOT trust the connection until after the HELO handshake takes 
     * place and we are able to verify the connection's (peer's) public key via 
     * a 'trusted' message exchange. Until the said is complete, the connection 
     * cannot and will not be trusted and no other messages will be sent or 
     * received other than 'helo'.
     */

    connection.trusted = false;
    connection.connected = true;
    connection.confirmedMessages = [];
    connection.unconfirmedMessages = [];
    connection.requireConfirmation = false;
    
    if(!connection.hasOwnProperty("originalAddress")) {
      if(request && request.hasOwnProperty("httpRequest") && 
        request.httpRequest.hasOwnProperty("headers") &&
        request.httpRequest.headers.hasOwnProperty("x-forwarded-for")) {
          connection.originalAddress = 
            request.httpRequest.headers['x-forwarded-for'];
        
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Address parsed from ` + 
              `request.httpRequest.headers['x-forwarded-for']: ` +
              `${connection.originalAddress}`);
          }
      } else if(request && request.hasOwnProperty("connection") && 
        request.connection.hasOwnProperty("remoteAddress")) {
          connection.originalAddress = request.connection.remoteAddress;
          
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Address parsed from ` + 
              `request.connection.remoteAddress: ` +
              `${connection.originalAddress}`);
          }
      } else {
        let addressCopy = request.connection.remoteAddress.slice(0);
        connection.originalAddress = 
          addressCopy.replace(/^::ffff:(.*)$/i, "$1");
      
        /* istanbul ignore if */
        if(this.debug) {
          console.log(`Address parsed from connection: ` + 
            `${connection.originalAddress}`);
        }
      }
    }
    
    if(!connection.hasOwnProperty("originalPort")) {
      connection.originalPort = connection._socket.remotePort;
    }

    // Add the connection to our list of peers
    const timeNowUTCMs = new Date(new Date().toUTCString());
    this.peers.push({
        request,
        connection,
        created: timeNowUTCMs,
        active: timeNowUTCMs
      });
    
    // Set up our message receiver event handler for every connection
    connection.on('message', (data) => {
        this.receive({ connection, 'message': data });
      });
    
    // Set up our error event handler for every connection
    connection.on('error', (err) => {
        connection.trusted = false;
        connection.active = new Date(new Date().toUTCString());
        
        /* istanbul ignore if */
        if(this.debug) {
          console.error("Connection Error: " + err.toString());
          console.error(JSON.stringify(err));
          console.error(err.stack);
        }
      });
    
    // Set up our connection close event handler for every connection
    connection.on('close', (code) => {
        connection.trusted = false;
        connection.active = new Date(new Date().toUTCString());
        
        /* istanbul ignore if */
        if(this.debug) console.log(`Connection closed with code: ${code}`);
            
        // Detect abnormal closure.
        if(code !== 1000) {
          if(connection.hasOwnProperty("originalAddress")) {
            let toRediscover = {
              'address': connection.originalAddress
            };

            if(connection.hasOwnProperty("peerPublicKeySignature")) {
              toRediscover.signature = 
                connection.peerPublicKeySignature.toString('hex');
            }

            this.discoveryAddresses.push(toRediscover);
            
            /* 
             * On an abnormal close, we should try to discover in order to 
             * reattempt connection with the peer we lost.
             */
            if(!this.discovering && this.ready) {
              this.discover.apply(this,null);
            }
          }
        }
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
      var _helo = new Message();

      _helo.body = {
        'publicKey': this.peerRSAKeyPair.export({ mode: 'public' }),
        'signature': this.signature.toString('hex')
      };

      var heloCallback = function(err, backoff, connection, message, self) {
        if(err) {
          self.managedTimeouts.setTimeout(() => {
            connection.send(message.toString(), (err) => {
              heloCallback(err, backoff*1.5, connection, message, self);
            });
          }, backoff);
        }  
      };
      
      //Send the message
      connection.send(_helo.toString(), (err) => {
        heloCallback(err, 5000, connection, _helo, this);
      });
    } catch(e) {
      /*
       * In case of error, log the stack. Most likely, if we're here, it is the 
       * result of an export error in RSAKey (above) or a message send error 
       * (connection.send).
       */
      console.error(e.stack);
    }
  }
  
  receive({ connection, message }) {
    if(message) {
      // Convert the message to a Message class object.
      message = new Message({ message });
    } else {
      // If we weren't supplied a message, let's simply return false.
      return false;
    }
    
    // Convert the header 'type' property from number => human-readable string.
    let headerTypeString = Message.TYPE_STRING(message.header.type);
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Incoming message '${headerTypeString}' from `+
        `${connection.remoteAddress} - ${connection.originalAddress} ` +
        `on port ${connection.originalPort}`);
    }
    
    /*
     * Cycle through our list of peers and find the peer that this message is 
     * coming from. Once found, update the 'active' property to the current 
     * time (in ms) to reflect when the last message was received from the peer.
     */
    for(let p of this.peers) {
      if(connection.hasOwnProperty("originalAddress") && 
        p.connection.hasOwnProperty("originalAddress")) {
          if(JSON.stringify(connection.originalAddress) == 
            JSON.stringify(p.connection.originalAddress)) {
              /* istanbul ignore if */
              if(this.debug) {
                console.log(`Updating peer 'active' time to current ` + 
                  `timestamp (in ms).`);
              }
                
              p.active = new Date(new Date().toUTCString());
              break;
          }
      }
    }
    
    if(message.header.type == Message.TYPES._helo) {
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

  broadcast(options = {}) {
    // If there are no peers to broadcast to, return.
    if(this.peers.length < 1) {
      /* istanbul ignore if */
      if(this.debug) {
        console.error(`ERROR: No peers to broadcast message to!`);
      }

      return;
    }

    let msg = false;
    
    if(options instanceof Message) {
      // Support for `peer.broadcast(<Message>);`
      msg = options;
    } else if(typeof options == "string") {
      // Support for `peer.broadcast(<string>);`
      msg = new Message({
        type: Message.TYPES._message,
        body: options
      });  
    }
    
    let {
        message=msg, 
        connection=false, 
        confirmationBackoff=5000
      } = options;
    
    // If there is no message to broadcast, exit
    if(!message || typeof message == 'undefined') {
      /* istanbul ignore if */
      if(this.debug) {
        console.error(`ERROR: Message missing or not valid!`);
      }
      
      return;
    }
    
    /* istanbul ignore if */
    if(this.debug) {
      console.log(`Broadcasting ${message} to ${this.peers.length} peers...`);
    }
    
    // If the message is not a string and is not an instance of Message...
    if(typeof message !== "string" && !(message instanceof Message)) {
      // ...stringify it.
      try {
        message = JSON.stringify({ message });
      } catch(e) {
        console.error(`ERROR: Converting message to JSON string failed.`);
        return;
      }
    }
    
    // If we weren't given a specific connection, send to all peers
    var toSendTo = !connection ? this.peers : [{ connection }];
    
    // Broadcast a message to all connected peers
    for(let p of toSendTo) {
      if(p.connection.connected) {
        if(p.connection.trusted) {
          // Encrypt the message with the connection's AES properties.
          let messageCopyToSend = new Message({ message });
          
          /*
           * If the 'requireConfirmation' flag is set on this peer, then we need 
           * to check back at a scheduled timeout as to whether the message has 
           * been received by the peers we sent the message to.
           */
          if(this.requireConfirmation && 
            messageCopyToSend.header.type !== Message.TYPES._confirm) {
              /*
               * Create timeout to check if the mssage was confirmed by the 
               * remote peer. If so, we simply step out of the timeout function, 
               * but if not then we try to resend the message to the remote 
               * peer. Wrap in anonymous function in order to preserve scope.
               */
              ((self, peer, msg) => {
                self.managedTimeouts.setTimeout(() => {
                  for(let i=peer.connection.confirmedMessages.length-1; i>=0; i--) {
                    let {hash, timestamp} = 
                      peer.connection.confirmedMessages[i].header;

                    timestamp = timestamp.toString();

                    // Match the message to those in 'unconfirmedMessages'.
                    if(hash === msg.header.hash && 
                      timestamp === msg.header.timestamp) {
                        const found = 
                          peer.connection.confirmedMessages.splice(i,1)[0];

                        /* istanbul ignore if */
                        if(self.debug) {
                          console.info(`\tMessage [${found.header.hash}/` + 
                            `${found.header.timestamp.toISOString()}] ` +
                            `already confirmed, will not be resent.`);
                        }

                        return;
                    }
                  }
                  
                  // Message hasn't been confirmd by peer yet, try send again.
                  self.broadcast({
                    message: msg,
                    connection: peer.connection,
                    confirmationBackoff: (confirmationBackoff * 1.5)
                  });
                }, confirmationBackoff);
              })(this, p, messageCopyToSend);
          }
          
          p.connection.unconfirmedMessages.push(message);
          
          try {
            // Write the signature to the message header.
            messageCopyToSend.header.signature = 
              (this.peerRSAKeyPair.sign(JSON.stringify(messageCopyToSend.body)))
                .toString('hex');
            
            // Encrypt the message body with the connection's AES properties.
            let cipher = crypto.createCipheriv('aes-256-cbc', 
                                  p.connection.key, 
                                  p.connection.iv);

            let messageBodyBuffer = 
              Buffer.from(JSON.stringify(messageCopyToSend.body));

            messageCopyToSend.body = 
              Buffer.concat([cipher.update(messageBodyBuffer), 
                cipher.final()]).toString('base64');
            
            var sendCallback = function(err, backoff, peer, message, self) {
              if(err) {
                /* istanbul ignore if */
                if(self.debug) {
                  console.error(`ERROR (${err.code}): broadcasting message ` + 
                    `failed...`);
                  console.error(`Message will try to resend in ${backoff}ms.`);
                }
                
                self.managedTimeouts.setTimeout(() => {
                  peer.connection.send(JSON.stringify(message), (err) => {
                    sendCallback(err, backoff*1.5, peer, message, self);
                  });
                }, backoff);
              }
            };
            
            p.connection.send(JSON.stringify(messageCopyToSend), (err) => {
              sendCallback(err, 5000, p, messageCopyToSend, this);
            });
          } catch(e) {
            /*
             * Something went wrong with the encryption, most likely. 
             * Gracefully fail and exit.
             */
            
            /* istanbul ignore if */
            if(this.debug) {
              console.error(`ERROR: broadcast to TRUSTED connection failed. ` + 
                `This could be and more likely is due to an encryption ` + 
                `error. Exiting now.`);
              console.error(e.stack);
            }
          }
        } else {
          /*
           * If we do not have a trusted connection, but we are trying to 
           * establish one via a HELO handshake, let the message be sent.
           */
          if(message.header.type == Message.TYPES._helo) {
            var heloCallback = 
              function(err, backoff, connection, message, self) {
                if(err) {
                  self.managedTimeouts.setTimeout(() => {
                    connection.send(message, (err) => {
                      heloCallback(err, backoff*1.5, connection, message, self);
                    });
                  }, backoff);
                }  
              };
            
            p.connection.send(message, (err) => {
              heloCallback(err, 5000, connection, message, this);
            });
          } else {
            /* istanbul ignore if */
            if(this.debug) {
              console.error(`ERROR: broadcast invoked with sensitive ` + 
                `message but the connection is not trusted; not sending ` + 
                `message.`);
            }
          }
        }
      } else { // Peer connection is not established...
        /* istanbul ignore if */
        if(this.debug) {
          console.error(`ERROR: broadcast attempted to ` + 
            `${p.connection.originalAddress} but the connection is closed!`);
        }
      }
    }
  }
  
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
  
  isOwnSignature(s) {
    if(!s) return false;
    if(typeof s !== "string") s = s.toString("hex");
    return s == this.signature.toString("hex");
  }
  
  inDiscoveryAddresses(peer) {
    let str = JSON.stringify(peer);
    for(let i=0; i<this.discoveryAddresses.length; i++) {
      if(JSON.stringify(this.discoveryAddresses[i]) == str) {
        return true;
      }
    }
    
    return false;
  }
  
  isConnectedTo({ address, signature }) {
    // Check first to make sure we aren't trying to connect to ourself...
    if(this.signature.toString('hex') == signature) return true;
    
    for(let i=0; i<this.peers.length; i++) {
      const hasPeerPublicKeySignature = 
        this.peers[i].connection.hasOwnProperty("peerPublicKeySignature");

      /*
       * Check if we're connected to the peer before checking if the peer is 
       * the same as the one given. If all the above, return true right away
       */
      if(hasPeerPublicKeySignature) {
        const peerSignature = 
          this.peers[i].connection.peerPublicKeySignature.toString('hex');

        const isPeerSignature = (peerSignature == signature);
        
        if(peerSignature) {
          return true;
        }
      }
    }
    
    /*
     * We've only reached here as a result of not finding an active connection
     * the same as the one we're given.
     */
    return false;
  }
  
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
              'active': this.peers[i].active,
              'trusted': this.peers[i].connection.trusted
            });
          }
      }
    }
    
    return peerList;
  }
  
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