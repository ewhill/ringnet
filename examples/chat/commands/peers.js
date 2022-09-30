const { Command } = require('../Command');

class PeersCommand extends Command {
      constructor() {
            super('peers',
                  'Displays informatino about the connected peers.\n' +
                  '\n' +
                  'Used to display a list of connected peers and any ' +
                  'aliases, if available, along with the time since ' +
                  'connection was established for each.\n' +
                        '\tUsage:\n' +
                        '\t\t> /peers');
      }

      /**
       * Handler for the '/peers' command which displays information about 
       * connected peer(s).
       * 
       * @param  {Object}    context   A context providing variables needed by 
       *                               this handler to execute.
       * @param  {Any[]}     args      Arguments that are passed to this
       * @return {Promise}             handler. A promise which resolves or
       *                               rejects indicating whether the program
       *                               should continue executing.
       */
      async execute(context, ...args) {
            const { peer, io } = context;
            const peers = peer.trustedPeers.map(p => {
                        let whoIs = p.peerAddress;
                        if(peer.hasAlias(p.remoteSignature)) {
                              whoIs = 
                                    `${peer.getAlias(p.remoteSignature)} ` +
                                    `(${whoIs})`;
                        }
                        return `${whoIs} -- ` +
                              `online since ${p.created.toLocaleString()}`;
                  });
            io.net.log(`Connected peers:\n\t${peers.join('\n\t')}`);
            return Promise.resolve(true);
      }
}

module.exports = new PeersCommand();