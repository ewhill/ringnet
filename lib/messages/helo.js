const Message = require('../Message');

class HeloMessage extends Message {
	constructor(options = {}) {
		super();
		const { publicKey, signature } = options;
		this.publicKey = publicKey;
		this.signature = signature;
	}

	get publicKey() {
		return this.body.publicKey;
	}
	set publicKey(publicKey) {
		this.body.publicKey = publicKey;
	}

	get signature() {
		return this.body.signature;
	}
	set signature(signature) {
		this.body.signature = signature;
	}
}

module.exports = HeloMessage;