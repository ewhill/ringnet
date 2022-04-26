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
const ManagedTimeouts = require('./managedTimeouts');
const Message = require('./Message');
const RequestHandler = require('./RequestHandler');
const RSAKeyPair = require('./RSAKeyPair');
const Server = require('./Server');
const utils = require('./utils');

const PeersMessage = require('./messages/peers');

class Peer {
  // Begin Private Class Properties Statically Assigned
  eventEmitter_ = new EventEmitter();
  discoveryAddressBook_ = [];
  discoveryOperation_ = null;
  initializationOperation_ = null;
  isDiscovering_ = false;
  isReady_ = false;
  isInitializing_ = true;
  managedTimeouts_ = new ManagedTimeouts();
  peers_ = [];
  peersSince_ = 0;
  requestHandlers_ = {};

  // Private Class Properties Assigned Via Constructor Params
  privateKeyPath_;
  publicKeyPath_;
  signaturePath_;
  ringPublicKeyPath_;
  publicAddress_;
  logger_;
  discoveryConfig_;
  httpsServerConfig_;
  wsServerConfig_ = {
    keepAlive: true,
    autoAcceptConnections: false,
    ignoreXForwardedFor: false,
    noServer: false,
  };

  constructor({
    // Required Parameters
    privateKeyPath,
    publicKeyPath,
    signaturePath,
    ringPublicKeyPath,

    // Optional / Configurable Parameters
    httpsServerConfig = {},
    wsServerConfig = {},
    discoveryConfig = {
      addresses: [],
      range: {
        start: 26780,
        end: 26790
      }
    },
    publicAddress,
    logger = console,
  }) {
    this.privateKeyPath_ = privateKeyPath;
    this.publicKeyPath_ = publicKeyPath;
    this.signaturePath_ = signaturePath;
    this.ringPublicKeyPath_ = ringPublicKeyPath;

    this.httpsServerConfig_ = httpsServerConfig;
    this.wsServerConfig_ = { ...this.wsServerConfig_, ...wsServerConfig };
    this.discoveryConfig_ = discoveryConfig;
    this.publicAddress_ = publicAddress;
    this.logger_ = logger;
    this.init();
  }

  get logger() {
    return this.logger_;
  }

  set logger(value) {
    if(!value.hasOwnProperty('error') || !value.hasOwnProperty('info') || 
      !value.hasOwnProperty('log') || !value.hasOwnProperty('warn')) {
        throw new Error(`Invalid value for logger!`);
    }
    this.logger_ = value;
  }

  get server() {
    return this.server_;
  }

  get wsServer() {
    return this.server_.wsServer;
  }

  get port() {
    return this.server_.port;
  }

  get peers() {
    return this.peers_;
  }

  get connectedPeers() {
    return this.peers.filter(peer => peer.isConnected);
  }

  get trustedPeers() {
    return this.connectedPeers.filter(peer => peer.isTrusted);
  }

  get signature() {
    return this.signature_.toString('hex');
  }

  get isReady() {
    return this.isReady_;
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

        this.server_ = new Server({
            httpsServerConfig: this.httpsServerConfig_,
            wsServerConfig: this.wsServerConfig_,
            publicAddress: this.publicAddress_,
            logger: this.logger_,
          });

        return this.server_.start();
      })
      .then(() => {
        this.server_.on('wsConnection', (o) => this.onWsConnection(o));


        this.bind(PeersMessage).to(m => { this.onPeersMessage(m); });

        // Every 5 minutes, broadcast peers.
        this.managedTimeouts_.setInterval(() => this.broadcastPeers(), 300000);

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
      `\n\tAddress: ${request.socket.remoteAddress}` + 
      `\n\tPort: ${request.socket.remotePort}`);

    const client = new Client({
        connection,
        request,
        credentials: {
          rsaKeyPair: this.peerRSAKeyPair_,
          signature: this.signature_
        },
        ringRsaKeyPair: this.ringRSAKeyPair_,
        address: this.server_.publicAddress,
        peerAddress: utils.getXForwardedFor(request),
        signatureValidator: (s) => this.validateNewClientSignature(s),
        logger: this.logger_,
      });

    try {
      await client.connect();

      this.logger_.log(
        `[${client.peerAddress}] Successfully received connection.`);

      await client.upgrade();

      this.logger_.log(
        `[${client.peerAddress}] Successfully upgraded remote peer.`);

      await this.setupClient(client);
    } catch(e) {
      this.logger_.error(e.message);
    }
  }

  /**
   * Iterates through the given addresses for valid discovery addresses and 
   * adds those determined as valid to this.discoveryAddresses_.
   * 
   * @param  {Array} addresses 
   *         The list of addresses (as string or Object, see 
   *         `this.parseAddress` for more information) to parse.
   */
  parseDiscoveryAddresses(addresses) {
    let ret = [];
    for(let obj of addresses) {
      try {
        ret = ret.concat(this.parseAddress(obj));
      } catch(e) {
        this.logger_.log(e.stack);
      }
    }
    return ret;
  }

  /**
   * Attempts to parse a given address (or object containing an address). This 
   * method does not add or enqueues addresses, but rather parses and returns an
   * array of addresses that are computed from the given address. These are 
   * then filtered such that all entries are not ones that this peer is already 
   * connected to, and do not have a signature equal to this peer's own 
   * signature.
   * 
   * @param  {string|Object} obj 
   *         The address (as a string or object containing 'address' and 
   *         'signature' properties) to add to the discovery array.
   */
  parseAddress(obj) {
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
      await this.discoveryOperation_;
    }

    let toDiscover = this.parseDiscoveryAddresses(addresses);

    /* 
     * If this is the first time running the discover operation, be sure to add 
     * in the addresses from `discoveryConfig` via the constructor.
     */
    if(Array.isArray(this.discoveryConfig_.addresses)) {
      const initAddresses = 
        this.parseDiscoveryAddresses(this.discoveryConfig_.addresses);
      toDiscover = toDiscover.concat(initAddresses);
      delete this.discoveryConfig_.addresses;
    }

    /*
     * Addresses not discovered prior, or addresses discovered prior, but at a 
     * time in the past (at least 5 minutes ago or earlier).
     */
    toDiscover = 
      toDiscover.filter(({ address }) => 
        !this.discoveryAddressBook_.hasOwnProperty(address) || 
          (Date.now() - this.discoveryAddressBook_[address] > 300000));

    this.isDiscovering_ = true;

    this.discoveryOperation_ = 
      Promise.all(
        toDiscover
          .map(({ address, signature }) => {
            this.discoveryAddressBook_[address] = Date.now();
            return this.discoverPeer({ address, signature })
              .catch((err) => {
                // Connection errors, trust errors, etc.
                this.logger_.error(err.stack);
              })
          })
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
    const client = new Client({
        connection: new WebSocket(formattedAddress, null, {}),
        credentials: {
          rsaKeyPair: this.peerRSAKeyPair_,
          signature: this.signature_
        },
        ringRsaKeyPair: this.ringRSAKeyPair_,
        address: this.server_.publicAddress,
        peerAddress: formattedAddress.replace(/^wss?:\/\//, ''),
        signatureValidator: (s) => this.validateNewClientSignature(s),
        logger: this.logger_,
      });

    try {
      await client.connect();
      
      this.logger_.log(
        `[${client.peerAddress}] Successfully connected to remote peer.`);

      await client.upgrade();

      this.logger_.log(
        `[${client.peerAddress}] Successfully upgraded remote peer.`);

      await this.setupClient(client);
    } catch(e) {
      this.logger_.log(e.stack);
    }
  }

  /**
   * Validates a given signature, used to verify {HeloMessage} and continue 
   * trust setup in {Client} and throws an error if the signature is not valid.
   * 
   * @param  {String} signature
   *         The signature to validate.
   * @return {boolean}
   *         Whether the signature is valid, throws an error if not.
   */
  validateNewClientSignature(signature) {
    if(this.isConnectedTo({ signature })) {
      throw new Error(`Already connected to peer with signature: ${signature}`);
    } else if (this.isOwnSignature(signature)) {
      throw new Error(`Signature matches own: ${signature}`);
    }
    return true;
  }

  /**
   * Performs basic setup on a new {Client} and adds it to this peer's list of 
   * peers.
   * 
   * @param  {Client} client
   *         A new {Client} to set up.
   * @return {void}
   */
  async setupClient(client) {
    this.logger_.log(`Setting up client at ${client.peerAddress}...`);
    client.onMessage((...args) => {
        this.onClientMessage.apply(this, args);
      });

    await this.sendPeersTo(client);

    this.logger_.log(`Adding client to peers list...`);
    this.peers_.push(client);

    this.logger_.log(`Emitting new 'connection' event...`);
    this.eventEmitter_.emit('connection', client);
  }

  getPeersSince(since = this.peersSince_) {
    return this.trustedPeers
      .filter(peer => peer.created.getTime() >= since)
      .map(peer => {
        return {
          address: utils.stripIpv4Prefix(peer.peerAddress),
          signature: peer.remoteSignature.toString('hex'),
        };
      });
  }

  async broadcastPeers() {
    const peersMessage = new PeersMessage({
        peers: this.getPeersSince(this.peersSince_),
        since: this.peersSince_,
      });
    return this.broadcast(peersMessage)
      .then(() => {
        this.peersSince = utils.utcTimestamp().getTime();
      })
      .catch(err => {
        /* Do nothing. */
        this.logger_.error(err.stack);
      });
  }

  async sendPeersTo(connection, since=this.peersSince_) {
    const peersMessage = new PeersMessage({
        peers: this.getPeersSince(since),
        since,
      });
    return this.sendTo(connection, peersMessage)
      .catch(err => {
        /* Do nothing. */
        this.logger_.error(err.stack);
      });
  }

  onPeersMessage(message) {
    const { peers } = message;
    if(!peers || !peers.length) {
      return;
    }
    this.discover(peers)
      .catch(err => {
        /* Do nothing. */
        this.logger_.error(err.stack);
      });
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
   *         An optional filter for the remote address. Used to bind specific 
   *         messages to specific addresses.
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
   * Removes all attached message binds for the given message class.
   * 
   * @param  {Class} RequestClass 
   *         The message's class (after the message has been upgraded).
   */
  unbindAll(RequestClass) {
    const type = RequestClass.name;
    if(!this.requestHandlers_.hasOwnProperty(type)) {
      throw new Error(`No handlers for ${type} are bound!`);
    }

    const removed = this.requestHandlers_[type].slice(0);
    this.requestHandlers_[type] = [];
    return removed;
  }

  /**
   * Removes an attached message bind for the given message class.
   * 
   * @param  {Class} RequestClass 
   *         The message class (after the message has been upgraded).
   * @param  {function} handler 
   *         The message handler, matching that used in the original call to 
   *         `peer.bind()`.
   */
  unbind(RequestClass, handler) {
    const type = RequestClass.name;
    if(!this.requestHandlers_.hasOwnProperty(type)) {
      throw new Error(`No handlers for ${type} are bound!`);
    }

    if (!handler) {
      return this.unbindAll(RequestClass);
    }

    const handlerIds = RequestHandler.GetHandlerIds(handler);
    if(!handlerIds || handlerIds.length < 1) {
      throw new Error(
        `Invalid value for parameter 'handler'; cannot get handler IDs!`);
    }

    let removed = [];
    for(let i=this.requestHandlers_[type].length-1; i>=0; i--) {
      if(handlerIds.indexOf(this.requestHandlers_[type][i].id) > -1) {
        removed.push(this.requestHandlers_[type].splice(i, 1)[0]);
      }
    }

    if(removed.length === 0) {
      throw new Error(
        `Handler ${type} with id ${handlerId} is not bound!`);
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
    if(!this.requestHandlers_.hasOwnProperty(type)) {
      this.logger_.error(`No handlers registered for ${type}.`);
      return;
    }

    const handlersToInvoke = 
      this.requestHandlers_[type].filter(
        handler => handler.matches(connection.peerAddress));

    if(handlersToInvoke.length === 0) {
      this.logger_.error(`No handlers matching for ${type}.`);
      return;
    }

    this.logger_.log(`Upgrading message to ${type}...`);
    const messageObj = this.requestHandlers_[type][0].upgrade(message);

    for(let handler of handlersToInvoke) {
      try {
        this.logger_.log(
          `Invoking ${type} handler for ${connection.peerAddress}`);
        handler.invoke(messageObj, connection);
      } catch(e) {
        this.logger_.error(e.stack);
      }
    }
  }

  /**
   * Sends a single message to a single connected, trusted connection.
   * 
   * @param  {Client} client
   *         The connected {Client} to which to send the message.
   * @param  {Message} message
   *         The {Message} to send to the given {Client}.
   * @return {Promise}
   *         A promise that resolves when the message has been sent or rejects 
   *         when or if there is an error in doing so.
   */
  async sendTo(client, message) {
    if(!client) {
      throw new Error(`Invalid connection!`);
    }

    if(!message) {
      throw new Error(`Invalid message!`);
    }

    if(!this.isReady_) {
      await this.init();
    }

    return client.send(message);
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
    
    for(let peer of this.trustedPeers) {
      const broadcastPromise = 
        this.sendTo(peer, message)
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
      return signature === this.signature_.toString('hex');
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
      .map(peer => peer.remoteSignature.toString('hex'))
      .includes(signature);
  }

  /**
   * Terminates any active connections and closes the {Server}.
   * 
   * @return {Promise}
   *         A promise which resolves when the cleanup has completed.
   */
  async close() {
    this.managedTimeouts_.destroy();

    for(const peer of this.peers) {
      try {
        await peer.close();
      } catch(err) {
        this.logger_.log(err.stack);
      }
    }
    await this.server_.close();
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
      httpsServerConfig: this.server_.httpsConfig,
      wsServerConfig: this.server_.wsConfig,
      publicAddress: this.publicAddress_,
    });
  }
};

module.exports = Peer;