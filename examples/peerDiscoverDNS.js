"use strict";

const fs = require('fs');
const dns = require('dns');
const url = require('url');
const readline = require('readline');
const { EventEmitter } = require('events');

const ArgumentsParser = require('./ArgumentsParser');
const { Peer, Message } = require('../index.js');

class CliMessage extends Message {
  constructor(options = {}) {
    super();
    const { data='' } = options;
    this.data = data;
  }

  get data() { return this.body.data; }
  set data(value='') { this.body = { ...this.body, data: value }; }
}

class CliInputHandler extends EventEmitter {
  canSend = true;
  readInterface;
  queue = [];

  constructor({ canSend=true, queue=[] }) {
    this.canSend = canSend;
    this.queue = queue;
  }

  open() {
    this.readInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'NET> '
      });
    this.readInterface.on('line', this.onLineInput);
  }

  close() {
    this.readInterface.close();
    this.emit('close');
  }

  async onLineInput(line) {
    if(!line || line.toString().length < 1) {
      return;
    }

    line = line.toString();

    if(line == 'exit') {
      this.close();
    } else if(line == 'peers') {
      console.log(`\n\n${JSON.stringify(peer.getPeerList())}\n\n`);
    } else if(line == 'queue') {
      console.log(`\n\n${JSON.stringify(queue)}\n\n`);
    } else if(line == 'queue on') {
      canSend = false;
    } else if(line == 'queue off') {
      canSend = true;
    } else if(line == 'queue send' || line == 'send') {
      // Send all the queued messages
      while(queue.length > 0) {
        try {
          const cliMessage = queue.splice(0,1)[0];
          await peer.broadcast({ message: cliMessage });
        } catch(e) {
          console.error(e.stack);
        }
      }
    } else {
      const cliMessage = new CliMessage({ data: line });
      if(!canSend) {
        queue.push(cliMessage);
        return;
      }

      try {
        await peer.broadcast({ message: cliMessage });
      } catch(e) {
        console.error(e.stack);
      }
    }
  }
}

const argumentsParser = new ArgumentsParser({
    // --signature=path<str> [REQUIRED] Path to peer signature.
    'signature': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --d=enabled<bool> [OPTIONAL] Defaults to false.
    'daemon': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    'debug': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    'verbose': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    'v': ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL,
    // --peers=peers<array<str>> [OPTIONAL] Defaults to [].
    'peers': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING_ARRAY,
    // --port=port<int> [OPTIONAL] Defaults to 26781.
    'port': ArgumentsParser.ARGUMENT_TYPE_ENUM.INT,
    // --private=path<str> [OPTIONAL] Defaults to "peer.pem".
    'private': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --public=path<str> [OPTIONAL] Defaults to "peer.pub".
    'public': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --range=ports<array<int>> [OPTIONAL] Defaults to [26780,26790].
    'range': ArgumentsParser.ARGUMENT_TYPE_ENUM.INT_ARRAY,
    // --ring=path<str> [OPTIONAL] Defaults to "ring.pub".
    'ring': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
    // --seed=host<str> [OPTIONAL] Defaults to empty string.
    'seed': ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING,
  });
const args = argumentsParser.parse();

const nslookup = (host) => {
    return new Promise((resolve, reject) => {
      dns.resolve(host, (err, result) => {
        return err ? reject(err) : resolve(result);
      });
    });
  };

let queue = [];
let canSend = true;

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

const main = async () => {
  const SEED_HOST = args.seed || process.env.RINGNET_SEED;

  if(!args.peers) {
    args.peers = [];
  }

  try {
    const seedHostUrl = url.parse(SEED_HOST);
    const ips = await nslookup(seedHostUrl.hostname || seedHostUrl.href);

    console.log(ips);
    if(ips.length > 0) {
      if(seedHostUrl.hostname) {
        // Change the hostname (minus port)
        seedHostUrl.hostname = ips[0];
      } else {
        seedHostUrl.href = ips[0];
      }
      
      // ... and tack the port back on
      args.peers.push(seedHostUrl.href);
    }
  } catch(err) {
    // Proceed (with caution)...
    if(typeof SEED_HOST == "string") {
      args.peers.push(SEED_HOST);
    }
  }

  console.log(args); // Debugging...
  
  const peer = new Peer({
      'port': args.port,
      'discoveryAddresses': args.peers,
      'discoveryRange': args.range,
      'ringPublicKey': args.ring,
      'publicKey': args.public,
      'privateKey': args.private,
      'signature': args.signature,
      'debug': args.debug || args.v || args.verbose
    });
    
  await peer.init();
  
  peer.bind(CliMessage).to(({ message, connection }) => {
      // TODO: Do something with the message (Update DB, Blockchain, etc...)
      console.log(`\n\n`,JSON.stringify(message, true),`\n\n`);
    });

  const cliInputHandler = new CliInputHandler();
  
  if(!args.daemon) {
    cliInputHandler.open();
    cliInputHandler.on('close', () => {
      await peer.close();
      process.exit(1);
    })
  }

  // Take care of a clean exit.
  const cleanup = async (eventType) => {
      console.log(`Exiting as a result of '${eventType}'`);
      await peer.close();
      process.exit(1);
    };

  [`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`]
    .forEach((eventType) => {
      process.on(eventType, cleanup.bind(null, eventType));
    });
};

return main();
