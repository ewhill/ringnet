const { Command } = require('../Command');

class ExitCommand extends Command {
      constructor() {
            super('exit',
                  'Leaves the chat and terminates this program.\n' +
                  '\n' +
                  'Used to disconnect from all remote peers and exit the ' +
                  'program completely. The safe equivalent of Ctrl-C.\n' +
                        '\tUsage:\n' +
                        '\t\t> /exit');
      }

      /**
       * Execute for the '/exit' command which terminates the program.
       * 
       * @param  {Object}    context   A context providing variables needed by 
       *                               this handler to execute.
       * @param  {Any[]}     args      Arguments that are passed to this
       * @return {Promise}             handler. A promise which resolves or
       *                               rejects indicating whether the program
       *                               should continue executing.
       */
      async execute(context, ...args) {
            const { peer } = context;
            await peer.close();
            return Promise.resolve(false);
      }
}

module.exports = new ExitCommand();