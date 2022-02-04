const test = require('tape');

const PeersMessage = require('../../lib/messages/peers');

test("PeersMessage", (assert) => {
  const emptyPeersMessage = new PeersMessage();

  assert.equal(emptyPeersMessage.since, 0, 
    "Default value of since should be provided via constructor.");

  assert.deepEqual(emptyPeersMessage.peers, [], 
    "Default value of peers should be provided via constructor.");

  assert.throws(() => { emptyPeersMessage.since = 'a'; },
    "Attempting to set since property to non-number value should throw.");

  assert.throws(() => { emptyPeersMessage.peers = 'a'; },
    "Attempting to set peers property to non-array value should throw.");

  emptyPeersMessage.since = undefined;
  assert.equal(emptyPeersMessage.since, 0,
    "Default value of since should be provided via property setter.");

  emptyPeersMessage.peers = undefined;
  assert.deepEqual(emptyPeersMessage.peers, [],
    "Default value of peers should be provided via property setter.");

  const nowDate = Date.now();
  const peersList = [ {a: 'a'}, {b: 'b'} ];
  let peersMessage = new PeersMessage({
      since: nowDate,
      peers: peersList,
    });

  assert.equal(peersMessage.since, nowDate, 
    "Set and get since property value should be equal");

  assert.deepEqual(peersMessage.peers, peersList, 
    "Set and get since property value should be equal");
    
  assert.end();
});

