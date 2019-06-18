"use strict";
const fs = require('fs');
const NodeRSA = require('node-rsa');
const test = require('tape');

const Message = require('../../lib/src/message.js');
const onHelo = require('../../lib/src/events/helo');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

test("EventsOnHelo", (assert) => {
	let testPrivateKey = Buffer.from("LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQp" + 
		"NSUlKS0FJQkFBS0NBZ0VBeGlWNUtDWDJrV0p3SDRXVEF2TmNkS0xJS3p2VnNoYTdEcEo1VlN" + 
		"McVpUd3k1bEZMCi85aVFpY1hlUjZ6VkFqVndOcjZYNVFya0JYSDVrUjQrVmY5K0lRZHVvcG0" +
		"2RzhZcUU0MS9IYXRpVWdlRXd5UUoKRll4UWp2MEJEdWxLUGFrYTRpVHZtc0QzU2hacE8xY2J" +
		"oZ0k2eDI0VWxiLzhDdXFROHpXai9DdExGbjZYS2xDWgpOOFBydTFQeFVGd29Dd1ZoS24wSWV" +
		"OemxLb2tvYWw3U2VPa1oyKysyY0E5elRJaFZJczZ0V3FIKzRaZ3ZpbU1ICnJ0TG9RUUhTRWI" +
		"wK3AzOTk2K0lZUy82SVg5YXZyQnJVbFBLeGgwR2dwc1pzdkZ5MncxNFhqeTlSR3BvcFI5aSs" +
		"KMi84bFBRQWgzSXNhV0ZDSm85dXg3a0lqcFdsTTRuN1lVWmEvYzQ4V3RHNjZLbjhNMk1kTkx" +
		"EUVF5MjRPSGxnSgpMclZKQjFGOEw2Qzg2NzB5MGh1bWhMRGoySnhSejJERzlGVm5xL1BKUE9" +
		"FbkwxcjNrVCs4aHVCbGVNU3FyTXJGCmZHNFhtOGYyTDJFUG9nUkRvSVNHUzFnN3lrb0tjWHB" +
		"pQUt1TVk5dzVWdEZNN1hTejhlK3hWeW5MVXpwVXFXVkMKbUZsTndqOTJrRlRuNXFLRkdHZmp" +
		"OMk1rcVJiMTg3R2d4MUhJbytvVXZMVmJVeG14cCtlZGNjbnM0UlNwelJFdApPM1E0MTQ3b1V" +
		"CdWI4RUZBNUxBc2Z3TVpYeVNhSmpVamlvT3FHcXp2Si9CN09GdXU0eFNQT0MzT1F4bEVLTDB" +
		"uCnBIQUlRV0wzbThRUnZWL3lpYmJXdjJMVWxudzh0RXFRQytEOG5va1ltenUxRWtMWmdUYkF" +
		"IZkVpSTNzQ0F3RUEKQVFLQ0FnQW5INGNJa2xaWTVtTFZGbjZzZW5pcTN1ay9BQlYxa0Y5bXh" +
		"TMEh6bGtSbkExQXhKU0k4NjIyUmtkWgpSNXJYVU0zVFFWYWtkcjRIQlRZTm5UY1pxOVN2bU5" +
		"RVGJ0NzhWT2hCN0JKSlBXbXdZS09xRkJkbkZjbGlNanBmClExalJTKzV1OEhRT3prTUZjZDl" +
		"kUkJtL0gvbVRIdjBaaEVxenJSVHBzSkdzWEsvNnhRdjc0dVlkeUtWbTIzQXUKT2NQK1NSV2l" +
		"XZ1d1TjQ5WUVyVFVLOXpLMnR1c1BXeDhPOUM4TDc3L25HZEdHZTVGaE5MK05BZDBVVmhpWFl" +
		"Xbwowd0RuK1poWFZ0RU5VRGlGRTlLajNMaFVvSWJFK2dSS2FhdFdsY2ZRVTJlN2NkQkZ2R0t" +
		"pT1AyV1dvNXp1TzcyCnFOQ08xM2dWem04WGFCKzVyVXpzKzdhaWhXMVBmanVCMmFsZGlQeHZ" +
		"0MWdUNEd1VFBxVU9TZU9xTmhhMnF6ck0KQVppQUI5TDhRR1F0VkVESUhEUzJkOStwQTl5aGJ" +
		"FVWZZMnhBV2ZBUkZEbVlBMmhQa1RLSk5Dbko0T1Z2Z1RZawpTV1VaZ3UxRDJqa0UxVzczZWd" +
		"IN3ZLa0hNU0tCRTY0Wm9GUVgxclZGUDB5RG9xajROZGtFclF6eGZqb0tsT1M4CjFhdFA4MHR" +
		"aa3ZJL2huQjRaQXhEU3I5TW4wVlBOdG9rMGtmcFZaWWN0S2FVam41WnFmOWdla1hhQVRKeGh" +
		"IKzIKWWsreG9xUXVjVzZ6VHE3b0pDMW1vZkg0VUpyUWc3Y0VjekVidHdPS1BKRzZJb3dIdDV" +
		"xUVp3UmVlS0xSSG5XdQpiR3VzZENsRmdNZWdZblNzWEozZG9xd3ZSNUtXYWpEVHNka1BVYSt" +
		"yR2Q2OUZhenRJUUtDQVFFQS9tUEx3Ukp4ClNBbXhENXZkQ1NKYkxYYUdtTnQvWWlaWVVOeVh" +
		"BTlpmd2VjV2hoaHNIN0RIcUdjUGJ3RkdNeVR3bXF5YUhUL2EKaklyQy92V09hV3U0M2FaV1h" +
		"HSDNlTUYvWGtiaGg4V3IzbWp4c0Z6ZG5jMm1peE41bmpiNlA5SWpzTGlnNjkrTQpUUlBIT0V" +
		"jb2s4U0Q4dlhybnpJcldXTnN4WVB6VEgrRU1TeEhVTkhkNUoyVkF4RllQUEh5QS9sOCtXZ2h" +
		"TRGV6CmNKZVZDaW44WnBjbGxGUmJ1NGRackFGWm9xc1NwWFJGQ0I5SElTSm05NEtDRkZwUEd" +
		"QVVpTa2Rhdm5WQWdpV1AKYThPbHFkNHNxbVF4YWhYTnBKcXRRZ3Z6cGFrcitYYXF5a3VJWkp" +
		"UaURUSk1NVWJhTnhrVGlUc3AvR25kQzNqUwpnUzVkVEdUWnNPSTlGUUtDQVFFQXgyYUs0WUQ" +
		"ycCtYd3pYVnJmT3p4Q2hBRVZ4UDIwOTUwWjR4aHNwRDRZN0dUCnlybVYvSjlRb3ZJMjgzaVY" +
		"3WnFMc1ByYUpnbVoyUEVQRHZMaXJ0YU9HTlIrTHJTWGdIZmt1cHRWSTJrVlAwZlYKWUp1M3E" +
		"2TFRQelo2aWJIZmhlTXkxUVpzQkFTdWFlc2JxMjQ5S2NJNDhscjQyS0QwUWNPelJaTDhHdGZ" +
		"hVytwVAo3dDc0bnJ4SHFjTEFNWnJUSGRERHlBMG9XejJDSFIrNTNQMkdPUERBOUdkSE04Kzl" +
		"GU0JvK1IwaU13SUFlK0tHCkdsOWk0UXpnVTN1d2dXSHFBdlZkSHljMGl4dlZrUTBwOHBEeEo" +
		"vaWY1V3dVb291L3cvL0FPTWVuT1IxNENjbWkKRlB3ZnhDbnpPQ2xTNTFuUFd4OGNkUjJTc05" +
		"CZG5YSHBGbzVvZklLaVR3S0NBUUVBc3ZWUnFZbG4xOTI1aWRtRQpMYURWczYzbUVqS1g4bHc" +
		"zVk90WjcyVGdDSENoRDhTdWk3eTVPR2NJSEhjeEExbkJTWTZTL0hDbk5xZUhkZ1VaCkltQjl" +
		"0TEFIb1FYcUtqRTFnUVVzTTIrRDhQcXl5L2NJa0xMVHJwTU13NWk1ZzV3NUwyRXpFN3czM3l" +
		"GQ3pQeUMKTnpIUUFXT3ZWbGJjMkExeHY2R0x6dzBGMmZIa1daN0tFc0lveWZleHMyNGhhMXB" +
		"mNkxTd2RUVjZMb0wwZmluNwpQZENteHlweFBnT0J1ZGRaVDI0NXQ5dUxsS01zVHNyODFMSWp" +
		"BRjVudG83Mk02THUyMzF3M0IzQVAzZHJXNHpJCnJ6Vzg3WHhaSnFzSnA2VHd5bUd3WmRadFg" +
		"5S3pLTTcwRjRTQ3hVZXF5NGdBamxIb3Y0RloxM0F2NW1EUGthYUEKM2tiSjRRS0NBUUFSMWV" +
		"RNlEzVE1rODYwTWZxSlZCQkRYQ2RuT292cmE0eHg3cWFXZUUwZmJiVFFmMFVoTVliZQo3RmR" +
		"wODdGRmJYdHRPeUxrSUJ1NHdlY2M2VERKZnJ0N0VSYXdTc3I2WEw4Q3lmNFZpc0t4eEZVYnJ" +
		"SSUNzaSsvCkNicHdNbzdSeFA2NCt6Z1NLL0VGM0ZlL1A3OE15eWlZMVBaSk9peGU3WWhOZ3R" +
		"ZMStIUzVuLzRkOGFlL1d3djEKN1V1UHBFK1o3U0IxOW1kVHNlNi9lQ1VCMVZONktGNjUvYnJ" +
		"xc1h3eU5aSHVKbUwydVFrZUM2Yi9HT1VaU0RPUQpoQkhIb09Cem4wclRESWl3b0s2N3FMZkY" +
		"wSjBoZkNXaE9jZW11bVZPdk1PTzBKenVpT3BCeGQxUGp6V3dNQ2huCkw1c1F3b0cvbnNyRzF" +
		"2eFdBRzAvTmY4cFcxZVJPNFlWQW9JQkFBZ2VaR0x3UFhwZVRaQWl5ZCthay9pY2xxdXcKUFp" +
		"0TExMRERsdm94TFR6RUNwTEY2NXBmMDF3U2FwdmZtSGJFYWZLcEpuZDdmT09kZ0twWlZWcHB" +
		"ZM0hvRCswUgpiWGRBVFB1R1V4cXNiNlg2UUhPM3NiaE0vZnJ0a2YxaVp2MmRWNlJma2pHZHV" +
		"qOHVEVmh4YzVPR1IxWkpHYmlnClduSjhlZW9qQUV4ZUVrQmxudUZVZnhyMG9RNEsyWjlaRHh" +
		"1THlnU25hYTE1aHp6UHowMFBLWmVLN0pJZTNiWUEKK2ZlY0Fhd2lxSG5LeHFpeXRuYkpsU2o" +
		"zcVBrTFNIUSthU0ZMZjNVdDFqcml3ZVBmaDBGa1hIaTBPYU11a1hwUwpRZ1c3UVRkSjREZDY" +
		"4SlJON0lUL3doaEpiLzFHaVZhS0hoRFBjSlM5a2ZISzRNQ2VKUDM4clRQbjRqND0KLS0tLS1" +
		"FTkQgUlNBIFBSSVZBVEUgS0VZLS0tLS0K", 'base64');

	let testPublicKey = Buffer.from("LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQ0lq" + 
		"QU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FnOEFNSUlDQ2dLQ0FnRUF4aVY1S0NYMmtXSndINFdU" + 
		"QXZOYwpkS0xJS3p2VnNoYTdEcEo1VlNMcVpUd3k1bEZMLzlpUWljWGVSNnpWQWpWd05yNlg1" + 
		"UXJrQlhINWtSNCtWZjkrCklRZHVvcG02RzhZcUU0MS9IYXRpVWdlRXd5UUpGWXhRanYwQkR1" + 
		"bEtQYWthNGlUdm1zRDNTaFpwTzFjYmhnSTYKeDI0VWxiLzhDdXFROHpXai9DdExGbjZYS2xD" + 
		"Wk44UHJ1MVB4VUZ3b0N3VmhLbjBJZU56bEtva29hbDdTZU9rWgoyKysyY0E5elRJaFZJczZ0" + 
		"V3FIKzRaZ3ZpbU1IcnRMb1FRSFNFYjArcDM5OTYrSVlTLzZJWDlhdnJCclVsUEt4CmgwR2dw" + 
		"c1pzdkZ5MncxNFhqeTlSR3BvcFI5aSsyLzhsUFFBaDNJc2FXRkNKbzl1eDdrSWpwV2xNNG43" + 
		"WVVaYS8KYzQ4V3RHNjZLbjhNMk1kTkxEUVF5MjRPSGxnSkxyVkpCMUY4TDZDODY3MHkwaHVt" + 
		"aExEajJKeFJ6MkRHOUZWbgpxL1BKUE9FbkwxcjNrVCs4aHVCbGVNU3FyTXJGZkc0WG04ZjJM" + 
		"MkVQb2dSRG9JU0dTMWc3eWtvS2NYcGlBS3VNClk5dzVWdEZNN1hTejhlK3hWeW5MVXpwVXFX" + 
		"VkNtRmxOd2o5MmtGVG41cUtGR0dmak4yTWtxUmIxODdHZ3gxSEkKbytvVXZMVmJVeG14cCtl" + 
		"ZGNjbnM0UlNwelJFdE8zUTQxNDdvVUJ1YjhFRkE1TEFzZndNWlh5U2FKalVqaW9PcQpHcXp2" + 
		"Si9CN09GdXU0eFNQT0MzT1F4bEVLTDBucEhBSVFXTDNtOFFSdlYveWliYld2MkxVbG53OHRF" + 
		"cVFDK0Q4Cm5va1ltenUxRWtMWmdUYkFIZkVpSTNzQ0F3RUFBUT09Ci0tLS0tRU5EIFBVQkxJ" + 
		"QyBLRVktLS0tLQo=", 'base64');

	let testSignature = "TlAtCVxlg2Mh69HhHiC0tUlCqCcPSPX9GtleAb6sJmi5v7Kh8K3tSGvo" + 
		"ynInoM0yTYfgk8PipjQbUu4MwsEdaAvUlaQ9Xpl8g7REyODSsgeXWgRGupnihZWBE5lrWxN1" + 
		"s4XLujN+FV8ojm0xL8nmv9HyB4ETpu+/gGDJpgy1QUNnF738pcmEjBcM80WI5wFDrVcQLZ9q" + 
		"7Ic6MwyOiSa3DQd8SdBFepMWciZoeW7AUxstWMTqDR3rkog39bYuNNlsbhhDtyBeTiWnjnzR" + 
		"6EoqR8wYNACbwkdEwOf9sa8AJ2QTuAUl8mqSW4x5+SEGtuPY2h3ceJMpm/0ixWn27UBXqnSH" + 
		"iSgNcR4jbIpKwKRqJYwxDHmq2Va8G0lZtaDcDB0VOKXOB7JPQwprJDiWrpJ9jXOLHvKEny8l" + 
		"nkHqLkZm10RrvC+EEe+SSyRk4XtG59Mfp+6Be7thlVyn8KSbxCf882E4snBUNB5qSpOeJLs6" + 
		"pbn45QzmzULSOjwyry/FndQnEbj8JbUnfRMlrILSgZvnVH7XW6/2GU31KiE1HDd/6IO/LmF0" + 
		"U5SA6GdQmyQn76Sd3K7fF6nhjiNvVQM4C6bsjk7ZBYGMV55Co8jAfXU1J2UFvz55x0Lxh57p" + 
		"o6aHTbohxgsKsg4YoJj7QWkLc6lxsCROeNr53oVfIbO9X5+nJ2E=";

	let testForOwnSignature = false;
	let isOwnSignatureHandler = () => testForOwnSignature;

	let closeWasCalled = false;
	let closeHandler = () => { closeWasCalled = true; };

	let sentMessage;
	let sentTimes = 0;
	let sendHandler = (m, c) => {
		sentTimes++;

		if(sentTimes === 1) {
			c(new Error("test!"));
		} else if(sentTimes === 2) {
			c(new Error("test2!"));
		} else if(sentTimes === 3) {
			sentMessage = JSON.parse(m);
		}
	}

	let testPeerList = ['abcd'];
	let testPort = 1234;
	let testPublicAddress = 'blah';

	let testPeer = {
		debug: false,
		getPeerList: () => testPeerList,
		isOwnSignature: isOwnSignatureHandler,
		managedTimeouts: {
			setTimeout: (f, d) => f()
		},
		port: testPort,
		privateKey: new NodeRSA(testPrivateKey),
		publicAddress: testPublicAddress,
		requireConfirmation : false,
		ringPublicKey: new NodeRSA(testPublicKey),
	};

	let testConnection = {
		close: closeHandler,
		send: sendHandler
	};

	let testMessage = {
		body: {
			publicKey: testPublicKey,
			signature: testSignature.toString("base64")
		}
	};

	testForOwnSignature = true;
	onHelo.apply(testPeer, [{ message: testMessage, 
		connection: testConnection }]);

	assert.ok(closeWasCalled, "Message containing peer's own signature " + 
		"should close connection.");

	testForOwnSignature = false;

	let oldVerify = testPeer.ringPublicKey.verify;
	testPeer.ringPublicKey.verify = () => { throw new Error("test!"); };

	let verifyResult = onHelo.apply(testPeer, [{ message: testMessage, 
		connection: testConnection }]);

	assert.notOk(verifyResult, "When key verification fails, error "  +
		"should be gracefully caught and function should return false.");

	testPeer.ringPublicKey.verify = () => { return true; };

	onHelo.apply(testPeer, [{ message: testMessage, 
		connection: testConnection }]);

	assert.ok(testConnection.trusted, "Correct message and verified key " + 
		"should result in a trusted connection.");

	assert.ok(testConnection.peerPublicKey instanceof NodeRSA, "Correct " + 
		"message and verified key should set the connection's peer " + 
		"public key.");

	assert.ok(testConnection.peerPublicKeySignature.length > 0, "Correct " +
		"message and key that can be verified should set the connection's " + 
		"peer public key signature.");

	assert.equal(testConnection.iv.length, 16, "Correct message and key can " +
		"be verified should set the connection's Initialization Vector.");

	assert.equal(testConnection.key.length, 32, "Correct message and key can " +
		"be verified should set the connection's Initialization Vector.");

	assert.equal(sentTimes, 3, "Failure to send message should result in " + 
		"message send retry.");

	assert.equal(sentMessage.header.type, Message.TYPES._trusted, "Sent " + 
		"message should be that of Message.TYPES._trusted.");

	assert.equal(JSON.stringify(sentMessage.body.peers), 
		JSON.stringify(testPeerList),  "Sent message body should have " + 
		"correct peers property.");

	assert.equal(sentMessage.body.listening.port, testPort,  "Sent " + 
		"message body should have correct listening port property.");

	assert.equal(sentMessage.body.listening.address, testPublicAddress,  
		"Sent message body should have correct listening address " + 
		"property.");

	assert.equal(sentMessage.body.requireConfirmation, 
		testPeer.requireConfirmation, "Sent message body should have " + 
		"correct listening port property.");

	assert.end();
});