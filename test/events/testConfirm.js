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

	let toBeConfirmed = {
		header: {
			hash: "abcdefghijklmnopqrstuvwxyz",
			timestamp: testDate
		}
	};

	let testConnection = {
		unconfirmedMessages: [ toBeConfirmed ],
		confirmedMessages: []
	};

	onConfirm.apply(testPeer, [{ connection: testConnection, 
		message: testBadMessage }]);

	assert.equal(testConnection.unconfirmedMessages.length, 1, 
		"connection.unconfirmedMessages should not be affected " + 
		"when passed invalid confirmation message.");

	assert.equal(testConnection.confirmedMessages.length, 0, 
		"connection.confirmedMessages should not be affected " + 
		"when passed invalid confirmation message.");

	onConfirm.apply(testPeer, [{ connection: testConnection, 
		message: testGoodMessage }]);

	assert.equal(testConnection.unconfirmedMessages.length, 0, 
		"connection.unconfirmedMessages should be empty when " + 
		"onConfirm is passed valid confirmation message.");

	assert.equal(testConnection.confirmedMessages.length, 1, 
		"connection.confirmedMessages should have length == 1.");

	assert.equal(
		JSON.stringify(testConnection.confirmedMessages[0]), 
		JSON.stringify(toBeConfirmed), 
		"connection.confirmedMessages should contain the " + 
		"confirmed message.");

	assert.end();
});