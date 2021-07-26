
const Message = require('../Message');

class PeersMessage extends Message {
	constructor(options = {}) {
		super();
		const { since, peers } = options;
		this.body = { since, peers };
	}

	get since() { return this.body.since; }
	set since(since) { this.body = { ...this.body, since }; }
	get peers() { return this.body.peers; }
	set peers(peers) { this.body = { ...this.body, peers }; }
}

module.exports = PeersMessage;