const Message = require('../Message');

class SetupCipherMessage extends Message {
	constructor(options = {}) {
		super();
		const { iv, key } = options;
		this.iv = iv;
		this.key = key;
	}

	get iv() {
		return this.body.iv;
	}
	set iv(iv) {
		this.body.iv = iv;
	}

	get key() {
		return this.body.key;
	}
	set key(key) {
		this.body.key = key;
	}
}

module.exports = SetupCipherMessage;
