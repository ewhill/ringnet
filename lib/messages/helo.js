
const crypto = require('crypto');

const Message = require('../Message');
const RSAKeyPair = require('../RSAKeyPair');
const { SetupCipherRequest } = require('./setupCipher');

class HeloMessage extends Message {
	constructor(options = {}) {
		super();
		const { publicKey, signature } = options;
		this.body = { publicKey, signature };
	}

	get publicKey() { return this.body.publicKey; }
	set publicKey(publicKey) { this.body = { ...this.body, publicKey }; }
	get signature() { return this.body.signature; }
	set signature(signature) { this.body = { ...this.body, signature }; }
}

module.exports = HeloMessage;