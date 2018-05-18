"use strict";

const test = require('tape');
const { PeerMessage } = require('../index.js');

test("PeerMessage", (assert) => {
  // Create a new empty PeerMessage
  let emptyMessage = new PeerMessage();

  // Check to make sure the created message's body is `{}` 
  assert.equal(JSON.stringify(emptyMessage.body), "{}", 
    "Generated empty message body should be equal to empty object.");

  // Create a message with header type and JSON body data
  let messageBody = { 'test': "testing" };
  let messageWithTypeAndBody = new PeerMessage({
    'type': PeerMessage.PEER_MESSAGE_TYPES.update,
    'body': messageBody
  });
  
  // Ensure the message has the constructed body of messageBody
  assert.deepEqual(messageWithTypeAndBody.body, messageBody, 
    "PeerMessage constructed with options body argument should have body equal to passed body object.");
    
  // Ensure the message has the constructed header of type = PeerMessage.PEER_MESSAGE_TYPES.update
  assert.equal(messageWithTypeAndBody.header.type, PeerMessage.PEER_MESSAGE_TYPES.update, 
    "PeerMessage constructed with options PeerMessage type should have header type equal to passed PeerMessage type.");
    
  // Generate new PeerMessage
  let messageStringConstructor = new PeerMessage("hello world!");
  
  assert.equal(messageStringConstructor.body, "hello world!", 
    "PeerMessage constructed with string argument should have body equal to string.");
    
  // Clone firstMessage
  let clonedMessage = new PeerMessage(messageStringConstructor);
  
  //firstMessage and secondMessage should be equal
  assert.deepEqual(messageStringConstructor, clonedMessage, 
    "PeerMessage generated and cloned should be equal.");
  
  // firstMessage and secondMessage should have different toString values
  assert.equal(messageStringConstructor.toString(), clonedMessage.toString(), 
    "Generated PeerMessage toString() and cloned PeerMessage toString should be equal.");
  
  // Create a new empty message
  let messageHeaderTest = new PeerMessage();
  
  // Check to make sure the created message's header is correct
  assert.true(messageHeaderTest.header.timestamp instanceof Date,
    "Generated message header timestamp should be an instance of Date object.");
    
  assert.end();
});

