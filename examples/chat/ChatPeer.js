'use strict';

/**
 * ChatPeer class - A ringnet peer extended for chat functionality.
 */

const { Peer } = require('ringnet');
const {
    AliasMessage,
    GoodbyeMessage,
    TextMessage
  } = require('./messages/index.js');


class ChatPeer extends Peer {
  static _sinkIo = {
    net: {
      log: ()=>{},
      error: ()=>{},
    },
    message: {
      peer: ()=>{},
      own: ()=>{},
    },
  };
  static _sinkLogger = {
    error: ()=>{},
    info: ()=>{},
    log: ()=>{},
    warn: ()=>{},
  };

  _aliases = {};
  _isDebugModeEnabled = false;
  _isInitialized = false;
  _isMessageQueueEnabled = false;
  _io;
  _messageQueue = [];

  constructor(options) {
    super({ logger: ChatPeer._sinkLogger, ...options });
    const { io } = options;
    this._io = io || this._sinkIo;

    this.bind(TextMessage).to((message, connection) => {
        this._textMessageHandler(message, connection);
      });
    this.bind(AliasMessage).to((message, connection) => {
        this._aliasMessageHandler(message, connection);
      });
    this.bind(GoodbyeMessage).to((message, connection) => {
        this._goodbyeMessageHandler(message, connection);
      });

    this.on('connection', (connection) => {
        this._connectionHandler(connection);
      });
  }

  _connectionHandler(connection) {
    if(this._hasAlias(connection)) {
      const alias = this._getAlias(connection.remoteSignature);
      this._io.net.log(`[NET] ${alias} has rejoined the chat.`);
    } else {
      this._io.net.log(
        `[NET] ${connection.peerAddress} has joined the chat.`);
      this._addAlias(connection.remoteSignature, connection.peerAddress);
    }
  }

  _addAlias(signature, alias) {
    this._aliases[signature] = alias;
  }

  _hasAlias(signature) {
    return this._aliases.hasOwnProperty(signature);
  }

  _getAlias(signature) {
    return this._hasAlias(signature) ? this._aliases[signature] : null;
  }

  enableDebugMode(logger=console) {
    this._isDebugModeEnabled = true;
    this.logger = logger;
  }

  disableDebugMode() {
    this._isDebugModeEnabled = false;
    this.logger = ChatPeer._sinkLogger;
  }

  get isDebugModeEnabled() {
    return this._isDebugModeEnabled;
  }

  enableMessageQueue(logger=console) {
    this._isMessageQueueEnabled = true;
    this._messageQueue = [];
  }

  disableMessageQueue() {
    this._isMessageQueueEnabled = false;
    this._messageQueue = [];
  }

  get isMessageQueueEnabled() {
    return this._isMessageQueueEnabled;
  }

  async _textMessageHandler(message, connection) {
    const alias = 
      this._getAlias(connection.remoteSignature) || connection.peerAddress;
    this._io.message.peer(`[${alias}]: ${message.text}`);
  }

  async _aliasMessageHandler(message, connection) {
    const alias = 
      this._getAlias(connection.remoteSignature) || connection.peerAddress;
    this._io.net.log(
      `[NET] ${connection.peerAddress} (previously ${alias}), will now be ` +
      `known as ${message.alias}`);
    this._addAlias(connection.remoteSignature, message.alias);
  }

  async _goodbyeMessageHandler(message, connection) {
    const alias = 
      this._getAlias(connection.remoteSignature) || connection.peerAddress;
    this._io.net.log(`[NET] ${alias} has left the chat.`);
  }

  async setOwnAlias(alias) {
    if(typeof alias !== 'string' || alias.length < 1) {
      return;
    }
    try {
      await this.broadcast(new AliasMessage({ alias }));
      this._addAlias(this.signature, alias);
      this._io.net.log(`[NET] You are now known as "${alias}".`);
    } catch(e) {
        this._io.net.error(`[NET] ${e.message}`);
    }
  }

  async sendTextMessage(text) {
    const message = new TextMessage({ text });

    if(this._isMessageQueueEnabled) {
      this._messageQueue.push(message);
      return Promise.resolve();
    }

    try {
      await this.broadcast(message);
      const alias = this._getAlias(this.signature) || 'You';
      this._io.message.own(`[${alias}]: ${message.text}`);
    } catch(e) {
      this._io.net.error(`[NET] ${e.message}`);
    }
  }

  /**
   * Sends all the queued messages
   * 
   * @return {Promise} An array of promises, one for each message sent from the 
   *                      queue.
   */
  async sendQueue() {
    if(!this._isMessageQueueEnabled) {
      return Promise.resolve();
    }

    let promises = [];
    while(this._messageQueue.length > 0) {
      promises.push(peer.sendTextMessage(this._messageQueue.splice(0,1)[0]));
    }
    return Promise.all(promises);
  }

  async close() {
    try {
      await this.broadcast(new GoodbyeMessage())
    } catch(e) {
      /* Do nothing. */
    }
    return super.close();
  }
}

module.exports = { ChatPeer };