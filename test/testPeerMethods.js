"use strict";

const test = require('tape');

const { Peer, Message } = require('../index.js');

// Create peer1, the first peer, which will listen on port 26780
let peer = new Peer({
  'port': 9999,
  'signature': "first.peer.signature",
  'publicKey': "first.peer.pub",
  'privateKey': "first.peer.pem",
  'ringPublicKey': ".ring.pub",
  'debug': false
});

const waitForDiscoveredEvent = () => {
	return ;
};

test("PeerTest", async (assert) => {
	const assertThrows = (fn, args, msg) => {
		let errorWasThrown = false;

		try {
			fn.apply(null, args);
		} catch(e) {
			errorWasThrown = true;
		}

		assert.true(errorWasThrown, msg);
	};

	assertThrows(peer.createHttpServer, [], 
		`Attempting to create a HttpServer without credentials should throw.`);

	assertThrows(peer.enqueueDiscoveryAddress, [], 
		`Attempting to enqueue an invalid address for discovery should throw.`);

	peer.range = null;
	peer.discoveryAddresses = [{ address: '127.0.0.1' }];
	let lastAddress = null;

	peer.attemptConnection = (address) => {
		lastAddress = address;
		return Promise.resolve();
	};

	const discoveryPromise = new Promise((resolve) => {
		peer.on('discovered', resolve);
	});

	peer.discover();

	await discoveryPromise;

	console.log(lastAddress);

	assert.equals(lastAddress.slice(-4), peer.port.toString(), 
		`Discovering of address without a port should assign the discovery ` + 
		`address a port the same as the peer's.`);

	assert.equals(lastAddress.slice(0, 6), 'wss://', 
		`Discovering of address without a protocol should assign the WebSocket ` + 
		`protocol string.`);

	peer.close();
	assert.end();
});