const test = require('tape');

const PeersMessage = require('../../lib/messages/peers');
const utils = require('../../lib/utils');

test("PeersMessage", (assert) => {
  const emptyPeersMessage = new PeersMessage();

  assert.deepEqual(emptyPeersMessage.since, new Date(0), 
    "Default value of since should be provided via constructor.");

  assert.deepEqual(emptyPeersMessage.peers, [], 
    "Default value of peers should be provided via constructor.");

  assert.throws(() => { emptyPeersMessage.since = 'a'; },
    "Attempting to set since property to non-number value should throw.");

  assert.throws(() => { emptyPeersMessage.peers = 'a'; },
    "Attempting to set peers property to non-array value should throw.");

  emptyPeersMessage.since = undefined;
  assert.deepEqual(emptyPeersMessage.since, new Date(0),
    "Default value of since should be provided via property setter.");

  emptyPeersMessage.peers = undefined;
  assert.deepEqual(emptyPeersMessage.peers, [],
    "Default value of peers should be provided via property setter.");

  const nowDate = new Date(Date.now());
  const peersList = [ {a: 'a'}, {b: 'b'} ];
  let peersMessage = new PeersMessage({
      since: nowDate.getTime(),
      peers: peersList,
    });

  assert.deepEqual(peersMessage.since, nowDate, 
    "Set and get since property value should be equal");

  assert.deepEqual(peersMessage.peers, peersList, 
    "Set and get since property value should be equal");
    
  assert.end();
});

