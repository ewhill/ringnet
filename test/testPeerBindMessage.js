"use strict";
const test = require('tape');

const { Peer, Message } = require('../index.js');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

class CustomMessage extends Message {
  constructor(options = {}) {
    super();
    const { data='' } = options;
    this.data = data;
  }

  get data() { return this.body.data; }
  set data(data) { this.body.data = data; }
}

test("PeerBindMessage", async (assert) => {
  const sink = () => {};
  const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

  let peer1 = new Peer({
      signaturePath: "first.peer.signature",
      publicKeyPath: "first.peer.pub",
      privateKeyPath: "first.peer.pem",
      ringPublicKeyPath: ".ring.pub",
      httpsServerConfig: {
        port: 26784,
      },
      logger: fakeLogger
    });
  
  let peer2 = new Peer({
    signaturePath: "second.peer.signature",
    publicKeyPath: "second.peer.pub",
    privateKeyPath: "second.peer.pem",
    ringPublicKeyPath: ".ring.pub",
    httpsServerConfig: {
      port: 26785,
    },
    logger: fakeLogger,
  });

  const testMessageData = 'Hey, let\'s test this custom messsage bind!';

  let receivePromiseResolve;
  const receivePromise = new Promise((resolve) => {
      receivePromiseResolve = resolve;
    });

  const testHandler = async (message, connection, logger) => {
    assert.equal(message.data, testMessageData, 
      'Message with custom Message header type should be received by custom ' +
      'event listener.');
    assert.ok(true, `Custom event listener fired; test passed.`);
    receivePromiseResolve();
  };

  await peer1.init();
  await peer2.init();
  await peer2.discover(["127.0.0.1:26784"]);

  peer2.bind(CustomMessage).to(testHandler);
  await peer1.broadcast(new CustomMessage({ data: testMessageData }));
  await receivePromiseResolve;

  const removed = peer2.unbind(CustomMessage, testHandler);
  assert.equals(peer2.requestHandlers_[CustomMessage.name].length, 0, 
    'Calling unbind should remove handler from peer');

  assert.equals(removed.length, 1, 
    'Returned unbind array value should be correct length.');

  assert.equals(removed[0].constructor.name, 'RequestHandler',
    'Returned handler via unbind should be of type RequestHandler.');

  assert.equals(
    removed[0]._id,
    testHandler.__requestHandlerIds[0], 
    'Returned unbind array value should contain unbound handler.');

  const newTestHandler = async (message, connection, logger) => {
    // No-op.
  };

  peer2.bind(CustomMessage).to(newTestHandler);
  peer2.bind(CustomMessage).to(newTestHandler);
  peer2.bind(CustomMessage).to(newTestHandler);

  assert.equals(peer2.requestHandlers_[CustomMessage.name].length, 3, 
    'Calling bind multiple times with the same handler should add to peer');

  peer2.unbindAll(CustomMessage);
  assert.equals(peer2.requestHandlers_[CustomMessage.name].length, 0, 
    'Calling unbindAll should remove all handlers from peer');
  
  await peer2.close();
  await peer1.close();
  
  assert.end();
});

