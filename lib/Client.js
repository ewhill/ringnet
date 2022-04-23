const crypto = require('crypto');
const EventEmitter = require('events');
const WebSocket = require('ws');

const RSAKeyPair = require('./RSAKeyPair');
const HeloMessage = require('./messages/helo');
const SetupCipherMessage = require('./messages/setupCipher');
const RequestHandler = require('./RequestHandler');
const ManagedTimeouts = require('./managedTimeouts');
const Message = require('./Message');
const utils = require('./utils');

const WebSocketClient = WebSocket;
const WebSocketServer = WebSocket.Server;

const MAX_MESSAGE_SEND_TIMEOUT_MS = 30000; // 30s


class Client {
	cipher_ = {
		iv: Buffer.from(crypto.randomBytes(16)),
		key: Buffer.from(crypto.randomBytes(32))
	};
	created_ = utils.utcTimestamp();
	eventEmitter_ = new EventEmitter();
	isTrusted_ = false;
	managedTimeouts_ = new ManagedTimeouts();
	requestHandlers_ = {};

	connection_;
	credentials_;
	ringRsaKeyPair_;
	address_;
	peerAddress_;
	signatureValidator = () => true;
	logger_ = console;

	isConnected_ = false;
	isConnecting_ = false;
	connectPromise_;
	isTrusted_ = false;
	upgradePromise_;
	upgradePromiseTimeout_;
	setupCipherPromise_;
	sendSetupCipherPromise_;
	receiveSetupCipherPromise_;
	setupCipherPromiseResolve_;
	setupCipherPromiseReject_;
	setupCipherTimeout_;
	heloPromise_;
	hasSentHelo = false;
	sendHeloPromise_;
	receiveHeloPromise_;
	receiveHeloTimeout_;
	receiveHeloPromiseResolve_;
	receiveHeloPromiseReject_;
	remoteCipher_;

	constructor({
		connection,
		credentials,
		ringRsaKeyPair,
		address,
		peerAddress,
		signatureValidator=this.signatureValidator_,
		logger=this.logger_,
	}) {

		const { rsaKeyPair, signature } = credentials;
		if(!rsaKeyPair || !signature) {
			throw new Error(`Invalid credentials!`);
		}

		this.connection_ = connection;
		this.credentials_ = credentials;
		this.ringRsaKeyPair_ = ringRsaKeyPair;
		this.address_ = address;
		this.peerAddress_ = peerAddress;
		this.signatureValidator_ = signatureValidator;
		this.logger_ = logger;

	   	this.setupConnection();
	}

	setupConnection() {
		if(this.connection_.readyState !== WebSocket.OPEN) {
			this.isConnected_ = false;
			this.isConnecting_ = true;

			this.connectPromise_ = new Promise((resolve, reject) => {
					const connectCleanup = () => {
						this.isConnecting_ = false;
						this.connection_.removeEventListener(
							'error', onConnectError);
						this.connection_.removeEventListener(
							'open', onConnectOpen);
						this.connection_.removeEventListener(
							'close', onConnectClose);
					};

					const onConnectError = (e) => {
						connectCleanup();
						this.isConnected_ = false;
						return reject(e);
					};

					const onConnectOpen = () => {
						connectCleanup();
						this.isConnected_ = true;
						return resolve();
					};

					const onConnectClose = () => {
						connectCleanup();
						this.isConnected_ = false;
						return reject();
					};

					this.connection_.addEventListener('error', onConnectError);
					this.connection_.addEventListener('open', onConnectOpen);
					this.connection_.addEventListener('close', onConnectClose);
				}).then(() => {
					this.onConnected();
				});
		} else {
			this.connectPromise_ = 
				Promise.resolve()
					.then(() => {
						this.onConnected();
					});
			this.isConnecting_ = false;
			this.isConnected_ = true;
		}

		return this.connectPromise_;
	}

	onConnected() {
		this.connection_.on('message', (e) => {
				this.onMessage_.apply(this, [ e ]);
			});

		this.connection_.on('close', (e) => {
			    this.isConnected_ = false;
			    this.isConnecting_ = false;
			    this.isTrusted_ = false;
      			this.logger_.log(`Connection closed with code: ${e}`);
			});

		this.upgrade();
	}

	connect() { return this.connectPromise_; }

	async upgrade() {
		if(!this.isConnected) {
			await this.connect();
		}

		if(!this.isTrusted && !this.upgradePromise_) {
        	this.upgradePromise_ = new Promise((resolve, reject) => {
					this.upgradePromiseTimeout_ = 
						this.managedTimeouts_.setTimeout(reject, 30000);

					this.heloPromise
						.then(() => {
								return this.setupCipherPromise
									.then(() => {
										return resolve();
									})
									.catch((e) => {
										return reject(e);
									});
							})
							.catch((e) => {
								return reject(e);
							});
	        	}).then(() => {
	        		this.managedTimeouts_.clearTimeout(
	        			this.upgradePromiseTimeout_);
	        		this.isTrusted_ = true;
	        	}).catch((e) => {
	        		console.error(e);
	        		this.close();
	        		this.logger_.error(e);
	        	});
	    }

	    return this.upgradePromise_;
	}

	close() {
		if(!this.isConnected_ && !this.isConnecting_) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const closed = () => {
				this.managedTimeouts_.clearAll();
				return resolve();
			};

			this.connection_.on('close', closed);
			this.isConnected_ = false;
			this.isConnecting_ = false;
			this.isTrusted_ = false;
			this.connection_.close();

			this.managedTimeouts_.setTimeout(() => {
				this.connection_.terminate();
				closed();
			}, 5000);
		});
	}

	onMessage_(message) {
		if(!(message instanceof String)) {
			message = message.toString('utf8');
		}

	    let messageType;
	    const bracketIndex = message.indexOf("{");

	    if(bracketIndex < 0) {
	    	throw new Error(`Message could not be understood.`)
	    } else if(bracketIndex === 0) {
	    	messageType = 'Message';
	    } else if(bracketIndex > 0) {
	    	messageType = message.slice(0, bracketIndex);
	    	message = message.slice(bracketIndex);
	    }

	    if(this.isTrusted) {
	    	try {
	    		message = JSON.parse(message);
	    	} catch(e) {
	    		this.logger_.error(e.stack);
	    		return;
	    	}

			// Create an AES-256-CBC decipher to decrypt the message body
			let encryptedMessageBody = Buffer.from(message.body, 'base64');
			let messageSignature = 
				Buffer.from(message.header.signature, 'base64');
	        
			this.logger_.log(`Message signature (last 16 bytes): ` + 
				`\n\t-> ${messageSignature.toString('base64').slice(-32)}`);
			this.logger_.log(`Encrypted message body: `+
				`\n\t-> ${encryptedMessageBody.toString('base64')}`);  
	       
			let decipher = crypto.createDecipheriv('aes-256-cbc', 
				this.remoteCipher_.key, this.remoteCipher_.iv);
			let decryptedMessageBody = (Buffer.concat([
				decipher.update(encryptedMessageBody), decipher.final()]));

			// Check the message header's 'signature' validity...
			const hasValidSignature = 
				this.remoteCredentials_.rsaKeyPair.verify(
					decryptedMessageBody, messageSignature);
	        
			if(hasValidSignature) {
				try {
					message.body = 
						JSON.parse(decryptedMessageBody.toString('utf8'));
				} catch(e) {
					/*
					* We're probably here as a result of a decrpytion error or 
					* verification error, in which case the message may have 
					* been corrupted. Best to exit gracefully...
					*/
					this.logger_.error(
						`A trusted message was received but either ` +
						`could not be decrypted with the agreed-upon ` + 
						`encryption properties or could not be verified ` +
						`using the established RSA keys and given message ` +
						`signature.`);
					return;
				}
			} else {
				// Signature didn't match, throw error to exit.
				this.logger_.error(
					`ERROR: Message decrypted, but signature could not be ` +
					`verified.`);
				return;
			}
	    }

	    this.logger_.log(`Received message: "${messageType}".`);

	    if(this.requestHandlers_.hasOwnProperty(messageType)) {
	    	const handler = this.requestHandlers_[messageType];
	    	const messageObj = handler.upgrade(message);
	    	const isHeloMessage = messageObj instanceof HeloMessage;
		    const isSetupCipherMessage = 
		    	messageObj instanceof SetupCipherMessage;

	    	if(!this.isTrusted && (isHeloMessage || isSetupCipherMessage)) {
	    		try {
	    			handler.invoke(messageObj, this);
	    		} catch(e) {
	    			this.logger_.error(e.stack);
	    		}
			} else {
				this.logger_.error(
					`Message received but connection is not setup or trusted.`);
			}

			return; // Don't continue.
	    }

    	this.logger_.log(`Emitting message event for ${messageType}.`);
    	this.eventEmitter_.emit('message', this, messageType, message);
	}

	onMessage(callback) {
		this.eventEmitter_.on('message', callback);
	}

	offMessage(callback) {
		this.eventEmitter_.off('message', callback);
	}

	bind_(RequestClass) {
	    const requestHandler = new RequestHandler(RequestClass);
	    this.requestHandlers_[RequestClass.name] = requestHandler;
	    return this.requestHandlers_[RequestClass.name];
	}

	unbind_(RequestClass) {
	    if(this.requestHandlers_.hasOwnProperty(RequestClass.name)) {
	    	const unbound = this.requestHandlers_[RequestClass.name];
			delete this.requestHandlers_[RequestClass.name];
			return unbound;
	    }
	    return false;
	}

	/**
	 * Sends a message to this client's remote and tries to resent the message 
	 * if the send fails.
	 * 
	 * @param  {Message} message 
	 *         The message to send to the connection.
	 */
	async send(message) {
		if(!message) {
		  throw new Error(`Invalid message!`);
		}

		if(!this.isConnected) {
		  if(this.isConnecting) {
		    await this.connect();
		  } else {
		    throw new Error(`Connection is not open!`);
		  }
		}

		const isHeloMessage = message instanceof HeloMessage;
		const isCipherSetupMessage = message instanceof SetupCipherMessage;

		if(!isHeloMessage && !isCipherSetupMessage && !this.isTrusted) {
			this.logger_.warn(
				`Attempted to send message before connection could be ` + 
				`upgraded: ${message}`);

			await this.upgrade();
		}

		const clone = Message.from(message);

		if(this.isTrusted) {
			try {
				const signature = 
					(this.credentials_.rsaKeyPair.sign(
						JSON.stringify(message.body))).toString('base64');
				clone.header = { signature };

				const cipher = crypto.createCipheriv(
					'aes-256-cbc', this.cipher_.key, this.cipher_.iv);

				const messageBodyBuffer = 
					Buffer.from(JSON.stringify(message.body));
				const encryptedMessageBodyBuffer = 
					Buffer.concat([cipher.update(messageBodyBuffer), 
						cipher.final()]);
				clone.body = encryptedMessageBodyBuffer.toString('base64');
			} catch(e) {
				throw new Error(`Could not encrypt message!`);
			}
		}

		return new Promise((resolve, reject) => {
			const data = message.constructor.name + clone.toString();

			const sendCallback = (err, backoff, connection, data) => {
				if(err) {
					backoff *= 1.5;

					if(backoff > MAX_MESSAGE_SEND_TIMEOUT_MS) {
						return reject(new Error(
					  		`Max timeout readched when attempting to send ` + 
					  		`message!`));
					}

					this.managedTimeouts_.setTimeout(() => {
						this.connection_.send(message.toString(), (err) => {
							sendCallback(
								err, backoff, this.connection_, message);
						});
					}, backoff);
				} else {
				  return resolve({ message });
				}
			};

			this.logger_.log(`Sending message:\n`, data);

			this.connection_.send(data, (err) => {
				sendCallback(err, 5000, this.connection_, data);
			});
		});
	}

	get sendHeloPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.hasSentHelo_) {
			let heloMessage = new HeloMessage({
				publicAddress: this.address,
				publicKey: this.credentials_.rsaKeyPair.public.toString('utf8'),
				signature: this.credentials_.signature.toString('hex'),
			});
			heloMessage.header = {
				signature: (this.credentials_.rsaKeyPair.sign(
					JSON.stringify(heloMessage.body)))
						.toString('base64')
			};
			this.sendHeloPromise_ = this.send(heloMessage);
			this.hasSentHelo_ = true;
		}

		return this.sendHeloPromise_;
	}

	get receiveHeloPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.receiveHeloPromise_) {
			this.receiveHeloPromise_ = new Promise((resolve, reject) => {
					this.bind_(HeloMessage).to((message, connection) => {
							this.heloHandler(message, connection);
						});
					this.receiveHeloPromiseResolve_ = resolve;
					this.receiveHeloPromiseReject_ = reject;
					this.receiveHeloTimeout_ = 
						this.managedTimeouts_.setTimeout(reject, 15000);
				}).then(() => {
					this.managedTimeouts_.clearTimeout(
						this.receiveHeloTimeout_);
					this.unbind_(HeloMessage);
				});
		}

		return this.receiveHeloPromise_;
	}

	heloHandler(message, connection) {
		/*
		 * Check that the signature and public key the peer 
		 * gave us were indeed signed by the same private 
		 * key that 'this' publicKey was signed with (aka 
		 * the ring private).
		 */
		const peerAddress = message.publicAddress;
		const peerPublicKeyBuffer = Buffer.from(message.publicKey, 'utf8');
		const peerSignature = Buffer.from(message.signature, 'hex');
		const peerRsaKeyPair = 
			new RSAKeyPair({ publicKeyBuffer: peerPublicKeyBuffer });

		if(!peerRsaKeyPair || !peerSignature) {
			return this.receiveHeloPromiseReject_(new Error(
				`Message did not contain credentials!`));
		}

		const ownSignatureHex = this.credentials_.signature.toString('hex');
		const remoteSignatureHex = peerSignature.toString('hex');

		if(ownSignatureHex === remoteSignatureHex) {
			return this.receiveHeloPromiseReject_(new Error(
				`Received signature matching own signature from peer. ` + 
				`Closing connection so as to prevent potential connection to ` +
				` self.\n` +
					`\tLocal: ${ownSignatureHex}\n` +
					`\tRemote: ${remoteSignatureHex}`));
		}

		if(typeof this.signatureValidator_ === 'function') {
			try {
				const isValid = this.signatureValidator_(remoteSignatureHex);
				if(!isValid) {
					return this.receiveHeloPromiseReject_(
						new Error(`Failed to validate remote signature: ` + 
							`${remoteSignature}`))
				}
			} catch(e) {
				return this.receiveHeloPromiseReject_(e);
			}
		}

		try {
			if(!this.ringRsaKeyPair_.verify(message.publicKey, peerSignature)) {
				throw new Error(`Key not signed by same ring private.`);
			}
		} catch(e) {
			return this.receiveHeloPromiseReject_(e);
		}

		this.logger_.log(
			`Remote peer\n` +
				`\t-> Address: ` +
				`${peerAddress}\n` +
				`\t-> Signature (last 16 bytes): ` + 
				`${remoteSignatureHex.slice(-32)}\n` +
				`\t-> Public key: ` +
				`${peerRsaKeyPair.public.toString('utf8')}`);

		this.peerAddress_ = peerAddress;
		this.remoteCredentials_ = {
			rsaKeyPair: peerRsaKeyPair,
			signature: peerSignature
		};

		this.receiveHeloPromiseResolve_();
	};

	get heloPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.heloPromise_) {
			this.heloPromise_ = Promise.all([
					this.sendHeloPromise,
					this.receiveHeloPromise
				]);
		}

		return this.heloPromise_;
	}

	get sendSetupCipherPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.hasSentSetupCipher_) {
			const encytedIv = 
				this.remoteCredentials_.rsaKeyPair.encrypt(this.cipher_.iv)
					.toString('base64');
			const encryptedKey = 
				this.remoteCredentials_.rsaKeyPair.encrypt(this.cipher_.key)
					.toString('base64');
			let setupCipherMessage = new SetupCipherMessage({
				iv: encytedIv,
				key: encryptedKey,
			});
			setupCipherMessage.header = {
				signature: (this.credentials_.rsaKeyPair.sign(
					JSON.stringify(setupCipherMessage.body)))
						.toString('base64')
			};

			this.sendSetupCipherPromise_ = this.send(setupCipherMessage);
			this.hasSentSetupCipher_ = true;
		}

		return this.sendSetupCipherPromise_;
	}

	get receiveSetupCipherPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.receiveSetupCipherPromise_) {
			this.receiveSetupCipherPromise_ = new Promise((resolve, reject) => {
					this.bind_(SetupCipherMessage).to((message, connection) => {
							this.setupCipherHandler(message, connection);
						});
					this.setupCipherPromiseResolve_ = resolve;
					this.setupCipherPromiseReject_ = reject;
					this.receiveSetupCipherTimeout_ = 
						this.managedTimeouts_.setTimeout(reject, 15000);
				}).then(() => {
					this.managedTimeouts_.clearTimeout(
						this.receiveSetupCipherTimeout_);
					this.unbind_(SetupCipherMessage);
				});
		}

		return this.receiveSetupCipherPromise_;
	}

	setupCipherHandler(message, connection) {
		try {
			const iv = this.credentials_.rsaKeyPair.decrypt(
				Buffer.from(message.iv, 'base64'));
			const key = this.credentials_.rsaKeyPair.decrypt(
				Buffer.from(message.key, 'base64'));
			connection.remoteCipher_ = { iv, key };
		} catch(e) {
			return this.setupCipherPromiseReject_(new Error(
				`Could not decrypt encryption properties from SetupCipher ` +
				`message!`));
		}

		return this.setupCipherPromiseResolve_();
	}

	get setupCipherPromise() {
		if(!this.isConnected) {
			return Promise.reject(new Error(`Connection not open!`));
		}

		if(!this.setupCipherPromise_) {
			this.setupCipherPromise_ = Promise.all([
					this.sendSetupCipherPromise,
					this.receiveSetupCipherPromise
				]);
		}

		return this.setupCipherPromise_;
	}

	get address() {
		return this.address_;
	}
	get peerAddress() {
		if(!this.peerAddress_) {
			return `${this.connection_._socket.remoteAddress}:` + 
				`${this.connection_._socket.remotePort}`;
		}
		return this.peerAddress_;
	}

	get created() { return this.created_ };
	get on() { return this.connection_.on; }
	get isConnected() { return this.isConnected_; }
	get isConnecting() { return this.isConnecting_; }
	get isTrusted() { return this.isTrusted_; }
	get signature() { return this.credentials_.signature.toString('hex'); }
	get remotePublicKey() { return this.remotePublicKey_; }
	set remotePublicKey(value) { this.remotePublicKey_ = value; }
	get remoteSignature() { return this.remoteCredentials_.signature; }
	set remoteSignature(value) { this.remoteCredentials_.signature = value; }
}

module.exports = Client;

