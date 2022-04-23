const Message = require('../Message');

class HeloMessage extends Message {
	constructor(options = {}) {
		super();
		const { publicAddress, publicKey, signature } = options;
		this.publicAddress = publicAddress;
		this.publicKey = publicKey;
		this.signature = signature;
	}

	get publicAddress() {
		return this.body.publicAddress;
	}
	set publicAddress(publicAddress) {
		this.body.publicAddress = publicAddress;
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