const crypto = require('crypto');
const Message = require('../message');

module.exports = function({ connection, message }) {
	try {
		// Create an AES-256-CBC decipher to decrypt the message body
		let encryptedMessageBody = Buffer.from(message.body, 'base64');
		let messageSignature = Buffer.from(message.header.signature, 'hex');
      
      	/* istanbul ignore if */
		if(this.isDebugEnabled_) {
			console.log(`Message signature (last 16 bytes): ` + 
				`\n\t-> ${messageSignature.toString('hex').slice(-32)}`);
			console.log(`Encrypted message body: `+
				`\n\t-> ${encryptedMessageBody.toString('base64')}`);  
		}
      
		let decipher = crypto.createDecipheriv('aes-256-cbc', 
			connection.peerKey, connection.peerIv);
		let decryptedMessageBody = (Buffer.concat([
			decipher.update(encryptedMessageBody), decipher.final()]));

		// Check the message header's 'signature' validity...
		const hasValidSignature = 
			connection.peerRSAKeyPair.verify(decryptedMessageBody, 
				messageSignature);
      
		if(hasValidSignature) {
			/*
			 * Parse the decrypted message body back to JSON now (remember, 
			 * before encryption by peer it was originally a JavaScript 
			 * object). The try/catch blocks around this scope allow for 
			 * graceful failure if the JSON.parse throws an exception.
			 */
			message.body = JSON.parse(decryptedMessageBody.toString('utf8'));

			if(message.header.hasOwnProperty('type') && 
				typeof message.header.type === 'string') {
					const messageType = 
						Message.TYPE_STRING(message.header.type);

					/* istanbul ignore if */
					if(this.isDebugEnabled_) {
						console.log(`Emitting custom event: '${messageType}'.`);
					}

					this.eventEmitter_.emit(
						messageType, { message, connection });
			} else {
				// Emit the message event so our instantiator can take action.
				this.eventEmitter_.emit('message', { message, connection });
			}
      	} else {
			// Signature didn't match, throw error to exit.
			throw new Error(`ERROR: Message decrypted, but signature could ` + 
				`not be verified.`);
      	}
    } catch(e) {
    	/* istanbul ignore if */
		if(this.isDebugEnabled_) {
			/*
			 * We're probably here as a result of a decrpytion error or 
			 * verification error, in which case the message may have been 
			 * corrupted. Best to exit gracefully...
			 */
			console.error(`ERROR: trusted message was received but either ` + 
				`could not be decrypted with the agreed-upon AES properties ` + 
				`or could not be verified using the established RSA keys ` + 
				`and given message signature.`);

			console.log(JSON.stringify(message, true));
			console.log(e.stack);
		}
    }
}