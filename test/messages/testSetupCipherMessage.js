const test = require('tape');

const SetupCipherMessage = require('../../lib/messages/setupCipher');


test("SetupCipherMessage", (assert) => {
  const emptySetupCipherMessage = new SetupCipherMessage();

  assert.equal(emptySetupCipherMessage.key, undefined,
    "Empty constructor value for key should leave property unset.");
  assert.equal(emptySetupCipherMessage.iv, undefined,
    "Empty constructor value for iv should leave property unset.");

  const cipherMessage = new SetupCipherMessage({ key: 'asd', iv: '123' });

  assert.equal(cipherMessage.key, 'asd',
    "Provided value for key via constructor should set the key.");
  assert.equal(cipherMessage.iv, '123',
    "Provided value for iv via constructor should set the iv.");

  cipherMessage.key = 'a';
  assert.equal(cipherMessage.key, 'a',
    "Provided value for key via setter should set the key.");
  cipherMessage.iv = 'b';
  assert.equal(cipherMessage.iv, 'b',
    "Provided value for iv via setter should set the iv.");
    
  assert.end();
});
