"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');

const onPeers = require('../../lib/src/events/peers');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("EventsOnPeers", (assert) => {
	let testPeerList = [ "a", "b", "c" ];
	let times = 0;

	let testPeer = {
		debug: false,
		getPeerList: () => testPeerList,
		peerRSAKeyPair: {
			sign: (s) => s.split("").reverse().join("")
		},
		managedTimeouts: {
			setTimeout: (f, d) => f()
		}
	};

	let onConnectionSend = (m, c) => {
		m = JSON.parse(m);

		++times;

		if(times === 1) {
			assert.equal(m.header.signature, "}]\"c\",\"b\",\"a\"[:\"sreep\"{", 
				"Header should have correct signature.");
			assert.equal(JSON.stringify(m.body), 
				JSON.stringify({ peers: testPeerList }),
				"Body should have correct content.");

			//assert.equal(m, )
			c(new Error("test1!"));
		} else if(times === 2) {
			assert.ok(true, "connection.send failure should result in resend " +
				"at a backoff timeout.");
			c(new Error("test2!"));
		} else if(times === 3) {
			assert.ok(true, "connection.send failure should result in resend " +
				"at a backoff timeout.");
			c();
			assert.end();
		}
	};

	let testConnection = {
		send: (m, c) => onConnectionSend(m, c)
	};

	onPeers.apply(testPeer, [{ connection: testConnection }]);
});