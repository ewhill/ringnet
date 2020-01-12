"use strict";
const test = require('tape');

const RSAKeyPair = require('../lib/src/RSAKeyPair.js');

const privateKeyPath = './.ring.pem';
const publicKeyPath = './.ring.pub';
const testData = Buffer.from('hello world!', 'utf8');

let key;

test("RSA", (assert) => {
	const assertThrows = (fn, msg) => {
		let err = null;
		try {
			fn();
		} catch(e) {
			err = e;
		}
		assert.notEqual(err, null, msg);
	};

	key = new RSAKeyPair({ privateKeyPath, publicKeyPath });

	assert.notEqual(key.private, null, 
		'Loaded private RSA key should not be null.');

	assert.notEqual(key.public, null,
		'Loaded public RSA key should not be null.');

	const signature = key.sign(testData);

	assert.notEqual(signature, null, 'Generated signature should not be null.');

	assert.ok(key.verify(testData, signature), 
		'Signature verification should return true.');

	const encrypted = key.encrypt(testData);

	assert.notEqual(encrypted, null, 'Encrypted buffer should not be null.');

	assert.notEqual(encrypted.toString('utf8'), testData.toString('utf8'),
		'Encrypted buffer and original buffer should not be equal.');

	const decrypted = key.decrypt(encrypted);

	assert.equal(decrypted.toString('utf8'), testData.toString('utf8'), 
		'Decrypted buffer should equal original buffer');

	key = new RSAKeyPair({ privateKeyPath });

	assert.notEqual(key.public, null,
		'Inferred public RSA key from private RSA key should not be null.');

	key = (new RSAKeyPair()).generate();

	assert.notEqual(key.private, null, 
		'Generated private RSA key should not be null.');

	assert.notEqual(key.public, null,
		'Generated public RSA key should not be null.');

	const exportedKeys = key.export({ mode: 'both', returnBuffer: true });

	const exportedSignature = key.sign(testData);

	assert.notEqual(exportedKeys.private, null, 
		'Exported private RSA key should not be null.');

	assert.notEqual(exportedKeys.public, null,
		'Exported public RSA key should not be null.');

	const importedKeys = new RSAKeyPair({
			privateKeyBuffer: exportedKeys.private,
			publicKeyBuffer: exportedKeys.public
		});

	assert.notEqual(exportedKeys.private, null, 
		'Import of exported private RSA key should not be null.');

	assert.notEqual(exportedKeys.public, null,
		'Import of exported public RSA key should not be null.');

	assert.ok(importedKeys.verify(testData, exportedSignature), 
		'Signature verification should return true when using imported keys.');

	const loadedKeys = new RSAKeyPair({ privateKeyPath, publicKeyPath });

	assertThrows(() => { key.public = loadedKeys.public; }, 
		'Attempting to set public key after private key value has already ' + 
		'been set should throw an error.');

	assertThrows(() => { key.private = loadedKeys.private; }, 
		'Attempting to set private key after value has already been set ' + 
		'should throw an error.');

	assertThrows(() => { new RSAKeyPair({ privateKeyPath: '/InvalidPath' }); },
		'Providing an incorrect value for the private key file path should ' + 
		'throw an error.');

	assertThrows(() => { new RSAKeyPair({ publicKeyPath: '/InvalidPath' }); }, 
		'Providing an incorrect value for the public key file path should ' + 
		'throw an error.');

	assertThrows(() => { (new RSAKeyPair()).export({ mode: 'private' }); }, 
		'Attempting to export private key when the private key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).export({ mode: 'public' }); }, 
		'Attempting to export public key when the public key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).export({ mode: 'both' }); }, 
		'Attempting to export keys when either key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).encrypt(Buffer.from('')); }, 
		'Attempting to encrypt data when the public key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).decrypt(Buffer.from('')); }, 
		'Attempting to decrypt data when the private key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).sign(Buffer.from('')); }, 
		'Attempting to sign data when the private key is not set ' + 
		'should throw an error.');

	assertThrows(() => { (new RSAKeyPair()).verify(Buffer.from('')); }, 
		'Attempting to verify data when the public key is not set ' + 
		'should throw an error.');

	assertThrows(() => {
			(new RSAKeyPair({ publicKeyPath })).public = loadedKeys.public;
		}, 'Attempting to set a new public key when one has already been ' + 
			'defined should throw an error.');

	assert.end();
});
