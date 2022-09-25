/**
 * Handler for the '/debug' command which enables or disables debug mode.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function debugCommandHandler(context, ...args) {
      const { peer, io } = context;
      if (args.length > 0) {
        switch(args[0]) {
          case 'enable':
            peer.enableDebugMode();
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

module.exports = { debugCommandHandler };