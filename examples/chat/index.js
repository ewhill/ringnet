"use strict";

const ArgumentsParser = require('../ArgumentsParser');

const { ChatPeer } = require('./ChatPeer');
const { ConsoleIO } = require('./ConsoleIO');

const {
    aliasCommandHandler,
    debugCommandHandler,
    discoverCommandHandler,
    exitCommandHandler,
    peersCommandHandler,
    queueCommandHandler,
    selfCommandHandler
  } = require('./commands/index');

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

const COMMANDS = {
  'alias': aliasCommandHandler,
  'debug': debugCommandHandler,
  'discover': discoverCommandHandler,
  'exit': exitCommandHandler,
  'peers': peersCommandHandler,
  'queue': queueCommandHandler,
  'self': selfCommandHandler,
};

function isCommandImplemented(command) {
  return COMMANDS.hasOwnProperty(command) && 
    typeof COMMANDS[command] === 'function';
}

async function executeCommand(command, args) {
  if(!isCommandImplemented(command)) {
    throw new Error(`Command ${command} is not implemented!`);
  }
  const context = { peer, io };
  return COMMANDS[command](context, ...args);
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
    const args = parts.slice(1);
    try {
      const result = await executeCommand(command, args);
      return Promise.resolve(result);
    } catch(err) {
      io.net.error(err.message);
      return Promise.resolve(true);
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
