"use strict";

const test = require('tape');

const { Peer, Message } = require('../index.js');

test("PeerTest", async (assert) => {
	// Create peer1, the first peer, which will listen on port 26780
	let peer = new Peer({
	  port: 9999,
	  signature: "first.peer.signature",
	  publicKey: "first.peer.pub",
	  privateKey: "first.peer.pem",
	  ringPublicKey: ".ring.pub"
	});

	const assertThrows = async (fn, thisArg, args, msg) => {
		let didThrow = false;

		try {
			await fn.apply(thisArg, args);
		} catch(e) {
			didThrow = true;
		}

		assert.true(didThrow, msg);
	};

	await peer.init();

	let lastAddress = null;
	peer.attemptConnection = (originalAddress, parsedAddress) => {
		lastAddress = originalAddress;
		return Promise.resolve();
	};

	peer.range_ = null;
	peer.discoveryAddresses_ = [{ address: '127.0.0.1' }];

	await peer.discover();

	assert.equals(lastAddress.slice(-4), peer.port_.toString(), 
		`Discovering of address without a port should assign the discovery ` + 
		`address a port the same as the peer's.`);

	assert.equals(lastAddress.slice(0, 6), 'wss://', 
		`Discovering of address without a protocol should assign the WebSocket ` + 
		`protocol string.`);

	const testPeerSignature = 'aaa';
	const testPeerConnection = {
		signature: testPeerSignature.toString('hex'),
		peerPublicKeySignature: testPeerSignature
	};
	const testPeer = { connection: testPeerConnection };
	peer.peers_ = 
		[{ ...testPeer }];

	assert.true(peer.isConnectedTo(testPeerConnection), 
		`Properly reports if peer is connected to another peer.`);

	await assertThrows(peer.discoverPeer, peer, [testPeer], 
		`Attempting to discover on peer to which this peer has already ` + 
		`connected should throw.`);

	const testPeerSignatureBuffer = Buffer.from(testPeerSignature, 'utf8');
	peer.signature_ = testPeerSignatureBuffer;
	assert.true(peer.isOwnSignature(testPeerSignatureBuffer), 
		`Properly reports if given signature is equal to peer's own.`);

	peer.peers_ = [];
	await assertThrows(peer.discoverPeer, peer, [testPeer], 
		`Attempting to discover on peer to which has signature equal ` + 
		`to this peer's signature should throw.`);
	
	await assertThrows(peer.createHttpServer, peer, [], 
		`Attempting to create a HttpServer without credentials should throw.`);

	await assertThrows(peer.enqueueDiscoveryAddress, peer, [], 
		`Attempting to enqueue an invalid address for discovery should throw.`);

	await assertThrows(peer.broadcastTo, peer, [], `Attempting to call broadcastTo ` + 
		`without connection or message should throw`);

	const testHeloMessage = new Message({ type: 'bleh' });
	let testConnection = { connected: false };

	await assertThrows(peer.broadcastTo, peer, [testConnection, testHeloMessage], 
		`Attempting to broadcast to not opened connection should throw.`);

	testConnection = { connected: true, trusted: false };

	await assertThrows(peer.broadcastTo, peer, [testConnection, testHeloMessage], 
		`Attempting to call broadcastTo on untrusted connection and ` + 
		`without message being helo should throw.`);

	testConnection = null;

	peer.setupConnection({ connection: testConnection });
	assert.equals(testConnection, null, `Attempting to set up a null ` + 
		`connection should early return.`);

	testConnection = {
		_socket: { remotePort: 1337 },
		connected: true,
		on: function(event, callback) {},
		send: function() {},
		close: ()=>{}
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
		},
		close: ()=>{}
	};

	peer.setupConnection({ connection: testConnection, request: testRequest });
	assert.equals(testConnection.originalAddress, 'boop', `Setting up ` + 
		`connection with request containing connection with 'remoteAddress' ` + 
		`property should set the connection 'originalAddress' property.`);

	await peer.close();
	assert.end();
});