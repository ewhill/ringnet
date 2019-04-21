const crypto = require('crypto');
const Message = require('../message');

module.exports = function({ connection, message }) {
	try {
		// Create an AES-256-CBC decipher to decrypt the message body
		let encryptedMessageBody = Buffer.from(message.body,'base64');
		let messageSignature = Buffer.from(message.header.signature, 'base64');
      
		if(this.debug) {
			console.log(`Message Signature: ${messageSignature.toString('base64')}`);
			console.log(`Encrypted Message Body: ${encryptedMessageBody.toString('base64')}`);  
		}
      
		let decipher = crypto.createDecipheriv('aes-256-cbc', 
			connection.peerKey, connection.peerIv);
		let decryptedMessageBody = (Buffer.concat([
			decipher.update(encryptedMessageBody), decipher.final()]));
      
		// Check the message's 'signature' header...
		if(connection.peerPublicKey.verify(decryptedMessageBody, messageSignature)) {
			// Parse the decrypted message body back to JSON now (remember, 
			// before encryption by peer it was originally a JavaScript object).
			// The try/catch blocks around this scope allow for graceful failure
			// if the JSON.parse throws an exception.
			message.body = JSON.parse(decryptedMessageBody.toString('utf8'));
        
        if(connection.requireConfirmation) {
			// Send confirmation back to peer that we have received the message
			let confirmationMsg = new Message({
				type: Message.TYPES._confirm
			});

			confirmationMsg.header.confirm = {
				'hash': message.header.hash,
				'timestamp': message.header.timestamp
			};

			this.broadcast({
				message: confirmationMsg,
				connection
			});
        }
        
        if(message.header.hasOwnProperty("type") && 
        	typeof message.header.type == "string") {
				let type = Message.TYPE_STRING(message.header.type);

				if(this.debug)
					console.log(`Emitting custom event: '${type}''.`);

				this.emit(type, { message, connection });
        } else {
			// Emit the message event so our instantiator can take action
			this.emit('message', { message, connection });
        }
      } else {
		// Signature didn't match, throw error to exit
		throw new Error("ERROR: Message decrypted, but signature could not be verified.");
      }
    } catch(e) {
		if(this.debug) {
			// We're probably here as a result of a decrpytion error or verification error, in 
			// which case the message may have been corrupted. Best to exit gracefully...
			console.error("ERROR: trusted message was received but either could not be " +
				"decrypted with the agreed-upon AES properties or could not be verified " +
				"using the established RSA keys and given message signature.");

			console.log(JSON.stringify(message, true));
			console.log(e.stack);
		}
    }
}