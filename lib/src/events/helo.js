const crypto = require('crypto');

const Message = require('../message.js');
const RSAKeyPair = require('../RSAKeyPair.js');

module.exports = function({ connection, message }) {
	/*
	 * Check that the signature and public key the peer gave us were indeed 
	 * signed by the same private key that 'this' publicKey was signed with 
	 * (aka the ring private)...
	 */
	var peerRSAKeyPair = false,
	peerPublicKeySignature = false,
	keyIsSigned = false;

	try {
		/*
		 * Generate the RSAKeyPair and peerPublicKeySignature from that which 
		 * the message (from peer) has provided in it's body.
		 */
		peerRSAKeyPair  = new RSAKeyPair({
				publicKeyBuffer: Buffer.from(message.body.publicKey, 'utf8')
			});

		peerPublicKeySignature = Buffer.from(message.body.signature, 'hex');

		/*
		 * Check to make sure the signature isn't our own. If so, we don't want
		 * to connect to ourselves, obviously.
		 */
		if(this.isOwnSignature(peerPublicKeySignature.toString("hex"))) {
			/* istanbul ignore if */
			if(this.debug)  {
				console.log("Received signature matching own signature from " + 
					"peer. Closing connection so as to prevent potential " + 
					"connection to self.");
			}

			connection.close();
			return;
		}

		/* istanbul ignore if */
		if(this.debug) {
		  console.log("\tGot peer public key...");
		  console.log("\t\t-> Signature (last 50 bytes): " + 
		  	peerPublicKeySignature.slice(-50).toString("hex"));
		}

		// Verify the peer's public key...
		keyIsSigned = this.ringRSAKeyPair.verify(message.body.publicKey, 
			peerPublicKeySignature);

		/* istanbul ignore if */
		if(this.debug) {
		  console.log(`\tkeyIsSigned: ${keyIsSigned}`);
		}
	} catch(e) {
		/* istanbul ignore if */
		if(this.debug) {
			console.error(e.stack);
			/*
			 * If we've landed here, it is most likely the result of an error 
			 * creating the RSAKeyPair from the key in the given peer's 
			 * message body OR there was an error as a result of calling 
			 * ringPublicKey.verify.
			 */
			console.error("ERROR: The peer's message body could either not " + 
				"be understood or not be verified. Exiting now.");
		}
		  
		return false;
	}

	/*
	 * Let's check to make sure we have the peerRSAKeyPair, 
	 * peerPublicKeySignature, and the signature has been VERIFIED against our 
	 * copy of ringPublicKey.
	 */
	if(peerRSAKeyPair && peerPublicKeySignature && keyIsSigned) {
		/* istanbul ignore if */
		if(this.debug) {
			console.log(`\tPeer at ${connection.remoteAddress} on port ` +
				`${connection._socket.remotePort} is now TRUSTED.`);
		}
	  
		/*
		 * Set the trusted flag on the connection, and set some other 
		 * connection variables for use in later communications (AES-256-CBC).
		 */
		connection.trusted = true;
		connection.peerRSAKeyPair = peerRSAKeyPair;
		connection.peerPublicKeySignature = peerPublicKeySignature;
		connection.iv = Buffer.from(crypto.randomBytes(16));
		connection.key = Buffer.from(crypto.randomBytes(32));

		/*
		 * Encrypt the key and iv with the peer's public key which we have as a 
		 * result of the (now verified and trusted) HELO.
		 */
		let encryptedIV = connection.peerRSAKeyPair.encrypt(connection.iv);
		let encryptedKey = connection.peerRSAKeyPair.encrypt(connection.key);

		// Create and send a verification of trust message
		let knownPeers = this.getPeerList([ 
			peerPublicKeySignature.toString('hex') ]);

		/* istanbul ignore if */
		if(this.debug) console.log(JSON.stringify(knownPeers));

		let trusted = new Message();
		trusted.header.type = Message.TYPES._trusted;
		trusted.body = {
			'key': encryptedKey.toString('base64'),
			'iv': encryptedIV.toString('base64'),
			'peers': knownPeers,
			'listening': {
				'port': this.port,
				'address': this.publicAddress,
			},
			'requireConfirmation': this.requireConfirmation
		};
		trusted.header.signature = 
			(this.peerRSAKeyPair.sign(JSON.stringify(trusted.body)))
				.toString('hex');

		var trustedCallback = 
			function(err, backoff, connection, message, self) {
				if(err) {
					self.managedTimeouts.setTimeout(() => {
						connection.send(message.toString(), (err) => {
							trustedCallback(err, backoff*1.5, connection, 
								message, self);
						});
					}, backoff);
				}
		};
	  
		// Send the message
		connection.send(trusted.toString(), (err) => {
			trustedCallback(err, 5000, connection, trusted, this);
		});
	}
}