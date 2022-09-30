const { Command } = require('../Command');

class QueueCommand extends Command {
      constructor() {
            super('queue',
                  'Enables or disables queue mode.\n' +
                  '\n' +
                  'If enabled, messages are not sent immediately, but rather ' +
                  'added to a queue which can be sent, in full, at a later ' +
                  'time using the \'send\' argument to this command.\n' +
                        '\tUsage:\n' +
                        '\t\tEnable queue mode: > /queue enable\n' +
                        '\t\tDisable queue mode: > /queue disable\n' + 
                        '\t\tView current queue mode: > /queue');
      }

      /**
       * Handler for the '/queue' command which enables or disables the 
       * messaging queue or sends all messages in the current messaging queue.
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
}

module.exports = new QueueCommand();