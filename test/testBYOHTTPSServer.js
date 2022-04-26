"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');

const { Peer, Message } = require('../index.js');
const Server = require('../lib/Server');

const sink = () => {};
const fakeLogger = { error: sink, info: sink, log: sink, warn: sink };

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

test("PeerBYOHTTPSServerTest", async (assert) => {
  //Create a server
  var server = https.createServer({
      key: fs.readFileSync('https.key.pem'),
      cert: fs.readFileSync('https.cert.pem')
    }, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('BYOHTTPSServer');
    });

  await new Promise((resolve) => {
    server.listen(8181, resolve); // Start server
  });

  const p1 = new Peer({
    httpsServerConfig: {
      server,
      mode: Server.MODES.PASS,
    },
    signaturePath: "first.peer.signature",
    publicKeyPath: "first.peer.pub",
    privateKeyPath: "first.peer.pem",
    ringPublicKeyPath: ".ring.pub",
    publicAddress: "127.0.0.1:8181",
    logger: fakeLogger,
  });

  await p1.init();
  
  assert.equal(p1.port, 8181, 
    "Created HTTPS server and HTTPS server of peer should be listening on " + 
    "the same port as they should be the same server.");
  
  const reqResult = await new Promise((resolve, reject) => {
    // Change to http for local testing
    let req = https.request({
        hostname: "localhost",
        port: 8181,
        path: "/",
        method: "GET",
        headers: {}
      }, function(res) {
        res.setEncoding('utf8');
        
        let body = '';
        res.on('data', function(chunk) {
          body += chunk;
        });

        res.on('end', function() {
          return resolve({ body, statusCode: res.statusCode });
        })
      });

    req.on('error', reject);
    req.end();
  });

  assert.equal(reqResult.statusCode, 200, 
    "HTTPS Server should have 200 response code, as given when created.");
    
  assert.equal(reqResult.body, "BYOHTTPSServer", 
    "HTTPS Server should respond with predefined end string.");
    
  const p2 = new Peer({
    httpsServerConfig: {
      port: 9191,
    },
    signaturePath: "second.peer.signature",
    publicKeyPath: "second.peer.pub",
    privateKeyPath: "second.peer.pem",
    ringPublicKeyPath: ".ring.pub",
    discoveryConfig: {
      addresses: [ "127.0.0.1" ],
      range: {
        start: 8180,
        end: 8190
      }
    },
    publicAddress: "127.0.0.1:9191",
    logger: fakeLogger,
  });

  await p2.init();
  await p2.discover();
  
  assert.equal(p2.peers.length, 1, 
    "Peers should be able to connect to peer with HTTPS Server not created " +
    "by RingNet library.");
  
  await p1.close();
  await p2.close();

  server.close();
  assert.end();
});