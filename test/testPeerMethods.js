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

	assertThrows(peer.broadcastTo, [], `Attempting to call broadcastTo ` + 
		`without connection or message should throw`);

	const testHeloMessage = new Message({ type: 'bleh' });
	let testConnection = { connected: false };

	assertThrows(peer.broadcastTo, [testConnection, testHeloMessage], 
		`Attempting to broadcast to not opened connection should throw.`);

	testConnection = { connected: true, trusted: false };

	assertThrows(peer.broadcastTo, [testConnection, testHeloMessage], 
		`Attempting to call broadcastTo on untrusted connection and ` + 
		`without message being helo should throw.`);

	testConnection = null;

	peer.setupConnection({ connection: testConnection });
	assert.equals(testConnection, null, `Attempting to set up a null ` + 
		`connection should early return.`);

	testConnection = {
		_socket: { remotePort: 1337 },
		on: function(event, callback) {},
		send: function() {}
	};
	let testRequest = {
		httpRequest: {
			headers: {
				'x-forwarded-for': 'boop'
			}
		}
	};

	peer.setupConnection({ connection: testConnection, request: testRequest });
	assert.equals(testConnection.originalAddress, 'boop', `Setting up ` + 
		`connection with request containing 'x-forwarded-for' header should ` + 
		`set the connection 'originalAddress' property.`);

	testRequest = {
		connection: {
			remoteAddress: 'boop'
		}
	};

	peer.setupConnection({ connection: testConnection, request: testRequest });
	assert.equals(testConnection.originalAddress, 'boop', `Setting up ` + 
		`connection with request containing connection with 'remoteAddress' ` + 
		`property should set the connection 'originalAddress' property.`);

	peer.close();
	assert.end();
});