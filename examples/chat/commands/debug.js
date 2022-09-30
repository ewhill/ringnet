const { Command } = require('../Command');

class DebugCommand extends Command {
      constructor() {
            super('debug',
                  'Enables or disables debug mode.\n' +
                  '\n' +
                  'If enabled, nerdy log messages will print to the chat for ' +
                  'informational purposes. If disabled, no such messages ' +
                  'will be printed to the chat.\n' +
                        '\tUsage:\n' +
                        '\t\tEnable debug mode: > /debug enable\n' +
                        '\t\tDisable debug mode: > /debug disable\n' + 
                        '\t\tView current debug mode: > /debug');
      }

      /**
       * Handler for the '/debug' command which enables or disables debug mode.
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
            if (args.length > 0) {
              switch(args[0]) {
                case 'enable':
                  peer.enableDebugMode({
                              error: io.net.error,
                              info: io.net.info,
                              log: io.net.log,
                              warn: io.net.warn,
                        });
                  io.net.log(`Debug mode enabled.`);
                  break;
                case 'disable':
                  peer.disableDebugMode();
                  io.net.log(`Debug mode disabled.`);
                  break;
                default:
                  io.net.log(`Unknown debug mode switch '${args[0]}'.`);
              }
            } else {
              io.net.log(`Debug mode is ` +
                `${peer.isDebugModeEnabled ? 'enabled' : 'disabled'}`);
            }
            return Promise.resolve(true);
      }
}

module.exports = new DebugCommand();