"use strict";
const fs = require('fs');
var https = require('https');
const test = require('tape');

const { Peer, Message } = require('../index.js');

const HTTP_SERVER_MODES = require('../lib/src/httpsServerModes');

// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------

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
    httpsServer: server,
    httpsServerMode: HTTP_SERVER_MODES.PASS,
    signature: "first.peer.signature",
    publicKey: "first.peer.pub",
    privateKey: "first.peer.pem",
    ringPublicKey: ".ring.pub",
  });

  await p1.init();
  
  assert.equal(p1.httpsServer.address().port, 8181, 
    "Created HTTPS server and HTTPS server of peer should " + 
    "be listening on the same port as they should be the " + 
    "same server.");
  
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
    "HTTPS Server should have 200 response code, " + 
    "as given when created.");
    
  assert.equal(reqResult.body, "BYOHTTPSServer", 
    "HTTPS Server should respond with predefined " + 
    "end string as given when created.");
    
  const p2 = new Peer({
    port: 9191,
    signature: "second.peer.signature",
    publicKey: "second.peer.pub",
    privateKey: "second.peer.pem",
    ringPublicKey: ".ring.pub",
    discoveryAddresses: [ "127.0.0.1" ],
    discoveryRange: [8180, 8190],
  });

  await p2.init();
  
  assert.equal(p2.peers.length, 1, 
    "Peers should be able to connect to peer with " + 
    "HTTPS Server not created by RingNet library.");
  
  await p1.close();
  await p2.close();

  server.close();
  assert.end();
});