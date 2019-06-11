"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');

const onConfirm = require('../../lib/src/events/confirm');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("EventsOnConfirm", (assert) => {
	let testDate = new Date(Date.now());
	let testDateString = testDate.toISOString();

	let testPeer = {
		debug: false,
		requireConfirmation: true
	};

	let testBadMessage = {
		header: {
			confirm: {
				hash: "aaaaaaaaaaaaaaaaaaaaaaaaaa",
				timestamp: testDateString
			}
		}
	};

	let testGoodMessage = {
		header: {
			confirm: {
				hash: "abcdefghijklmnopqrstuvwxyz",
				timestamp: testDateString
			}
		}
	};

	let testConnection = {
		unconfirmedMessages: [ {
			header: {
				hash: "abcdefghijklmnopqrstuvwxyz",
				timestamp: testDate
			}
		} ]
	};

	onConfirm.apply(testPeer, [{ connection: testConnection, 
		message: testBadMessage }]);

	assert.equal(testConnection.unconfirmedMessages.length, 1, 
		"connection.unconfirmedMessages should not be affected " + 
		"when passed invalid confirmation message.");

	onConfirm.apply(testPeer, [{ connection: testConnection, 
		message: testGoodMessage }]);

	assert.equal(testConnection.unconfirmedMessages.length, 0, 
		"connection.unconfirmedMessages should be empty when " + 
		"onConfirm is passed valid confirmation message.");

	assert.end();
});