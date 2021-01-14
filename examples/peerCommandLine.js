"use strict";

const readline = require('readline');

const Expectation = require('./expectation');
const { Peer, Message } = require('../index.js');

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

class TextMessage extends Message {
  constructor(options = {}) {
    super();
    const { text='' } = options;
    this.body = { text };
  }

  clone() {
    return new TextMessage({ text: this.text });
  }

  get text() { return this.body.text; }
  set text(value) { this.body = { ...this.body, text: value }; }
}

class AliasMessage extends Message {
  constructor(options = {}) {
    super();
    const { alias='' } = options;
    this.body = { alias };
  }

  clone() {
    return new AliasMessage({ alias: this.alias });
  }

  get alias() { return this.body.alias; }
  set alias(value) { this.body = { ...this.body, alias: value }; }
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const args = (new Expectation({
    'port': "", // optional (defaults to 26780)
    'peers': [","], // optional (defaults to [])
    'ring': "", // required (defaults to ring.pub)
    'private': "", // optional (defaults to peer.pem)
    'public': "", // optional (defaults to peer.pub)
    'signature': "", // required (peer won't start without)
    'range': [","], // optional (defaults to [26780,26790])
  })).args;

const isDebugEnabled = args.debug || args.v || args.verbose;
const sink = () => {};
const sinkLogger = { error: sink, info: sink, log: sink, warn: sink };
const logger = (isDebugEnabled ? console : sinkLogger)
const discoveryConfig = args.range ? {
    range: {
      start: args.range[0],
      end: args.range[1]
    }
  } : {};

const readInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
readInterface.setPrompt('NET> ');

const peer = new Peer({
    signaturePath: args.signature,
    publicKeyPath: args.public,
    privateKeyPath: args.private,
    ringPublicKeyPath: args.ring,
    httpsServerConfig: {
      port: args.port,
    },
    discoveryConfig,
    logger
  });

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

(async () => {
  let addressBook = {};
  let alias;

  try {
    await peer.init();

    console.clear();
    console.log(args);
    console.log();

    peer.bind(TextMessage).to((message, connection) => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        const alias = 
          addressBook.hasOwnProperty(connection.signature) ? 
            addressBook[connection.signature] : 
            connection.address;
        console.log(`[${alias}]: ${message.text}`);
        readInterface.prompt();
      });

    peer.bind(AliasMessage).to((message, connection) => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        const previous = 
          addressBook.hasOwnProperty(connection.signature) ? 
            addressBook[connection.signature] : 
            connection.address;
        console.log(
          `[NET] ${connection.address} (previously ${previous}, will now be ` +
          `known as ${message.alias}`);
        addressBook[connection.signature] = message.alias;
        readInterface.prompt();
      });

    peer.on('connection', (connection) => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        if(addressBook.hasOwnProperty(connection.signature)) {
          console.log(
            `[NET] ${addressBook[connection.signature]} has rejoined the ` +
            `chat.`);
        } else {
          addressBook[connection.signature] = connection.address;
          console.log(`[NET] ${connection.address} has joined the chat.`);
        }
        readInterface.prompt();
      });

    if(args.peers && args.peers.length > 0) {
      await peer.discover(args.peers);
    }
  } catch(e) {
    console.error(e.stack);
    process.exit(1);
  }

  if(!args.d || args.d.length < 1) {    
    let isQueueEnabled = false;
    let queue = [];

    readInterface.on('line', async (line) => {
      if(line && line.trim().toString().length > 0) {
        line = line.trim().toString().toLowerCase();

        process.stdout.moveCursor(0, -1);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);

        if(line.indexOf('/alias') === 0) {
          alias = line.split(' ').slice(1).join(' ');
          await peer.broadcast(new AliasMessage({ alias }));
          console.log(`[NET] You are now known as "${alias}".`);
        } else {
          switch(line) {
            case 'exit':
              await peer.close();
              readInterface.close();
              process.exit(0);
              break;
            case '/peers':
              console.log('[NET]', peer.peers);
              break;
            case '/queue':
            case '/queue show':
              console.log('[NET]', queue);
              break;
            case '/queue on':
              isQueueEnabled = true;
              console.log(`[NET] Queue is now on.`);
              break;
            case '/queue off':
              isQueueEnabled = false;
              console.log(`[NET] Queue is now off.`);
              break;
            case '/queue send':
            case '/send':
              // Send all the queued messages
              while(queue.length > 0) {
                try {
                  const message = queue.splice(0,1)[0];
                  await peer.broadcast(message);
                  console.log(`[${alias ? alias : "You"}]: ${message.text}`);
                } catch(e) {
                  console.error(`[NET] ${e.message}`);
                }
              }
              break;
            case '/self':
              console.log(JSON.parse(peer.toString()));
              break;
            default:
              const message = new TextMessage({ text: line });
              
              if(isQueueEnabled) {
                queue.push(message);
              } else {
                try {
                  await peer.broadcast(message);
                  console.log(`[${alias ? alias : "You"}]: ${message.text}`);
                } catch(e) {
                  console.error(`[NET] ${e.message}`);
                }
              }
          }
        }
      }
      
      readInterface.prompt();
    });
  }

  readInterface.prompt();
})();

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
