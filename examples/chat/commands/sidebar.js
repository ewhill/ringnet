/**
 * Handler for the '/sidebar' command which enables or disables the sidebar.
 * 
 * @param  {Object}    context   A context providing variables needed by this 
 *                               handler to execute.
 * @param  {Any[]}     args      Arguments that are passed to this handler.
 * @return {Promise}             A promise which resolves or rejects indicating
 *                               whether the program should continue executing.
 */
async function sidebarCommandHandler(context, ...args) {
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

module.exports = { sidebarCommandHandler };