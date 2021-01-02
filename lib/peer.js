"use strict";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const crypto                  = require('crypto');
const fs                      = require('fs');
const http                    = require('http');
const https                   = require('https');
const url                     = require('url');
const WebSocket               = require('ws');

const ManagedTimeouts         = require('./managedTimeouts');
const Message                 = require('./Message');
const { HTTPS_SERVER_MODES, 
        Server }              = require('./Server');
const Client                  = require('./Client');

const RSAKeyPair              = require('./RSAKeyPair.js');
const { checkFiles, 
        expandRange, 
        isValidRange, 
        parseUrl, 
        readFileAsync, 
        stripIpv4Prefix,
        utcTimestamp }        = require('./utils');

const { HeloMessage }         = require('./messages/helo');
const { SetupCipherMessage }  = require('./messages/setupCipher');
const { PeersMessage }        = require('./messages/peers');
const { RequestHandler }      = require('./RequestHandler');

const NoSuchFileError         = require('./NoSuchFileError');

class Peer {
  constructor({
    // Required Parameters -----------------------------------------------------
    privateKeyPath,
    publicKeyPath,
    signaturePath,
    ringPublicKeyPath,

    // Optional / Configurable Parameters --------------------------------------
    discoveryConfig         = {
                                addresses: [],
                                range: {
                                  start: 26780,
                                  end: 26790
                                }
                              },
    httpsServerConfig       = {},
    logger                  = console,
    wsServerConfig          = {},
  }) {
    // Constructor-based this defaults -----------------------------------------
    this.managedTimeouts_ = new ManagedTimeouts();
    this.privateKeyPath_ = privateKeyPath;
    this.publicKeyPath_ = publicKeyPath;
    this.signaturePath_ = signaturePath;
    this.ringPublicKeyPath_ = ringPublicKeyPath;
    this.logger_ = logger;

    this.discoveryConfig_ = discoveryConfig;
    this.httpsServerConfig_ = httpsServerConfig;
    this.wsServerConfig_ = {
      keepAlive: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false,
      noServer: false,
      ...wsServerConfig
    };

    // Non-constructor-based this defaults -------------------------------------
    this.peers_ = [];
    this.requestHandlers_ = [];

    this.init()
      .then(() => {
        // const parsedDiscoveryAddresses = 
        //   this.parseDiscoveryAddresses(this.discoveryConfig_.addresses);
        // this.discover(parsedDiscoveryAddresses);
      });
  }

  get port() {
    return this.server.port;
  }

  get peers() {
    let peers = this.peers_.slice(0);
    for(let i=peers.length-1; i>=0; i--) {
      if(!peers[i].connection.isConnected) {
        peers.splice(i, 1);
      }
    }
    return peers;
  }

  get trustedPeers() {
    let peers = this.peers_.slice(0);
    for(let i=peers.length-1; i>=0; i--) {
      if(!peers[i].connection.isConnected || !peers[i].connection.isTrusted) {
        peers.splice(i, 1);
      }
    }
    return peers;
  }

  init() {
    if(this.isReady_) {
      return Promise.resolve();
    }

    if(this.isInitializing_ && this.initializationOperation_) {
      return this.initializationOperation_;
    }

    this.isInitializing_ = true;

    this.initializationOperation_ = 
      checkFiles(
          [{
            description: "Ring Public Key",
            location: this.ringPublicKeyPath_
          }, {
            description: "Peer Private Key",
            location: this.privateKeyPath_
          }, {
            description: "Signature",
            location: this.signaturePath_
          }],
          this.logger_
        )
      .then(() => {
        /* 
         * NOTE: Peer public is optional, can be derrived from private if not 
         * provided. All other files must exist in order to initialize peer.
         */  
        const readPeerPrivateKeyPromise =
          readFileAsync(this.privateKeyPath_)
            .then(data => {
              this.privateKey_ = data;
            });

        const readPeerPublicKeyPromise =
          readFileAsync(this.publicKeyPath_)
            .then(data => {
              this.publicKey_ = data;
            })
            .catch(err => {
              if(!(err instanceof NoSuchFileError) && !this.privateKeyPath_) {
                throw err;
              }
            });

        const readRingPublicKeyPromise = 
          readFileAsync(this.ringPublicKeyPath_)
            .then(data => {
              this.ringPublicKey_ = data;
            });

        const readSignaturePromise =
          readFileAsync(this.signaturePath_)
            .then(data => {
              this.signature_ = data;
            });

        return Promise.all([
          readPeerPrivateKeyPromise,
          readPeerPublicKeyPromise,
          readRingPublicKeyPromise,
          readSignaturePromise
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
        
        this.logger_.log(`Peer signature (last 8 bytes): ` + 
          `${this.signature_.toString('hex').slice(-16)}`);

        this.server = new Server({
            httpsServerConfig: this.httpsServerConfig_,
            wsServerConfig: this.wsServerConfig_,
            logger: this.logger_,
          });

        return this.server.start();
      })
      .then(() => {
        this.server.on('wsConnection', (o) => { this.onWsConnection(o); });

        this.isInitializing_ = false;
        this.isReady_ = true;

        return Promise.resolve();
      });

    return this.initializationOperation_;
  }

  /**
   * Iterates through the given addresses for valid discovery addresses and 
   * adds those determined as valid to this.discoveryAddresses_.
   * 
   * @param  {Array} addresses 
   *         The list of addresses to parse.
   */
  parseDiscoveryAddresses(addresses) {
    let ret = [];
    for(let obj of addresses) {
      try {
        ret = ret.concat(this.enqueueDiscoveryAddress(obj));
      } catch(e) {
        this.logger_.log(e.stack);
      }
    }
    return ret;
  }

  async onWsConnection({ connection, request }) {
    this.logger_.log(`Received connection from remote peer:` +
      `\n\tAddress: ${connection._socket.remoteAddress}` + 
      `\n\tPort: ${connection._socket.remotePort}`);

    const client = new Client(
        connection,
        {
          rsaKeyPair: this.peerRSAKeyPair_,
          signature: this.signature_
        },
        this.ringRSAKeyPair_,
        this.logger_,
      );
    await client.connect();
    await client.upgrade();
    this.peers_.push({ connection: client, created: utcTimestamp() });
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
      peer = { address: obj.address, signature: obj.signature };
    } else {
      throw new Error(`Could not understand given addrress ${obj} ` +
        `because it was neither a valid address string nor an object ` + 
        `with valid address properties ('address', 'signature').`);
    }

    let addresses = [];
    let parsedAddress = parseUrl(peer.address);
    
    /*
     * If the parsed address doesn't contain a port and this peer has a given 
     * discovery range, expand the address into all discoverable addresses (for 
     * all ports specified in this peer's discovery range).
     */
    if(!parsedAddress.port) {
      let ports = [];

      const { start, end } = this.discoveryConfig_.range;
      if (isValidRange(start, end)) {
        ports = expandRange(start, end);
      }

      if(this.port && ports.indexOf(this.port) < 0) {
        ports.push(this.port);
      }

      for(let port of ports) {
        const address = url.format({ ...parsedAddress, port });
        addresses.push({ address, signature: null });
      }
    } else {
      const address = url.format(parsedAddress);
      addresses = [{ address, signature: null }];
    }

    for(let i=addresses.length-1; i>=0; i--) {
      const peer = addresses[i];
      const isConnectedTo = this.isConnectedTo(peer);
      const isOwnSignature = 
        (peer.signature ? this.isOwnSignature(peer.signature) : false);
        
      /* istanbul ignore else */
      if(isConnectedTo || isOwnSignature) {
        this.logger_.log(`Not connecting to peer ${JSON.stringify(peer)}`, 
          `\n\tisConnectedTo: ${isConnectedTo}`,
          `\n\tisOwnSignature: ${isOwnSignature}`);
        delete addresses[i];
      }
    }

    return addresses;
  }

  /**
   * Starts discovery on the addresses listed in this peer's discovery array 
   * (this.discoveryAddresses_).
   */
  async discover(addresses = []) {
    if(!this.isReady_) {
      await this.initializationOperation_;
    }

    if(this.isDiscovering_ && this.discoveryOperation_) {
      return this.discoveryOperation_;
    }

    let discoverAddresses = this.parseDiscoveryAddresses(addresses);

    /* 
     * If this is the first time running the discover operation, be sure to add 
     * in the addresses from `discoveryConfig` via the constructor.
     */
    if(Array.isArray(this.discoveryConfig_.addresses)) {
      const initAddresses = 
        this.parseDiscoveryAddresses(this.discoveryConfig_.addresses);
      discoverAddresses = discoverAddresses.concat(initAddresses);
      delete this.discoveryConfig_.addresses;
    }

    this.isDiscovering_ = true;

    this.discoveryOperation_ = 
      Promise.all(
        discoverAddresses.map(
          (address) => 
            this.discoverPeer(address)
              .catch((err) => {
                // Connedtion errors, trust errors, etc.
                this.logger_.error(err.stack);
              })
        )
      ).then(results => {
        this.isDiscovering_ = false;
      });

    return this.discoveryOperation_;
  }

  /**
   * Performs service discovery on a single given peer.
   * 
   * @param  {Object} peerToDiscover
   *         The peer object to discover on.
   * @return {Promise}
   *         A Promise which resolves when the peer has successfully been 
   *         connected to or rejects when there has been an error in connecting 
   *         to said peer.
   */
  discoverPeer(peerToDiscover) {
    if(this.isConnectedTo(peerToDiscover)) {
      throw new Error(`Already connected to given peer!`);
    }

    if(this.isOwnSignature(peerToDiscover.signature)) {
      throw new Error(`Signature matches own signature!`);
    }

    this.logger_.log("------------------------------------------");
    this.logger_.log(JSON.stringify(peerToDiscover, true));
    this.logger_.log("------------------------------------------");
    
    return this.attemptConnection(
        stripIpv4Prefix(peerToDiscover.address), 
        parseUrl(peerToDiscover.address)
      );
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
  async attemptConnection(originalAddress, parsedAddress) {
    const formattedAddress = url.format(parsedAddress);

    this.logger_.log(`Attempting connection to ${formattedAddress}`);
    const instance = new WebSocket(formattedAddress, null, {});
    const client = new Client(
        instance,
        {
          rsaKeyPair: this.peerRSAKeyPair_,
          signature: this.signature_
        },
        this.ringRSAKeyPair_,
        this.logger_,
      );

    await client.connect();
    
    this.logger_.log(`Successfully connected to remote peer:` +
      `\n\tAddress: ${instance._socket.remoteAddress}` + 
      `\n\tPort: ${instance._socket.remotePort}`);

    await client.upgrade();
    this.peers_.push({ connection: client, created: utcTimestamp() });
  }


  /**
   * Backwards-compatability method for earlier versions of ringnet.
   * @param  {string}   eventName The event name for which to listen.
   * @param  {Function} callback  The callback triggered when the event occurs.
   * @return {Function}           The handler (callback).
   */
  on(eventName, callback) {
    const hash = 
      crypto.createHash('sha256').update(eventName+'|').digest('hex');

    this.requestHandlers_[hash] = {
      call: (message, connection) => {
        callback.apply(connection, [{ message, connection }]);
      }
    };

    return this.requestHandlers_[hash];
  }

  /**
   * Creates and attaches a bind when a message (of given class) is received.
   * 
   * @param  {Class} RequestClass 
   *         The message's class (after the message is upgraded).
   * @param  {String|RegExp } from
   *         An optional filter for the remote address. Used when to bind 
   *         specific messages to specific addresses).
   */
  bind(RequestClass, from) {
    let matches = [];
    for(let { connection } of this.peers) {
      if(from) {
        const isRegex = (from instanceof RegExp);
        const isString = (from instanceof String);
        const isMatch = 
          isRegex ? from.test(connection.address) : from === connection.address;
        if(isMatch) {
          matches.push(connection);
        }
      } else if(!from) {
        matches.push(connection);
      }
    }

    let binds = [];
    for(let c of matches) {
      binds.push(c.bind(RequestClass));
    }

    return {
      to: (handler) => {
        for(let b of binds) {
          b.to(handler);
        }
      }
    }
  }

  /**
   * Removes an attached message bind.
   * 
   * @param  {Class} RequestClass 
   *         The message's class (after the message is upgraded).
   * @param  {String|RegExp } from
   *         An optional filter for the remote address. Used when to bind 
   *         specific messages to specific addresses).
   */
  unbind(RequestClass, from) {
    let unbound = [];

    for(let { connection } of this.peers) {
      if(from) {
        const isRegex = (from instanceof RegExp);
        const isString = (from instanceof String);
        const isMatch = 
          isRegex ? from.test(connection.address) : from === connection.address;
        if(isMatch) {
          connection.unbind(RequestClass);
          unbound.push(connection);
        }
      } else if(!from) {
        connection.unbind(RequestClass);
        unbound.push(connection);
      }
    }

    if(unbound.length > 0) {
      return unbound;
    }

    return false;
  }

  async sendTo(connection, message) {
    if(!connection) {
      throw new Error(`Invalid connection!`);
    }

    if(!message) {
      throw new Error(`Invalid message!`);
    }

    if(!this.isReady_) {
      await this.init();
    }

    return connection.send(message);
  }

  /**
   * Broadcasts a message to all connected andtrusted peers. This method will 
   * throw an error if there are no connected and trusted peers to send to.
   * 
   * @param  Message message 
   *         The message to broadcast to all connected, trusted peers.
   */
  async broadcast(message) {
    // If there are no peers to broadcast to, return.
    if(this.trustedPeers.length < 1) {
      throw new Error(`No connected and trusted to broadcast message to!`);
    }

    this.logger_.log(
      `Broadcasting ${message} to ${this.trustedPeers.length} peers...`);

    let broadcastPromises = [];
    
    for(let { connection } of this.trustedPeers) {
      const broadcastPromise = 
        this.sendTo(connection, message)
          .catch((e) => {
            this.logger_.error(e.stack);
          });

      broadcastPromises.push(broadcastPromise);
    }

    return Promise.all(broadcastPromises);
  }

  /**
   * The close handler for any given peer connection.
   * 
   * @param  {Websocket} options.connection 
   *         The peer connection.
   * @param  {number} options.closeCode  
   *         The close code describing the close event.
   */
  onPeerConnectionClose({ connection, closeCode }) {
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

  /** Checks if a given signature matches this peer's signature. */
  isOwnSignature(s) {
    if(s) {
      if(Buffer.isBuffer(s)) {
        return s.toString('hex') === this.signature_.toString('hex');
      }

      return s === this.signature_.toString('hex');
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
              'trusted': this.peers_[i].connection.isTrusted
            });
          }
      }
    }
    
    return peerList;
  }

  close() {
    let promises = [];
    for (let { connection } of this.peers) {
      promises.push(connection.close());
    }

    return Promise.all(promises).then(() => {
      this.server.close();
      return Promise.resolve();
    });
  }

  /** Converts peer to a stringified JSON object. */
  toString() {
    return JSON.stringify({
      privateKeyPath: this.privateKeyPath_,
      publicKeyPath: this.publicKeyPath_,
      signaturePath: this.signaturePath_,
      ringPublicKeyPath: this.ringPublicKeyPath_,
      discoveryConfig: this.discoveryConfig_,
      httpsServerConfig: this.httpsServerConfig_,
      wsServerConfig: this.wsServerConfig_,
    });
  }
};

module.exports = Peer;