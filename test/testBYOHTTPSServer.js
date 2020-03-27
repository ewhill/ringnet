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

  //Start server
  server.listen(8181);

  var p1 = new Peer({
    httpsServer: server,
    httpsServerMode: HTTP_SERVER_MODES.PASS,
    signature: "first.peer.signature",
    publicKey: "first.peer.pub",
    privateKey: "first.peer.pem",
    ringPublicKey: ".ring.pub",
  });

  await p1.init();
  
  assert.equal(p1.httpsServer.address().port, 8181, 
    "Created HTTPS server and HTTPS server of peer should be listening on the same " +
    "port as they should be the same server.");
  
  //change to http for local testing
  var req = https.request({
      hostname: "localhost",
      port: 8181,
      path: "/",
      method: 'GET',
      headers: {}
    }, function (res) {
      res.setEncoding('utf8');
      
      var body = '';
      res.on('data', function (chunk) {
        body = body + chunk;
      });

      res.on('end', async function() {
        assert.equal(res.statusCode, 200, "HTTPS Server should have 200 response code, \
          as given when created.");
          
        assert.equal(body, "BYOHTTPSServer", "HTTPS Server should respond with predefined \
          end string as given when created.");
          
        var p2 = new Peer({
          port: 9191,
          signature: "second.peer.signature",
          publicKey: "second.peer.pub",
          privateKey: "second.peer.pem",
          ringPublicKey: ".ring.pub",
          discoveryAddresses: [ "127.0.0.1" ],
          discoveryRange: [8180, 8190],
        });

        await p2.init();
        
        assert.equal(p2.peers.length, 1, "Peers should be able to connect to peer with \
          HTTPS Server not created by RingNet library.");
        
        await p1.close();
        await p2.close();
        server.close();
        assert.end();
      });
    });

    req.on('error', function(e) {
      console.log("Error :" + e.message);
    });
    
    req.end();
});