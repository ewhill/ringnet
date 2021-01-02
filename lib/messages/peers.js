
const Message = require('../Message');
const MessageTypes = require('../MessageTypes');

class PeersRequest extends Message {
	constructor(options = {}) {
		super();

		const { since } = options;

		this.type = MessageTypes._peers;
		this.body =  { since };
	}
}

class PeersResponse extends Message {
	constructor(options = {}) {
		super();

		// TODO: Implement _peers response.
	}
}

const PeersHandler = (peer, message, connection, logger=console) => {
};

module.exports = {
	PeersRequest,
	PeersResponse,
	PeersHandler
};