/**
 * Handler for the '/self' command which displays own peer information.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function selfCommandHandler(context, ...args) {
      const { peer, io } = context;
      io.net.log(JSON.parse(peer.toString()));
      return Promise.resolve(true);
}

module.exports = { selfCommandHandler };