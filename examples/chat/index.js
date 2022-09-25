"use strict";

const ArgumentsParser = require('../ArgumentsParser');

const { ChatPeer } = require('./ChatPeer');
const { ConsoleIO } = require('./ConsoleIO');

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const argumentsParser = new ArgumentsParser({
    // --signature=path<str> [REQUIRED] Path to peer signature.
    'signature': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --port=port<int> [OPTIONAL] Defaults to 26780.
    'port': ArgumentsParser.ARGUMENT_TYPE_ENUM.INT,
    // --peers=peer<list<str>> [OPTIONAL] Defaults to [].
    'peers': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING_ARRAY,
    // --ring=path<str> [OPTIONAL] Defaults to "ring.pub".
    'ring': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --private=path<str> [OPTIONAL] Defaults to "peer.pem".
    'private': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --public=path<str> [OPTIONAL] Defaults to "peer.pub".
    'public': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --range=ports<list<int>> [OPTIONAL] Defaults to [26780,26790].
    'range': ArgumentsParser.ARGUMENT_TYPE_ENUM.INT_ARRAY,
    // --publicAddress=address<str> [OPTIONAL] Defaults to undefined.
    'publicAddress': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --debug [OPTIONAL] Defaults to false.
    'debug': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    // --v [OPTIONAL] Defaults to false.
    'v': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    // --verbose [OPTIONAL] Defaults to false.
    'verbose': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
  });
const args = argumentsParser.parse();

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const io = new ConsoleIO();
const peer = new ChatPeer({
    signaturePath: args.signature,
    publicKeyPath: args.public,
    privateKeyPath: args.private,
    ringPublicKeyPath: args.ring,
    httpsServerConfig: {
      port: args.port,
    },
    discoveryConfig: args.range && args.range.lenth > 0 ? 
      {
        range: {
          start: args.range[0],
          end: args.range.slice(-1)[0]
        }
      } : 
      {},
    publicAddress: args.publicAddress,
    io,
  });

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

function isCommandImplemented(command) {
  return command === 'exit' || 
    command === 'exit' || 
    command === 'discover' || 
    command === 'peers' || 
    command === 'alias' || 
    command === 'debug' || 
    command === 'queue' ||
    command === 'handlers' ||
    command === 'self';
}

async function executeCommand(command, args) {
  switch(command) {
    case 'exit':
      await peer.close();
      return Promise.resolve(false);
    case 'discover':
      const addresses = args.join(' ').split(',').map(a => a.trim());
      io.net.log(`[NET] Now discovering on ["${addresses.join('", "')}"].`);
      try {
        const results = await peer.discover(addresses);
        io.net.log(
          `[NET] Discovery completed on ["${addresses.join('", "')}"]: ` +
          `${results}`);
      } catch(err) {
        io.net.error(`[NET] Failed to discover on ` + 
          `["${addresses.join('", "')}"].`);
      }
      break;
    case 'peers':
      io.net.log('[NET]', peer.peers);
      break;
    case 'alias':
      const alias = args.join(' ');
      await peer.setOwnAlias(alias);
      break;
    case 'debug':
      if (args.length > 0) {
        if(args[0] === 'enable') {
          peer.enableDebugMode();
          io.net.log(`[NET] debug mode enabled.`);
          break;
        } else if(args[0] === 'disable') {
          peer.disableDebugMode();
          io.net.log(`[NET] debug mode disabled.`);
          break;
        }
      }
      io.net.log(`[NET] debug mode is ` +
        `${peer.isDebugModeEnabled ? 'enabled' : 'disabled'}`);
      break;
    case 'queue':
      if (args.length > 0) {
        if(args[0] === 'enable') {
          peer.enableMessageQueue();
          io.net.log(`[NET] message queue enabled.`);
          break;
        } else if(args[0] === 'disable') {
          peer.disableMessageQueue();
          io.net.log(`[NET] message queue disabled.`);
          break;
        } else if(args[0] === 'send') {
          await peer.sendQueue();
          break;
        }
      }
      io.net.log(`[NET] queue mode is ` +
        `${peer.isQueueEnabled ? 'enabled' : 'disabled'}`);
      break;
    case 'self':
      io.net.log('[NET]', JSON.parse(peer.toString()));
      break;
    case 'handlers':
      io.net.log('[NET]', peer.requestHandlers_);
      break;
    default:
      throw Error(`Command '${command}' is not implemented!`);
  }
  return Promise.resolve(true);
}

async function parseInput (line='') {
  if(!line || line.trim().toString().length === 0) {
    return Promise.resolve(true);
  }

  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine();
  process.stdout.cursorTo(0);

  line = line.toString().trim();
  const parts = line.toLowerCase().split(' ').filter(p => !!p);
  const isCommand = parts[0].indexOf('/') === 0;

  if(isCommand) {
    const command = parts[0].slice(1);
    if(isCommandImplemented(command)) {
      const args = parts.slice(1);
      try {
        return executeCommand(command, args);
      } catch(err) {
        io.net.error(err.message);
      }
    }
  }
  
  await peer.sendTextMessage(line);
  return Promise.resolve(true);
}

async function setup() {
  if (args.debug || args.v || args.verbose) {
    peer.enableDebugMode();
  } else {
    peer.disableDebugMode();
  }

  await peer.init();

  console.clear();
  console.log(args);

  if(!args.peers || args.peers.length < 1) {
    return Promise.resolve();
  }
  return peer.discover(args.peers);
}

async function loop() {
  const line = await io.prompt();
  const shouldLoop = await parseInput(line);
  return shouldLoop ? loop() : Promise.resolve();
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

setup()
  .then(() => loop())
  .catch(err => {
    console.error(e.stack);
  })
  .then(() => {
    peer.close();
    io.close();
    process.exit(1);
  });

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
