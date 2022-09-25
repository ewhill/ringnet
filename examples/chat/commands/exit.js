/**
 * Handler for the '/exit' command which indicates the program should terminate.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {...Any}    args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function exitCommandHandler(context, ...args) {
      const { peer } = context;
      await peer.close();
      return Promise.resolve(false);
}

module.exports = { exitCommandHandler };