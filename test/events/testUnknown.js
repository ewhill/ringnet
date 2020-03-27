"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');
const crypto = require('crypto');

const { Message } = require('../../index.js');
const onUnknown = require('../../lib/src/events/unknown');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("EventsOnUnknown", (assert) => {
	let broadcastWasCalled = false;
	let testMessageHeaderType = "Cu570mF1773d";
	let testMessageBody = 
		Buffer.from("{\"test\":\"testing!\"}", 'utf8').toString('base64');

	let testConnection = {
		peerRSAKeyPair: {},
	};

	let testMessage = {
		header: {
			hash: "1234567890",
			signature: Buffer.from("asdasdasd", 'utf8').toString('base64'),
			timestamp: "blah",
			type: testMessageHeaderType,
		},
		body: testMessageBody
	};

	let testPeer = {
		eventEmitter_: {
			emit: (type, { message, connection }) => {
				assert.equals(JSON.stringify(message), JSON.stringify(testMessage), 
					"Emitted message and message from unknown event should be " +
					"identical.");

				if(type == testMessageHeaderType) {
					assert.ok(true, "Unknown message header with string message " + 
						"type should emit custom event.");
				} else if(type == "message") {
					assert.ok(true, "Unknown message header with unkown message " + 
						"type should emit 'message' event.");
				}
			}
		}
	};

	crypto.createDecipheriv = () => {
		let bufferData = null;

		return {
			final: () => bufferData.slice(-5),
			update: (b) => {
				bufferData = b;
				return bufferData.slice(0, bufferData.length - 5);
			}
		};
	};

	testConnection.peerRSAKeyPair.verify = () => { throw new Error("test!"); };
	onUnknown.apply(testPeer, [{ message: testMessage, 
		connection: testConnection}]);

	testConnection.peerRSAKeyPair.verify = () => false;
	onUnknown.apply(testPeer, [{ message: testMessage, 
		connection: testConnection}]);

	testConnection.peerRSAKeyPair.verify = () => true;
	onUnknown.apply(testPeer, [{ message: testMessage, 
		connection: testConnection}]);

	testMessage.body = testMessageBody;
	testMessage.header.type = false;
	onUnknown.apply(testPeer, [{ message: testMessage, 
		connection: testConnection}]);

	assert.end();
});