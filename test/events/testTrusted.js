"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');

const onTrusted = require('../../lib/src/events/trusted');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("EventsOnTrusted", (assert) => {
	let didDiscover = false;
	let connectionWasEmitted = false;
	let parsedAddresses = [];

	let testInvalidAddress = 7;
	let testValidAddress = "testAddress";
	let testInvalidPort = "a1b2c3";
	let testValidPort = 1234;

	let testPeer = {
		isDebugEnabled_: false,
		discover: () => {
			didDiscover = true;
		},
		discoveryAddresses_: [],
		parseDiscoveryAddresses: (obj) => {
			parsedAddresses.push(obj);
		},
		peerRSAKeyPair_: {},
		reservedEventHandlers_: {
			connection: () => {
				connectionWasEmitted = true;
			}
		},
		inDiscoveryAddresses: () => false,
		isConnectedTo: () => false,
		isOwnSignature: () => false,
		untrustedConnections_: {}
	};

	let testConnection = {};

	let testMessage = {
		body: {
			iv: "testing".toString('base64'),
			key: "123!".toString('base64'),
			listening: {}
		}
	};

	testPeer.peerRSAKeyPair_.decrypt = () => { throw new Error("test!"); };

	let invalidIvKeyResult = onTrusted.apply(testPeer, 
		[{ message: testMessage, connection: testConnection }]);

	assert.notOk(invalidIvKeyResult, "When message body IV/Key " +
		"decrypt fails handler exits gracefully.");

	testPeer.peerRSAKeyPair_.decrypt = (data) => data;

	testMessage.body.listening.address = testValidAddress;
	testMessage.body.listening.port = testValidPort.toString();

	onTrusted.apply(testPeer, [{ message: testMessage, 
		connection: testConnection }]);

	assert.ok(connectionWasEmitted, "When body has correct content " + 
		"a 'connection' event should be emitted.");

	assert.equal(testConnection.originalPort, testValidPort, "Message " + 
		"containing listening port should be correctly parsed from " +
		"string.");

	assert.equal(testConnection.originalAddress, testValidAddress, 
		"Message containing listening address with type string " + 
		"should set the connection originalAddress to same value.");

	testConnection.originalAddress = null;
	testConnection.originalPort = null;
	testMessage.body.listening.address = testInvalidAddress;
	testMessage.body.listening.port = testInvalidPort;
	testMessage.body.peers = [{ address: "::ffff:123.123.123.123" }];

	onTrusted.apply(testPeer, [{ message: testMessage, 
		connection: testConnection }]);

	assert.equal(testConnection.originalPort, null, 
		"Message containing listening port with unparseable value " +
		"should NOT set originalPort.");

	assert.equal(testConnection.originalAddress, null, 
		"Message containing listening address with type other than " + 
		"string value should NOT set originalAddress.");

	assert.equal(parsedAddresses.length, 1, "Message " + 
		"with valid peers property should result in peer adding " + 
		"message peers to discoveryAddresses.");

	assert.equal(JSON.stringify(parsedAddresses[0]), 
		JSON.stringify(testMessage.body.peers), 
		"Message with valid peers property should result in peer " + 
		"adding message peers to discoveryAddresses.");

	assert.end();
});