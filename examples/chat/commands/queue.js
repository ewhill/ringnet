/**
 * Handler for the '/queue' command which enables or disables the messaging 
 * queue or sends all messages in the current messaging queue.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function queueCommandHandler(context, ...args) {
      const { peer, io } = context;
      if (args.length > 0) {
        switch(args[0]) {
          case 'enable':
            peer.enableMessageQueue();
            io.net.log(`Message queue enabled.`);
            break;
          case 'disable':
            peer.disableMessageQueue();
            io.net.log(`Message queue disabled.`);
            break;
          case 'send':
            await peer.sendQueue();
            break;
          default:
            io.net.log(`Unknown queue switch '${args[0]}'.`);
        }
      } else {
        io.net.log(`Message queue is ` +
          `${peer.isQueueEnabled ? 'enabled' : 'disabled'}`);
      }
      return Promise.resolve(true);
}

module.exports = { queueCommandHandler };