"use strict";

const test = require('tape');
const { Peer, Message } = require('../index.js');

class PingMessage extends Message {
	constructor() {
		super();
		this.body = 'ping';
	}
}

class PongMessage extends Message {
	constructor() {
		super();
		this.body = 'pong';
	}
}

const PingMessageHandler = (message, connection, logger=console) => {
	// Send 'pong' in reply...
	const pong = new PongMessage();
	connection.send(pong);
};

const PongMessageHandler = (message, connection, logger=console) => {
	// Noop
};


test("PeerBYOHTTPSServerTest", async (assert) => {
	const sink = () => {};
	const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

	const peer1 = new Peer({
		httpsServerConfig: {
			credentials: {
				key: "https.key.pem",
				cert: "https.cert.pem"
			},
			port: 26780,
		},
		privateKeyPath: "first.peer.pem",
		publicKeyPath: "first.peer.pub",
		signaturePath: "first.peer.signature",
		ringPublicKeyPath: ".ring.pub",
		logger: fakeLogger,
	});

	const peer2 = new Peer({
		httpsServerConfig: {
			credentials: {
				key: "https.key.pem",
				cert: "https.cert.pem"
			},
			port: 26781,
		},
		privateKeyPath: "second.peer.pem",
		publicKeyPath: "second.peer.pub",
		signaturePath: "second.peer.signature",
		ringPublicKeyPath: ".ring.pub",
		discoveryConfig: {
			addresses: [ "127.0.0.1:26780" ]
		},
		logger: fakeLogger,
	});

	await peer1.init();
	await peer2.init();
	await peer1.discover();
	await peer2.discover();

	peer2.bind(PingMessage).to(PingMessageHandler);
	peer1.bind(PongMessage).to(async function() {
		PongMessageHandler.apply(null, arguments);
		await peer1.close();
		await peer2.close();

		assert.pass('Peers can communicate properly.');
		assert.end();
	});

	await peer1.broadcast(new PingMessage());
});

