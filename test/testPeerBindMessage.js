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
    this.body = { data };
  }

  clone() {
    return new CustomMessage({ data: this.data });
  }

  get data() { return this.body.data; }
  set data(data) { this.body = { ...this.body, data }; }
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

  const testHandler = async (message, connection, logger) => {
    assert.equal(message.data, testMessageData, 
      'Message with custom Message header type should be received by custom ' +
      'event listener.');
    assert.ok(true, `Custom event listener fired; test passed.`);
    
    await peer2.close();
    await peer1.close();
    
    assert.end();
  };

  await peer1.init();
  await peer2.init();
  await peer2.discover(["127.0.0.1:26784"]);

  peer2.bind(CustomMessage).to(testHandler);
  await peer1.broadcast(new CustomMessage({ data: testMessageData }));
});

