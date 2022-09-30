const { Command } = require('../Command');

class DiscoverCommand extends Command {
      constructor() {
            super('discover',
                  'Performs peer discovery on a given address.\n' +
                  '\n' +
                  'Used to connect to a new peer or set of peers at a given ' +
                  'address. Results will be printed to the chat.\n' +
                        '\tUsage:\n' +
                        '\t\tSimple discovery: ' +
                        '> /discover ws://123.123.123.123:26780\n' +
                        '\t\tRange discovery: > /discover 123.123.123.123\n' +
                        '\t\tAddress discovery: > /discover peer.remote.com');
      }

      /**
       * Handler for the '/discover' command which initiates peer discovery.
       * 
       * @param  {Object}    context   A context providing variables needed by 
       *                               this handler to execute.
       * @param  {Any[]}     args      Arguments that are passed to this 
       *                               handler. A promise which resolves or 
       *                               rejects indicating whether the program 
       *                               should continue executing.
       */
      async execute(context, ...args) {
            const { peer, io } = context;
            const addresses = args.join(' ').split(',').map(a => a.trim());
            io.net.log(`Now discovering on ["${addresses.join('", "')}"].`);
            try {
              const results = await peer.discover(addresses);
              io.net.log(
                `Discovery completed on ["${addresses.join('", "')}"]: ${results}`);
            } catch(err) {
              io.net.error((new Error(
                    `Failed to discover on ["${addresses.join('", "')}"].`)).stack);
            }
            return Promise.resolve(true);
      }
}

module.exports = new DiscoverCommand();