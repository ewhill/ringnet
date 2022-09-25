/**
 * Handler for the '/alias' command which displays or sets own peer alias.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function aliasCommandHandler(context, ...args) {
      const { peer } = context;
      const alias = args.join(' ');
      await peer.setOwnAlias(alias);
      return Promise.resolve(true);
}

module.exports = { aliasCommandHandler };