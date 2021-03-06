"use strict";

const test = require('tape');

const { Peer, Message } = require('../index.js');

// ===========================================================================
// ===========================================================================

var tests = [{
  'peer1': {
    'send': [
      new Message({
        type: 'messageTest',
        body: "Howdy, it's peer1!!!"
      })
    ]
  },
  'peer2': {
    'receive': ({ message, connection }, assert, next) => {
      // Make sure the header is what we sent
      assert.equal(message.header.type, 'messageTest', 
        "Message header type sent by peer1 and received by peer2 should be equal.");
        
      // Make sure the body is what we sent
      assert.equal(message.body, "Howdy, it's peer1!!!", 
        "Message body sent by peer1 and received by peer2 should be equal");
      
      next();
    }
  }
}, {
  'peer2': {
    'send': [
      new Message({
        type: 'messageTest',
        body: "Hello, from peer2!!!"
      })
    ]
  },
  'peer1': {
    'receive': ({ message, connection }, assert, next) => {
      // Make sure the header is what we sent
      assert.equal(message.header.type, 'messageTest', 
        "Message header type sent by peer2 and received by peer1 should be equal.");
        
      // Make sure the body is what we sent
      assert.equal(message.body, "Hello, from peer2!!!", 
        "Message body sent by peer2 and received by peer1 should be equal.");
      
      next();
    }
  }
}, {
  'peer1': {
    'send': [
      new Message({
        type: 'messageTest',
        body: 0
      }),
      new Message({
        type: 'messageTest',
        body: 1
      }),
      new Message({
        type: 'messageTest',
        body: 2
      }),
      new Message({
        type: 'messageTest',
        body: 3
      }),
      new Message({
        type: 'messageTest',
        body: 4
      })
    ]
  },
  'peer2': {
    'receive': ({ message, connection }, assert, next) => {
      if(!connection._received) {
        connection._received = [];
      }
      
      connection._received.push(message.body);
      
      let inOrder = true;
      if(connection._received.length == 5) {
        for(let i=0; i<connection._received.length; i++) {
          assert.equal(i, connection._received[i], 
            `Received message at index ${i} should be ${i}, ` +
            `and is ${connection._received[i]}!`);

          if(i !== connection._received[i]) {
            inOrder = false;
          }
        }
        
        assert.ok(inOrder, 
          "peer2 received 5 messages in correct order as sent by peer1.");
        
        next();
      }
    }
  }
}, {
  'peer1': {
    'function': (assert, next) => {
      /*
        TODO: Method testing
          - Adding / Removing peer
            - Automatic discovery
            - Add peer with IPv4 '::ffff:'' prefix, verify strip
            - IPv6 test (?)
          - Discovery
            - Discovery on IP with port
            - Discovering on IP with no port
          - peer.isConnectedTo({ address, signature })
          - peer.inDiscoveryAddresses({ address, signature })
          - peer.getPeerList(signaturesToOmit)
            - No arguments
            - signaturesToOmit argument
          - peer.toString()
      */

      next();
    }
  }
}];

// ===========================================================================
// ===========================================================================

// Create peer1, the first peer, which will listen on port 26780
let peer1 = new Peer({
  port: 26780,
  signature: "first.peer.signature",
  publicKey: "first.peer.pub",
  privateKey: "first.peer.pem",
  ringPublicKey: ".ring.pub",
});

let peer2;

// ===========================================================================
// ===========================================================================

test("PeerTest", async (assert) => {
  
  var popTest = () => {
    if(tests.length > 0) {
      return tests.splice(0,1)[0];
    } else {
      return false;
    }
  };
  
  // =========================================================================
  // =========================================================================
  
  var nextTest = async () => {
    var oneTest = popTest();
    
    if(oneTest) {
      runTest(oneTest);
    } else {
      // We've reached the end of 'tests' array, thus our testing is complete
      // and we can call assert.end() to close the tape testing.
      await peer2.close();
      await peer1.close();
      assert.end();
    }
  };
  
  // =========================================================================
  // =========================================================================
  
  var runTest = (oneTest) => {
    // Set up the receive handlers before we send any messages.
    // -----------------------------------------------------------------------
    // If we send before we set up the receiving handlers, we have no
    // guarentee that our receive handler will be set up in enough time 
    // before the message is received and the situation becomes a race 
    // that leads to unwanted behavior.
    // -----------------------------------------------------------------------
    for(let p in oneTest) {
      // p is 'peer1' or 'peer2'
      
      if(oneTest[p].hasOwnProperty('function')) {
        oneTest[p].function(assert, nextTest);
      }
      
      if(oneTest[p].hasOwnProperty('receive')) {
        // Create a wrapper function which injects 'assert' and 'nextTest'
        // to the arguments. These are needed within the individual tests
        // to evaluate the test success/failure -- we have to pass them in.
        // -------------------------------------------------------------------
        // Normally creating a function in a loop doesn't turn out well, but
        // in this case, we accept the risk as there will be only one 'receive'
        // per 'peer1' or 'peer2' or any other peer for that matter...
        oneTest[p].receiveWrapper = (o) => { 
          // assert.comment(`${p} received message ${o.message.toString()}`);
          oneTest[p].receive(o, assert, nextTest);
        };
        
        // assert.comment(`Setting up ${p} 'receive' handler`);
        
        // Simple switch -- which peer are we looking at
        if(p == "peer1") {
          if(peer1._listener)
            peer1.removeListener('messageTest', peer1._listener);
            
          peer1._listener = oneTest[p].receiveWrapper;
          peer1.on('messageTest', peer1._listener);
        } else if(p == "peer2") {
          if(peer2._listener)
            peer2.removeListener('messageTest', peer2._listener);
            
          peer2._listener = oneTest[p].receiveWrapper;
          peer2.on('messageTest', peer2._listener);
        }
      }
    }
    
    for(let p in oneTest) {
      // p is 'peer1' or 'peer2'
      if(oneTest[p].hasOwnProperty('send')) {
        // Broadcast all in the 'send' array
        for(let i=0; i<oneTest[p].send.length; i++) {
          /* assert.comment(`Sending ${p} message: ` +
              `${oneTest[p].send[i].toString()}`); */
              
          try {
            // Simple switch -- which peer are we looking at
            if(p == "peer1") {
              peer1.broadcast(oneTest[p].send[i]);
            } else if(p == "peer2") {
              peer2.broadcast(oneTest[p].send[i]);
            }
          } catch(e) {
            console.error(e.stack);
          }
        }
      }
    }
  };
  
  // =========================================================================
  // =========================================================================
  // 
  peer1.on('connection', nextTest);

  await peer1.init();

  // Create the second peer, peer2, listening on 26781
  peer2 = new Peer({
    port: 26781,
    signature: "second.peer.signature",
    publicKey: "second.peer.pub",
    privateKey: "second.peer.pem",
    ringPublicKey: ".ring.pub",
    discoveryAddresses: [ "127.0.0.1:26780" ],
  });

  await peer2.init();
  await peer2.discover();
});
