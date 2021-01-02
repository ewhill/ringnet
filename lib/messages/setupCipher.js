
const crypto = require('crypto');

const Message = require('../Message');
const RSAKeyPair = require('../RSAKeyPair.js');

class SetupCipherMessage extends Message {
	constructor(options = {}) {
		super();
		const { iv, key } = options;
		this.body = { iv, key };
	}

	clone() {
		return new SetupCipherMessage({
			iv: this.iv,
			key: this.key
		});
	}

	get iv() { return this.body.iv; }
	set iv(iv) { this.body = { ...this.body, iv }; }
	get key() { return this.body.key; }
	set key(key) { this.body = { ...this.body, key }; }
}

module.exports = {
	SetupCipherMessage
};
