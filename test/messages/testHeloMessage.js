const test = require('tape');

const HeloMessage = require('../../lib/messages/helo');


test("HeloMessage", (assert) => {
  assert.throws(
    () => new HeloMessage(), 
    /required/,
    "Attempting to create HeloMessage without params should throw.");

  const heloMessage = new HeloMessage({ publicKey: 'asd', signature: '123' });

  assert.equal(heloMessage.publicKey, 'asd',
    "Provided value for publicKey via constructor should set the publicKey.");

  assert.equal(heloMessage.signature, '123',
    "Provided value for signature via constructor should set the signature.");

  heloMessage.publicKey = 'a';
  assert.equal(heloMessage.publicKey, 'a',
    "Provided value for publicKey via setter should set the publicKey.");

  heloMessage.signature = 'b';
  assert.equal(heloMessage.signature, 'b',
    "Provided value for signature via setter should set the signature.");
    
  assert.end();
});

