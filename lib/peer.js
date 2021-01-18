"use strict";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');
const WebSocket = require('ws');

const Client = require('./Client');
const Message = require('./Message');
const RequestHandler = require('./RequestHandler');
const RSAKeyPair = require('./RSAKeyPair');
const Server = require('./Server');
const utils = require('./utils');

// TODO: Implement post-connect automatic peer discovery.
// const PeersMessage = require('./messages/peers');

class Peer {
  constructor({
    // Required Parameters -----------------------------------------------------
    privateKeyPath,
    publicKeyPath,
    signaturePath,
    ringPublicKeyPath,

    // Optional / Configurable Parameters --------------------------------------
    discoveryConfig     = {
                            addresses: [],
                            range: {
                              start: 26780,
                              end: 26790
                            }
                          },
    httpsServerConfig   = {},
    logger              = console,
    wsServerConfig      = {},
  }) {
    // Constructor-based this defaults -----------------------------------------
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

    this.eventEmitter_ = new EventEmitter();
    this.peers_ = [];
    this.requestHandlers_ = {};

    this.init();
  }

  get port() {
    return this.server.port;
  }

  get peers() {
    return this.peers_.slice(0);
  }

  get connectedPeers() {
    return this.peers.filter((p) => p.connection.isConnected);
  }

  get trustedPeers() {
    return this.connectedPeers.filter((p) => p.connection.isTrusted);
  }

  get signature() {
    return this.signature_.toString('hex');
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
      utils.checkFiles(
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
          utils.readFileAsync(this.privateKeyPath_)
            .then(data => {
              this.privateKey_ = data;
            });

        const readPeerPublicKeyPromise =
          utils.readFileAsync(this.publicKeyPath_)
            .then(data => {
              this.publicKey_ = data;
            })
            .catch(err => {
              if(!(err instanceof utils.NoSuchFileError) && 
                !this.privateKeyPath_) {
                  throw err;
              }
            });

        const readRingPublicKeyPromise = 
          utils.readFileAsync(this.ringPublicKeyPath_)
            .then(data => {
              this.ringPublicKey_ = data;
            });

        const readSignaturePromise =
          utils.readFileAsync(this.signaturePath_)
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
   * Called when a WebSocket connection has been made to the local server.
   * 
   * @param  {WebSocket} options.connection
   *         The received WebSocket connection.
   * @param  {Object} options.request
   *         The originating HTTP request that started the WebSocket connection.
   * @return {Promise}
   *         A promise that resolves iff and when the connection is both 
   *         connected and trusted.
   */
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
    this.setupClient(client);
  }

  /**
   * Iterates through the given addresses for valid discovery addresses and 
   * adds those determined as valid to this.discoveryAddresses_.
   * 
   * @param  {Array} addresses 
   *         The list of addresses (as string or Object, see 
   *         `this.enqueueDiscoveryAddress` for more information) to parse.
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

  /**
   * Attempts to enqueue a given address (or object containing an address) to 
   * this peer's discovery array (this.discoveryAddresses_). This method only 
   * adds or enqueues addresses that are not already in this peer's discovery 
   * array, that this peer is not already connected to, and that do not have a 
   * signature equal to this peer's own signature.
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
      throw new Error(`Could not understand given addrress ${obj} because it ` +
        `was neither a valid address string nor an object with valid address ` +
        `properties ('address', 'signature').`);
    }

    let addresses = [];
    let parsedAddress = utils.parseUrl(peer.address);
    
    /*
     * If the parsed address doesn't contain a port and this peer has a given 
     * discovery range, expand the address into all discoverable addresses (for 
     * all ports specified in this peer's discovery range).
     */
    if(!parsedAddress.port) {
      let ports = [];

      const { start, end } = this.discoveryConfig_.range;
      if (utils.isValidRange(start, end)) {
        ports = utils.expandRange(start, end);
      }

      // Avoid adding our own port if localhost (attempt to connect to self).
      const addressIsLocalhost = 
        parsedAddress.host === '127.0.0.1' || 
        parsedAddress.host === 'localhost';

      if(this.port && ports.includes(this.port) && addressIsLocalhost) {
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
   * Starts discovering on the given addresses.
   * 
   * @param  {Array}  addresses
   *         Addresses to which this peer should attempt to connect.
   * @return {Promise}
   *         A promise that resolves when discovering is complete.
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
   * Attempts to discover (connect to) a single given peer.
   * 
   * @param  {Object} peerToDiscover
   *         The peer object to discover on.
   * @return {Promise}
   *         A Promise which resolves when a connection has successfully been
   *         made to the given peer or rejects when there has been an error in 
   *         connecting to said peer.
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
    
    return this.attemptConnection({
        originalAddress: utils.stripIpv4Prefix(peerToDiscover.address), 
        parsedAddress: utils.parseUrl(peerToDiscover.address)
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
  async attemptConnection({ originalAddress, parsedAddress }) {
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
    this.setupClient(client);
  }

  /**
   * Performs basic setup on a new {Client} and adds it to this peer's list of 
   * peers.
   * 
   * @param  {Client} client
   *         A new {Client} to set up.
   * @return {void}
   */
  setupClient(client) {
    this.logger_.log(`Setting up client at ${client.address}...`);
    client.onMessage((...args) => {
      this.onClientMessage.apply(this, args);
    });

    this.logger_.log(`Setting up client conection handler...`);
    this.eventEmitter_.emit('connection', client);

    this.logger_.log(`Adding client to peers list...`);
    this.peers_.push({ connection: client, created: utils.utcTimestamp() });
  }

  /**
   * A hook in to specific events that pertain to this peer's underlying
   * server, connections, cleanup, etc.
   * 
   * @param  {String}   event
   *         The event on which to listen.
   * @param  {Function} callback
   *         The callback method to invoke when the event is emitted.
   * @return {void}
   */
  on(event, callback) {
    this.eventEmitter_.on(event, callback);
  }

  /**
   * Removes an event hook which has been setup prior using the `on` method.
   * 
   * @param  {String}   event
   *         The event on which to no longer listen.
   * @param  {Function} callback
   *         The callback mathod that was previously registered.
   * @return {void}
   */
  off(event, callback) {
    this.eventEmitter_.off(event, callback);
  }

  /**
   * Creates and attaches a bind when a message (of given class) is received.
   * 
   * @param  {Class} RequestClass 
   *         The message's class (after the message has been upgraded).
   * @param  {String|RegExp} from
   *         An optional filter for the remote address. Used to bind 
   *         specific messages to specific addresses.
   */
  bind(RequestClass, addressFilter=new RegExp('^(.*)$', 'im')) {
    const type = RequestClass.name;
    if(!this.requestHandlers_.hasOwnProperty(type)) {
      this.requestHandlers_[type] = [];
    }
    const handler = new RequestHandler(RequestClass, addressFilter);
    this.requestHandlers_[type].push(handler);
    return handler;
  }

  /**
   * Removes an attached message bind.
   * 
   * @param  {Class} RequestClass 
   *         The message's class (after the message has been upgraded).
   * @param  {String|RegExp} from
   *         An optional filter for the remote address. Used to bind 
   *         specific messages to specific addresses.
   */
  unbind(RequestClass, addressFilter=new RegExp('^(.*)$', 'im')) {
    const type = RequestClass.name;
    if(!this.requestHandlers_.hasOwnProperty(type)) {
      throw new Error(`No handlers for ${type} are bound!`);
    }

    let removed = [];
    for(let i=this.requestHandlers_[type].length-1; i>=0; i--) {
      if(this.requestHandlers_[type][i].patternString == 
        addressFilter.toString()) {
          removed.push(this.requestHandlers_[type].splice(i, 1)[0]);
      }
    }

    if(removed.length === 0) {
      throw new Error(`Handler ${type} for ${addressFilter} is not bound!`);
    }

    return removed;
  }

  /**
   * Callback that is fired when a connected {Client} has received a message.
   * 
   * @param  {Client} connection
   *         The {Client} that has received the message.
   * @param  {String} type
   *         The received message type (as a string). This will correspond to 
   *         the name of the class when the message is upgraded.
   * @param  {Object} message
   *         The received message, as a raw object, which will be upgraded to 
   *         the class with same name as the given type parameter via the 
   *         registered {RequestHandler} instance.
   * @return {void}
   */
  onClientMessage(connection, type, message) {
    if(this.requestHandlers_.hasOwnProperty(type)) {
      const handlersToInvoke = 
        this.requestHandlers_[type]
          .filter(handler => handler.matches(connection.address));

      if(handlersToInvoke.length === 0) {
        this.logger_.error(`No matching handlers to invoke for ${type}.`);
        return;
      }

       // NOTE: Upgrading for each and every RequestHandler is unnecessary.
      this.logger_.log(`Upgrading message to ${type}...`);
      const messageObj = this.requestHandlers_[type][0].upgrade(message);
 
      for(let handler of handlersToInvoke) {
        try {
          this.logger_.log(
            `Invoking ${type} handler for ${connection.address}`);
          handler.invoke(messageObj, connection);
        } catch(e) {
          this.logger_.error(e.stack);
        }
      }
    } else {
      this.logger_.error(`No handlers registered for ${type}.`);
    }
  }

  /**
   * Sends a single message to a single connected, trusted connection.
   * 
   * @param  {Client} connection
   *         The connected {Client} to which to send the message.
   * @param  {Message} message
   *         The {Message} to send to the given {Client}.
   * @return {Promise}
   *         A promise that resolves when the message has been sent or rejects 
   *         when or if there is an error in doing so.
   */
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
      `Broadcasting ${message.toString()} to ` + 
      `${this.trustedPeers.length} peers...`);

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
   * Checks a given signature against this peer's signature.
   * 
   * @param  {Buffer|String}  signature
   *         The signature to which to compare.
   * @return {Boolean}
   *         Whether the given signature matches this peer's signature.
   */
  isOwnSignature(signature) {
    if(signature) {
      if(Buffer.isBuffer(signature)) {
        return signature.toString('hex') === this.signature_.toString('hex');
      }
      return s === this.signature_.toString('hex');
    }
    return false;
  }
  
  /**
   * Checks if peer is connected to the given peer.
   * 
   * @param  {Client}  client
   *         The {Client} to which to check if this peer is connected.
   * @return {Boolean}
   *         Whether this peer is connected to the given {Client}.
   */
  isConnectedTo({ signature }) {
    return this.connectedPeers
      .map(c => c.connection.remoteSignature)
      .includes(signature);
  }

  /**
   * Terminates any active connections and closes the {Server}.
   * 
   * @return {Promise}
   *         A promise which resolves when the cleanup has completed.
   */
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

  /**
   * Converts peer to a stringified JSON object.
   * 
   * @return {String}
   *         A JSON string representation of this peer.
   */
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