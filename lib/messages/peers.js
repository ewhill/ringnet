const Message = require('../Message');

class PeersMessage extends Message {
	constructor(options = {}) {
		super();
		const { since=0, peers=[] } = options;
		this.since = since;
		this.peers = peers;
	}

	get since() {
		return this.body.since;
	}
	set since(since=0) {
		if (typeof since !== 'number') {
			throw new Error(`Invalid type for PeersMessage 'since' parameter.`);
		}
		this.body.since = since;
	}

	get peers() {
		return this.body.peers;
	}
	set peers(peers=[]) {
		if (!Array.isArray(peers)) {
			throw new Error(`Invalid type for PeersMessage 'peers' parameter.`);
		}
		this.body.peers = peers;
	}
}

module.exports = PeersMessage;