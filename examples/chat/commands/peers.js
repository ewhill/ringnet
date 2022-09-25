/**
 * Handler for the '/peers' command which displays information about connected 
 * peer(s).
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function peersCommandHandler(context, ...args) {
      const { peer, io } = context;
      io.net.log(peer.peers);
      return Promise.resolve(true);
}

module.exports = { peersCommandHandler };