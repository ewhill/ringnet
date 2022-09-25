
const { aliasCommandHandler } = require('./alias');
const { debugCommandHandler } = require('./debug');
const { discoverCommandHandler } = require('./discover');
const { exitCommandHandler } = require('./exit');
const { peersCommandHandler } = require('./peers');
const { queueCommandHandler } = require('./queue');
const { selfCommandHandler } = require('./self');

module.exports = {
	aliasCommandHandler,
	debugCommandHandler,
	discoverCommandHandler,
	exitCommandHandler,
	peersCommandHandler,
	queueCommandHandler,
	selfCommandHandler,
};