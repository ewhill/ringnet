const { Command } = require('../Command');

class SidebarCommand extends Command {
  constructor() {
    super('sidebar',
          'Enables or disables the sidebar view.\n' +
          '\n' +
          'If enabled, a sidebar will display statically on the left side of ' +
          'the chat and include a list of connected (active) peers. If ' +
          'disabled, the sidebar will not be displayed or will be hidden.\n' +
                '\tUsage:\n' +
                '\t\tEnable sidebar view: > /sidebar enable\n' +
                '\t\tDisable sidebar view: > /sidebar disable\n' + 
                '\t\tView current sidebar view: > /sidebar');
  }

  /**
   * Handler for the '/sidebar' command which enables or disables the sidebar.
   * 
   * @param  {Object}    context   A context providing variables needed by this 
   *                               handler to execute.
   * @param  {Any[]}     args      Arguments that are passed to this handler.
   * @return {Promise}             A promise which resolves or rejects 
   *                               indicating whether the program should 
   *                               continue executing.
   */
  async execute(context, ...args) {
        const { io } = context;
        if (args.length > 0) {
          switch(args[0]) {
            case 'enable':
              io.enableSidebar();
              io.net.log(`Siedbar enabled.`);
              break;
            case 'disable':
              io.disableSidebar();
              io.net.log(`Sidebar disabled.`);
              break;
            default:
              io.net.log(`Unknown sidebar switch '${args[0]}'.`);
          }
        } else {
          io.net.log(`Sidebar is ` +
            `${io.isSidebarEnabled ? 'enabled' : 'disabled'}`);
        }
        return Promise.resolve(true);
  }
}

module.exports = new SidebarCommand();