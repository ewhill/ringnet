
const aliasCommand = require('./alias');
const debugCommand = require('./debug');
const discoverCommand = require('./discover');
const exitCommand = require('./exit');
const peersCommand = require('./peers');
const queueCommand = require('./queue');
const selfCommand = require('./self');
const sidebarCommand = require('./sidebar');

module.exports = {
	[aliasCommand.command]: aliasCommand,
	[debugCommand.command]: debugCommand,
	[discoverCommand.command]: discoverCommand,
	[exitCommand.command]: exitCommand,
	[peersCommand.command]: peersCommand,
	[queueCommand.command]: queueCommand,
	[selfCommand.command]: selfCommand,
	[sidebarCommand.command]: sidebarCommand,
	'help': ()=>{},
};