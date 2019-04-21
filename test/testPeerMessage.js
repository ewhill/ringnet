"use strict";

const test = require('tape');
const { Message } = require('../index.js');

test("Message", (assert) => {
  // Create a new empty Message
  let emptyMessage = new Message();

  // Check to make sure the created message's body is `{}` 
  assert.equal(JSON.stringify(emptyMessage.body), "{}", 
    "Generated empty message body should be equal to empty object.");

  // Create a message with header type and JSON body data
  let messageBody = { 'test': "testing" };
  let messageWithTypeAndBody = new Message({
    'type': 'update',
    'body': messageBody
  });
  
  // Ensure the message has the constructed body of messageBody
  assert.deepEqual(messageWithTypeAndBody.body, messageBody, 
    "Message constructed with options body argument should have body equal to " +
    "passed body object.");
    
  // Ensure the message has the constructed header of type = 'update'
  assert.equal(messageWithTypeAndBody.header.type, 'update', 
    "Message constructed with options Message type should have header type equal " +
    "to passed Message type.");
    
  // Generate new Message
  let messageStringConstructor = new Message("hello world!");
  
  assert.equal(messageStringConstructor.body, "hello world!", 
    "Message constructed with string argument should have body equal to string.");
    
  // Clone firstMessage
  let clonedMessage = new Message(messageStringConstructor);
  
  //firstMessage and secondMessage should be equal
  assert.deepEqual(messageStringConstructor, clonedMessage, 
    "Message generated and cloned should be equal.");
  
  // firstMessage and secondMessage should have different toString values
  assert.equal(messageStringConstructor.toString(), clonedMessage.toString(), 
    "Generated Message toString() and cloned Message toString should be equal.");
  
  // Create a new empty message
  let messageHeaderTest = new Message();
  
  // Check to make sure the created message's header is correct
  assert.true(messageHeaderTest.header.timestamp instanceof Date,
    "Generated message header timestamp should be an instance of Date object.");
    
  assert.end();
});

