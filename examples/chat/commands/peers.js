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
      const peers = peer.trustedPeers.map(p => {
                  let whoIs = p.peerAddress;
                  if(peer.hasAlias(p.remoteSignature)) {
                        whoIs = 
                              `${peer.getAlias(p.remoteSignature)} (${whoIs})`;
                  }
                  return `${whoIs} -- ` +
                        `online since ${p.created.toLocaleString()}`;
            });
      io.net.log(`Connected peers:\n\t${peers.join('\n\t')}`);
      return Promise.resolve(true);
}

module.exports = { peersCommandHandler };