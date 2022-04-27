"use strict";

const EventEmitter = require('events');
const https = require('https');
const WebSocket = require('ws');
const url = require('url');

const ManagedTimeouts = require('./ManagedTimeouts');
const { checkFiles,
		parseUrl,
		readFileAsync,
		getXForwardedFor } = require('./utils');

const WebSocketClient 	= WebSocket;
const WebSocketServer 	= WebSocket.Server;

const HTTPS_SERVER_MODES = {
	CREATE: 0,
	NONE: 1,
	PASS: 2,
};

class Server extends EventEmitter {
	constructor({
		httpsServerConfig = {},
		wsServerConfig = {},
		publicAddress,
		logger = console,
	}) {
		super();
		const {
				mode = HTTPS_SERVER_MODES.CREATE,
				server,
				credentials = {
					key: 'https.key.pem',
					cert: 'https.cert.pem'
				},
				port = 26780,
			} = httpsServerConfig;

		this.httpsServerMode_ = mode;

		this.managedTimeouts_ = new ManagedTimeouts();
		this.httpsServer_ = server;
		this.httpsServerCredentials_ = credentials;
		this.httpsServerPort_ = port;
		this.publicAddress_ = publicAddress;
		this.wsServer_ = undefined;
		this.wsServerConfig_ = wsServerConfig;
		this.logger_ = logger;

		if(typeof this.httpsServerMode_ !== 'number') {
			throw new Error(`No 'httpsServerMode' given!`);
		}

		if(this.httpsServerMode_ === HTTPS_SERVER_MODES.CREATE) {
			if(!this.httpsServerCredentials_) {
				throw new Error(
					`Server mode set to 'CREATE' but no credentials given!`);
			}

			if(typeof this.httpsServerCredentials_.cert !== 'string') {
				throw new Error(
					`Invalid 'cert' given for https server credentials.`);
			}

			if(typeof this.httpsServerCredentials_.key !== 'string') {
				throw new Error(
					`Invalid 'key' given for https server credentials.`);
			}
		} else if(this.httpsServerMode_ === HTTPS_SERVER_MODES.PASS) {
			if(!this.httpsServer_) {
				throw new Error(
					`Server mode set to 'PASS' but no server given!`);
			}
		}
	}

	start() {
		return this.getPublicAddress()
			.catch(err => {
				this.logger_.warn(err.message);
			})
			.then(() => {
				return this.initHTTPServer();
			})
			.then(() => {
				return this.initWsServer();
			});
	}

	getPublicAddress() {
		if(typeof this.publicAddress_ === 'string') {
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
				let address = null;
				const timeout = this.managedTimeouts_.setTimeout(reject, 30000);
				https.get({
						host: 'api.ipify.org',
						path: '/'
					}, (resp) => {
					  resp.on('data', (data='') => {
					  	if (!address) {
					  		address = data;
					  	} else {
					    	address += data;
					    }
					  });
					  resp.on('end', (data='') => {
					  	this.managedTimeouts_.clearTimeout(timeout);
					  	address += data;
					  	if(!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}/ig.test(address)) {
					  		return reject(new Error(
					  			`Invalid format for received public address!`));
					  	}
					  	this.publicAddress_ = address;
					  	return resolve();
					  })
					  resp.on('error', (err) => {
					  	this.managedTimeouts_.clearTimeout(timeout);
					  	return reject(err);
					  });
				});
			});
	}

	initHTTPServer() {
		if(this.httpsServerMode_ === HTTPS_SERVER_MODES.NONE) {
			this.wsServerConfig_.noServer = true;
			return Promise.resolve();
		} else {
			if(this.httpsServerMode_ === HTTPS_SERVER_MODES.CREATE) {
				return this.createHTTPServer()
					.then(() => {
						this.wsServerConfig_.server = this.httpsServer_;
						return this.startHTTPServer();
					});
			} else if(this.httpsServerMode_ === HTTPS_SERVER_MODES.PASS) {
				if(!this.wsServerConfig_.hasOwnProperty('server') && 
				   !this.wsServerConfig_.noServer) {
						this.wsServerConfig_.server = this.httpsServer_;
				}
				return this.startHTTPServer();
			}
		}
	}

	initWsServer() {
		this.wsServer_ = new WebSocketServer(this.wsServerConfig_);

		this.wsServer_.on('connection', (connection, request) => {
			this.onWebSocketConnection.apply(this, [connection, request]);
		});

		if(this.httpsServerMode_ === HTTPS_SERVER_MODES.CREATE) {
			this.logger_.log(`WebSocket server is now listening on port ` + 
				`${this.wsServer_.address().port}`);
		}
	}

	/**
	 * The handler called when the WebSocketServer receives a new connection.
	 * 
	 * @param  {WebSocketClient} connection 
	 *         The remote connection.
	 * @param  {Object} request 
	 *         The HTTP request object made to establish the WebSocket 
	 *         connection.
	 */
	onWebSocketConnection(connection, request) {
		this.logger_.log(`New WebSocket server connection...`);
		this.logger_.log(
			`\tremoteAddress = ${request.connection.remoteAddress}`);
		this.logger_.log(
			`\tx-forwarded-for = ${getXForwardedFor(request)}`);

		this.emit('wsConnection', { connection, request });
	}

	createHTTPServer() {
		const serverChecks = [{
				description: "HTTPS Server Key",
				location:  this.httpsServerCredentials_.hasOwnProperty("key") ? 
					this.httpsServerCredentials_.key : "https.key.pem"
			}, {
				description: "HTTPS Server Certificate",
				location: this.httpsServerCredentials_.hasOwnProperty("cert") ? 
					this.httpsServerCredentials_.cert : "https.cert.pem"
			}];

		return checkFiles(serverChecks, this.logger_)
			.then(() => {
				this.httpsCertLocation_ = this.httpsServerCredentials_.cert;
				this.httpsKey_Location_ = this.httpsServerCredentials_.key;

				return Promise.all([
					readFileAsync(this.httpsCertLocation_),
					readFileAsync(this.httpsKey_Location_)
				]);
		    })
			.then(results => {
				[ this.httpsCert_, this.httpsKey_ ] = results;

				const credentialsObject = {
					'cert': this.httpsCert_,
					'key': this.httpsKey_
				};

				this.httpsServer_ = 
					https.createServer(credentialsObject, 
						(request, response) => {
							response.end();
						});
	      });
	}

	startHTTPServer() {
		if(!this.httpsServer_ || 
			typeof this.httpsServer_.address !== 'function') {
				return Promise.reject(new Error(`HTTP server is not defined!`));
		}

		// Null address means the server hasn't been started, so start it.
		if(this.httpsServer_.address() === null) {
			return new Promise((resolve, reject) => {
					this.httpsServer_.on('error', (e) => {
							return reject(e);
						});

					this.httpsServer_.on('listening', () => {
							this.logger_.log(
								`HTTP server is now listening on port ` + 
								`${this.httpsServer_.address().port}`);
							return resolve(this.httpsServerPort_);
						});

					this.httpsServer_.listen(this.httpsServerPort_);
				});
		} else {
			this.httpsServerPort_ = this.httpsServer_.address().port;
			return Promise.resolve(this.httpsServerPort_);
		}
	}

	close() {
		this.managedTimeouts_.destroy();

		if(this.wsServer_) {
			this.wsServer_.close();
	    }

	    if(this.httpsServerMode_ === HTTPS_SERVER_MODES.CREATE && 
	    	this.httpsServer_) {
	    		this.httpsServer_.close();
	    }
	}

	get publicAddress() {
		let address = parseUrl(this.publicAddress_);
		if(!address.port) {
			const port = this.wsPort || this.port;
			if(!!port) {
				return url.format({ ...address, port});
			}
		}
		return url.format(address);
	}

	get wsPort() {
		if(this.httpsServerMode_ !== HTTPS_SERVER_MODES.CREATE) {
			return null;
		}
		this.wsServer_.address().port;
	}

	get port() {
		return this.httpsServerPort_;
	}

	get wsServer() {
		return this.wsServer_;
	}

	get httpsConfig() {
		return {
			mode: this.httpsServerMode_,
			credentials: {
				key: this.httpsServerCredentials_.key,
				cert: this.httpsServerCredentials_.cert,
			},
			port: this.httpsServerPort_,
		};
	}

	get wsConfig() {
		let adjustedConfig = { ...this.wsServerConfig_ };
		delete adjustedConfig.server;
		return adjustedConfig;
	}

	static get MODES() {
		return HTTPS_SERVER_MODES;
	}
}

module.exports = Server;