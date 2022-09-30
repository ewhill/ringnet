const { Command } = require('../Command');

class SelfCommand extends Command {
      constructor() {
            super('self',
                  'Displays information about this peer.\n' +
                  '\n' +
                  'Used to view helpful information about this peer, ' +
                  'including settings used to intialize and execute.\n' +
                        '\tUsage:\n' +
                        '\t\t/self');
      }

      /**
       * Handler for the '/self' command which displays own peer information.
       * 
       * @param  {Object}    context   A context providing variables needed by 
       *                               this handler to execute.
       * @param  {Any[]}     args      Arguments that are passed to this
       * @return {Promise}             handler. A promise which resolves or
       *                               rejects indicating whether the program
       *                               should continue executing.
       */
      async execute(context, ...args) {
            const { peer, io } = context;
            io.net.log(JSON.parse(peer.toString()));
            return Promise.resolve(true);
      }
}

module.exports = new SelfCommand();