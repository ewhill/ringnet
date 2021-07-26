"use strict";

const test = require('tape');

const Message = require('../lib/Message');

test("Message", (assert) => {
  // Create a new empty Message
  let emptyMessage = new Message();

  // Check to make sure the created message's body is `{}` 
  assert.equal(JSON.stringify(emptyMessage.body), "{}", 
    "Generated empty message body should be equal to empty object.");

  // Create a message with header type and JSON body data
  let messageBody = { 'test': "testing" };
  let messageWithTypeAndBody = new Message({
      body: messageBody
    });
  
  // Ensure the message has the constructed body of messageBody
  assert.deepEqual(messageWithTypeAndBody.body, messageBody, 
    "Constructed with options body argument should have body equal " + 
    "to passed body object.");

  assert.ok(messageWithTypeAndBody.header.hash.length > 0, 
    "Header hash should be set when Message is constructed.");

  const messageHeaderHashBefore = messageWithTypeAndBody.header.hash;
  messageWithTypeAndBody.body = "blah";

  assert.notEqual(messageWithTypeAndBody.header.hash, messageHeaderHashBefore, 
    "Header hash should be updated when Message body is set.");
    
  // Generate new simple, string Message
  let simpleStringMessage = new Message({ body: "hello world!" });
  
  assert.equal(simpleStringMessage.body, "hello world!", 
    "Constructed with string body should have body correctly set.");
    
  // Clone firstMessage
  let clonedMessage = new Message(simpleStringMessage);
  
  //firstMessage and secondMessage should be equal
  assert.deepEqual(simpleStringMessage, clonedMessage, 
    "Generated and cloned should be equal.");
  
  // firstMessage and secondMessage should have different toString values
  assert.equal(simpleStringMessage.toString(), clonedMessage.toString(), 
    "Generated and cloned Message toString() values should be equal.");
  
  // Create a new empty message
  let blankMessage = new Message();
  
  // Check to make sure the created message's header is correct
  assert.true(blankMessage.header.timestamp instanceof Date,
    "Generated header timestamp should be an instance of Date object.");

  const blankMessageJSON = blankMessage.toString();
  blankMessage = Message.from(simpleStringMessage);

  assert.equal(blankMessage.toString(), simpleStringMessage.toString(), 
    "'from()' method should copy given message to current message.");
    
  assert.end();
});

