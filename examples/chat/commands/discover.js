/**
 * Handler for the '/discover' command which initiates peer discovery.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function discoverCommandHandler(context, ...args) {
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

module.exports = { discoverCommandHandler };