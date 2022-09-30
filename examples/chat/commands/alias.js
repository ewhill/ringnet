const { Command } = require('../Command');

class AliasCommand extends Command {
      constructor() {
            super('alias',
                  'Sets your chat alias.\n' +
                  '\n' +
                  'After successfully setting your alias, your messages will ' +
                  'apear as the value given to the command in your and ' +
                  'others\s chats.\n' +
                        '\tUsage:\n' +
                        '\t\t> /alias Bob');
      }

      /**
       * Handler for the '/alias' command which displays or sets own peer alias.
       * 
       * @param  {Object}    context   A context providing variables needed by 
       *                               this handler to execute.
       * @param  {Any[]}     args      Arguments that are passed to this 
       *                               handler. A promise which resolves or 
       *                               rejects indicating whether the program 
       *                               should continue executing.
       */
      async execute(context, ...args) {
            const { peer } = context;
            const alias = args.join(' ');
            await peer.setOwnAlias(alias);
            return Promise.resolve(true);
      }
}

module.exports = new AliasCommand();