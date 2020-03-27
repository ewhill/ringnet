"use strict";
const test = require('tape');

const ManagedTimeouts = require('../lib/src/managedTimeouts.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

const sleep = (ms) => {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

test("ManagedTimeouts", async (assert) => {
	let threshold = 10;
	let elapsed = -1;
	let startTimeMs = -1;

	const startTimer = () => {
		startTimeMs = Date.now();
	};

	const endTimer = () => {
		elapsed = Date.now() - startTimeMs;
	};

	let managedTimeouts = new ManagedTimeouts();

	startTimer();
	managedTimeouts.setTimeout(endTimer);
	await sleep(threshold);
	assert.true(elapsed < threshold, 
		`Timeout without delay set should default delay to 0.`);

	startTimer();
	managedTimeouts.setTimeout(endTimer, 's');
	await sleep(threshold);
	assert.true(elapsed < threshold, 
		`Timeout with invalid delay type set should default delay to 0.`);

	const delayToTest = 200;
	startTimer();
	managedTimeouts.setTimeout(endTimer, delayToTest);
	await sleep(delayToTest + threshold);
	const isWithinThreshold = 
		elapsed > delayToTest - threshold && elapsed < (delayToTest + threshold);
	assert.true(isWithinThreshold, 
		`Timeout should call function after given delay.`);

	const id = managedTimeouts.setTimeout(()=>{}, delayToTest);
	const timeoutWithIdExists = 
		managedTimeouts.timeouts.hasOwnProperty(id);
	assert.true(timeoutWithIdExists, 
		`Timeout should return id of created timeout`);

	managedTimeouts.clearTimeout(id);
	const timeoutWithIdErased = 
		managedTimeouts.timeouts.hasOwnProperty(id) === false;
	assert.true(timeoutWithIdErased, 
		`Clearing timeout should remove timeout from record.`);

	managedTimeouts.setTimeout(()=>{}, delayToTest);
	managedTimeouts.setTimeout(()=>{}, delayToTest);
	managedTimeouts.setTimeout(()=>{}, delayToTest);
	managedTimeouts.setTimeout(()=>{}, delayToTest);
	managedTimeouts.clearAll();
	const isEmpty = Object.keys(managedTimeouts.timeouts).length === 0;
	assert.true(isEmpty, 
		'Clearing all timeouts should remove all timeouts from record.');

	managedTimeouts.destroy();
	const idAfterDestroy = managedTimeouts.setTimeout(()=>{}, 1);
	const returnValueIsNull = idAfterDestroy === null;
	assert.true(returnValueIsNull, 
		'Attempting to set timeout after destroy has been called ' + 
		'should return null id.');


	assert.end();
});