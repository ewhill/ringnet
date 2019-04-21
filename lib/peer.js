"use strict";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const crypto            = require('crypto');
const EventEmitter      = require('events');
const fs                = require('fs');
const http              = require('http');
const https             = require('https');
const NodeRSA           = require('node-rsa');
const url               = require('url');
const WebSocket         = require('ws');

var WebSocketClient     = WebSocket;
var WebSocketServer     = WebSocket.Server;

const ManagedTimeouts   = require('./src/managedTimeouts');
const Message           = require('./src/message');
const onConfirm         = require('./src/events/confirm');
const onHelo            = require('./src/events/helo');
const onPeers           = require('./src/events/peers');
const onTrusted         = require('./src/events/trusted');
const onUnknown         = require('./src/events/unknown');

const getClassName = function(o) {
  let r = /function (.{1,})\(/.exec(o.constructor.toString());
  return (r && r.length > 1 ? r[1] : false);
};

module.exports = class Peer extends EventEmitter {
  constructor({
    credentials         = { 'key': "https.key.pem", 'cert': "https.cert.pem" },
    debug               = false,
    discoveryAddresses  = [],
    discoveryRange      = [26780, 26790],
    httpsServer         = false,
    port                = process.env.RINGNET_LISTEN || 26781,
    privateKey          = "peer.pem",
    publicAddress       = false,
    publicKey           = "peer.pub",
    requireConfirmation = true,
    ringPublicKey       = "ring.pub",
    signature           = "peer.signature",
    startDiscovery      = true,
    wsServerOptions     = {}
  }) {
    super();
    
    // Set defaults on this
    this.closing = false;
    this.debug = debug;
    this.discovering = false;
    this.discoveryAddresses = [];
    this.httpsServer = httpsServer;
    this.managedTimeouts = new ManagedTimeouts();
    this.peers = [];
    this.port = port;
    this.publicAddress = publicAddress;
    this.ready = false;
    this.range = discoveryRange;
    this.requireConfirmation = requireConfirmation;
    this.startDiscovery = startDiscovery;

    this.wsServerOptions = {
      // maxReceivedFrameSize: 64 * 1024 * 1024, //64MiB
      // maxReceivedMessageSize: 64 * 1024 * 1024, //64MiB
      // fragmentOutgoingMessages: false,
      keepAlive: true,
      autoAcceptConnections: false,
      ignoreXForwardedFor: false
    };

    // Overwrite websocket server options if given options in constructor
    let wsServerOptionsKeys = Object.keys(wsServerOptions);
    for(let i=0; i<wsServerOptionsKeys.length; i++) {
      this.wsServerOptions[wsServerOptionsKeys[i]] = 
        wsServerOptions[wsServerOptionsKeys[i]];
    }

    this.noServer = (this.wsServerOptions.hasOwnProperty("noServer") && 
      typeof this.wsServerOptions.noServer == "boolean") ? 
      this.wsServerOptions.noServer : false;
    
    // We will be cycling through 'checks' in order to make sure we are given the correct
    // files needed to create this peer.
    let checks = [{ // We require a ring public key to join the network
      description: "Ring Public Key",
      location: ringPublicKey
    }, { // We require a valid signature to join and to validate peers on the network
      description: "Signature",
      location: signature
    }];
    
    // Only throw an error if we haven't explicitly specified that we aren't going 
    // to be using a server via `noServer` property in `this.wsServerOptions`.
    if(!this.noServer) {
      // If we're not provided a valid 'httpsServer' option, check to make sure we 
      // are at least given HTTPS credentials in order to create a HTTPS server later.
      if(!this.httpsServer || getClassName(this.httpsServer) !== "Server") {
        if(this.debug) {
          console.log("A valid 'httpsServer' option was not given; the 'credentials' option will be " +
            "checked for valid HTTPS credentials instead.");
        }
        
        checks.concat([{
          // We require a valid signature to join and to validate peers on the network
          description: "HTTPS Server Key",
          location: credentials.key || "https.key.pem"
        }, {
          // We require a valid signature to join and to validate peers on the network
          description: "HTTPS Server Certificate",
          location: credentials.cert || "https.cert.pem"
        }]); 
      } else {
        if(this.debug) {
          console.log("A valid 'httpsServer' option given; the 'credentials' option will be " +
            "IGNORED.");
        }
      }
    }
    
    for(let check of checks) {
      if(this.debug) {
        console.log(`Checking for ${check.description} at ${check.location}`);
      }
        
      // Make sure we have all the files necessary.
      if(!fs.existsSync(check.location)) {
        throw new Error(`Invalid ${check.description} file location (given: ${check.location}).`);
      }
    }
    
    // Peep the addresses variable for valid, given discovery addresses, adding
    // them to this.discoveryAddresses as we go...
    for(let i=0; i<discoveryAddresses.length; i++) {
      if(typeof discoveryAddresses[i] == "string") {
        this.discoveryAddresses.push({
          'address': discoveryAddresses[i],
          'signature': null
        });
      } else if(typeof discoveryAddresses[i] == "object") {
          this.discoveryAddresses.push({
            'address': discoveryAddresses[i].hasOwnProperty("address") ? 
              discoveryAddresses[i].address : null,
            'signature': discoveryAddresses[i].hasOwnProperty("signature") ? 
              discoveryAddresses[i].signature : null
          });
      }
    }
    
    // If peer private key file exists, then read it. Else, generate private
    this.privateKeyLocation = privateKey;
    this.privateKey = fs.existsSync(privateKey) ?
      new NodeRSA(fs.readFileSync(privateKey)) : new NodeRSA({ b: 2048 });
      
    // If peer public key file exists, then read it. Else, generate public from this.privateKey
    this.publicKeyLocation = publicKey;
    this.publicKey = fs.existsSync(publicKey) ?
      new NodeRSA(fs.readFileSync(publicKey)) : new NodeRSA(this.privateKey.exportKey("public"));
      
    // Read the ringPublicKey (this is required to exist)
    this.ringPublicKeyLocation = ringPublicKey;
    this.ringPublicKey = new NodeRSA(fs.readFileSync(ringPublicKey));
    
    // Read the signature file (this is required to exist)
    this.signatureLocation = signature;
    this.signature = fs.readFileSync(signature);
    
    // Check to make sure that our signature is verifiable by the ring PUBLIC key
    // In other words, check to make sure the signature was generated by ring PRIVATE key
    // from our peer PUBLIC key. If not, we're probably not going to be allowed on the network
    // so we will have to abort peer creation altogether.
    if(!this.ringPublicKey.verify(this.publicKey.exportKey("public"), this.signature)) {
      throw new Error("Invalid signature for given peer public key and ring public key.");
    }
    
    if(this.debug) {
      console.log(`Peer signature (last 50 bytes): ` +
        `\n\t${this.signature.slice(-50).toString("base64")}`);
    }
    
    // Only create the https server if we haven't specified the `noServer` property
    // in `this.wsServerOptions`.
    if(!this.noServer) {
      // We weren't given an 'httpsServer' via constructor arguments -- We may need to create one
      if(!this.httpsServer || getClassName(this.httpsServer) !== "Server") {
          if(this.debug) console.log("Creating HTTPS server...");

          // Read the HTTPS Server key (this is required to exist)
          this.httpsKeyLocation = credentials.key;
          this.httpsKey = fs.readFileSync(credentials.key, 'utf8');
          
          // Read the HTTPS Server key (this is required to exist)
          this.httpsCertLocation = credentials.cert;
          this.httpsCert = fs.readFileSync(credentials.cert, 'utf8');

          // Create the httpsServer (dummy)
          this.httpsServer = https.createServer({
            'key': this.httpsKey,
            'cert': this.httpsCert
          }, (request, response) => {
            // process HTTP request. Since we're writing just WebSockets
            // server we don't have to implement anything.
            response.end();
          });
      } else {
        if(this.debug) console.log(`HTTPS server already created.`);
      }

      // Either start the HTTPS server if we created one, or proceed by emitting the 'ready' 
      // eventif one has already been created and we are simply leveraging it instead.
      if(this.httpsServer.address() === null) {
        if(this.debug) console.log(`Starting HTTPS server listening on ${this.port}...`);
        // Server isn't already listening (possible created from 'if' block direcrtly above)
        // so we need to tell it to start listening on port defined by 'port'
        this.httpsServer.listen(this.port, () => {
          if(this.debug) console.log(`Server listening on ${this.port}`);

          this.emit('ready');
          this.ready = true;
        });
      } else {
        this.port = this.httpsServer.address().port;
        if(this.debug) console.log(`HTTPS server already listening on ${this.port}.`);
        // Server is already listening, emit ready and set the ready flag to true
        this.emit('ready');
        this.ready = true;
      }

      // Make sure the websocket servers knows to use this newly created server
      this.wsServerOptions.server = this.httpsServer;
    } else {
      if(this.debug) console.log(`'noServer' option given; no HTTPS server will be created.`);
      this.emit('ready');
      this.ready = true;
    }

    // Create the WebSocket server
    this.wsServer = new WebSocketServer(this.wsServerOptions);
    
    // WebSocket server
    this.wsServer.on('connection', (connection, request) => {
      if(this.debug) {
        console.log("New server connection...");

        // returns incorrect ip on open shift
        console.log("\trequest.remoteAddress = " + 
          request.connection.remoteAddress);

        if(request.headers.hasOwnProperty("x-forwarded-for")) {
          // undefined on open shift
          console.log("\trequest.headers['x-forwarded-for'] = " + 
            request.headers['x-forwarded-for'].split(/\s*,\s*/)[0]);
        }
      }
      
      this.emit('request', { connection, request });
      this.setupConnection({ connection, request });
    });
    
    if(this.startDiscovery) this.discover();
  }
  
  discover() {
    if(!this.discoveryAddresses || this.discoveryAddresses.length < 1) {
      this.discovering = false;
      this.emit('discovered');
      return false;
    }
    
    if(this.debug)
      console.log(`Starting discovery on ${this.discoveryAddresses.length} addresses...`);
    
    this.discovering = true;
    this.emit('discovering');
    
    // Cycle through our discoveryAddresses array and try to 
    // connect to each potentail peer via WebSocketClient.
    let discoverOne = () => {
      let peerToDiscover = this.discoveryAddresses.splice(0,1)[0];
      
      // next() will be called when we're done discovering on a single
      // address and can move on to the next.
      let next = () => {
        // If we have more addresses in this.discoveryAddresses, keep discovering
        // Else, let's emit the discovered event to show we are done discovering
        if(this.discoveryAddresses.length > 0) discoverOne();
        else this.emit('discovered');
      };
      
      if(this.isConnectedTo(peerToDiscover)) next();
      
      if(this.debug) {
        console.log("------------------------------------------");
        console.log(JSON.stringify(peerToDiscover));
        console.log("------------------------------------------");
      }
      
      // If we have prefix of "::ffff":, strip it (just means its IPv4)
      peerToDiscover.address = peerToDiscover.address.replace(/^::ffff:(.*)$/i, "$1");

      let urlRegex = new RegExp (
          // Start of the line:
          "^" + 
          // Protocol:
          "(?:(?:([^\\s\\:]+)\\:\\\/\\/)?(?:\\/\\/)?)?" + 
           // Host:
          "([^\\s\\:\\/]+)" +
          // Port:
          "(?:\:([0-9]+))?" + 
          // Path ():
          "((?:[\\/\\\\](?:[a-z0-9.\\-_~!$&'\"()*+,;=:\\@]|\\%[0-9a-f]{2})+)*)?" +
          // Trailing slash:
          "[\\/\\\\]?" + 
          // Query parameters:
          "(\\?[^#\\s]*|\\?)?" + 
          // Hash:
          "(\\#[^\\s]*)?" + 
          // End of the line:
          "$", 
          // Case insensitive, multiline
          'im'
        );

      let matches = urlRegex.exec(peerToDiscover.address);

      let [ , protocol, host, port, path, query, hash ] = matches;

      let hasProtocol = protocol !== undefined;
      let hasPath = path !== undefined;
      let hasPort = port !== undefined;
      
      if(hasPort) {
        try {
          port = parseInt(port);
        } catch(e) {}
      }

      // The node URL library is very strange... It's string output, when 'format' is
      // called with an object having the 'host' property as the parameter, does not
      // contain the port. So, to work around this, a temporary object is used for
      // parsing, and a url object is made up on the fly with it's 'host' property set 
      // to null in order for the port to be in the string output of 'format()'
      // See https://github.com/nodejs/node/issues/12067 for more details.
      
      if(this.debug) {
        console.log(`Discovery Address` + 
          `\n\tProtocol: ${(hasProtocol ? "✔" : "✖")}` +
          `\n\tPath:     ${(hasPath ? "✔" : "✖")}` +
          `\n\tPort:     ${(hasPort ? "✔" : "✖")}`);
      }
      
      let parsedAddress = {
        'protocol': (hasProtocol ? protocol : "wss:"),
        'slashes': true,
        'hostname': (host !== null ? host : "localhost"),
        'host': null,
        'port': (hasPort ? port : ""),
        'pathname': (hasPath ? path : "")
      };
      
      // If 'parsedAddress' doesn't contain a port and this peer has 
      // a given discovery range, 'this.range', let's expand the address
      // into multiple entries in 'this.discoveryAddresses' for the ports
      // specified in 'this.range'.
      if(!hasPort) {
        // Check if we were provided a range of ports for discovery
        if(this.range && Array.isArray(this.range) && 
          this.range.length == 2 && this.range[0] <= this.range[1]) {
            // Add ports in 'this.range' to the address in question for discovery
            for(let i=this.range[0]; i<=this.range[1]; i++) {
              // Assign the port from the range at index 'i'
              parsedAddress.port = i;
              
              // Create our object (used for testing below)
              let d = { 'address': `${url.format(parsedAddress)}`,
                'signature': peerToDiscover.signature };
              
              let inDiscoveryAddresses = this.inDiscoveryAddresses(d), // not already in queue
                isConnectedTo = this.isConnectedTo(d), // not already connected
                isOwnSignature = this.isOwnSignature(d.signature); // not itthis
                
              if(!inDiscoveryAddresses && !isConnectedTo && !isOwnSignature) {
                // If we haven't seen this discovery address before and we aren't
                // already connected to it, push it to our discovery queue
                if(this.debug) console.log(`\t${JSON.stringify(d)}`);
                this.discoveryAddresses.push(d);
              } else {
                if(this.debug) {
                  console.log(`Not connecting to peer ${JSON.stringify(d)}`, 
                    `\n\tinDiscoveryAddresses: ${inDiscoveryAddresses}`,
                    `\n\tisConnectedTo: ${isConnectedTo}`,
                    `\n\tisOwnSignature: ${isOwnSignature}`);
                }
              }
            }
        } else {
          // Add the port we listen on to the address in question for discovery
          parsedAddress.port = this.port;
          
          // Create our object (used for testing below)
          let d = { 'address': `${url.format(parsedAddress)}`,
            'signature': peerToDiscover.signature };
          
          let inDiscoveryAddresses = this.inDiscoveryAddresses(d), // not already in queue
            isConnectedTo = this.isConnectedTo(d), // not already connected
            isOwnSignature = this.isOwnSignature(d.signature); // not itthis
            
          if(!inDiscoveryAddresses && !isConnectedTo && !isOwnSignature) {
            // If we haven't seen this discovery address before and we aren't
            // already connected to it, push it to our discovery queue
            if(this.debug) console.log(`\t${JSON.stringify(d)}`);
            this.discoveryAddresses.push(d);
          } else {
            if(this.debug) {
              console.log(`Not connecting to peer ${JSON.stringify(d)}`, 
                `\n\tinDiscoveryAddresses: ${inDiscoveryAddresses}`,
                `\n\tisConnectedTo: ${isConnectedTo}`,
                `\n\tisOwnSignature: ${isOwnSignature}`);
            }
          }
        }
        
        // We weren't given a port for this specific address, so we had to 
        // assign a port/ports, expanding the discovery addresses as a result.
        // As such, we call 'next()' to now discover on those expanded addresses.
        next();
        
        // Since our address was incomplete, return to prevent connecting to it (below)
        return;
      }
      
      if(this.debug)
        console.log(`Attempting connection to ${url.format(parsedAddress)}`);

      ((client) => {
        client.on('error', (error) => {
          if(this.debug)
            console.log('Connect Error: ' + error.toString());
          
          next();
        });
        
        client.on('open', () => {
          if(this.debug) {
            console.log(`Successfully connected to:\n\t` +
              `Address: ${client._socket.remoteAddress}\n\t` + 
              `Port: ${client._socket.remotePort}`);
          }
          
          client.originalAddress = peerToDiscover.address.slice(0);
          client.originalPort = parsedAddress.port;
          client.parsedAddress = url.format(parsedAddress);
          
          // Remove the address from our discoveryAddresses array
          // (We don't want to discover on the address twice...)
          // this.discoveryAddresses.splice(this.discoveryAddresses.indexOf(address),1);
          
          //Set up the connection
          this.setupConnection({ connection: client });
          
          next();
        });

        client.on('close', function clear() {});
      })(new WebSocketClient(url.format(parsedAddress)));
    };
    
    if(this.discoveryAddresses.length > 0) discoverOne();
  }

  setupConnection({ connection, request=null }) {
    if(this.debug)
      console.log("Peer.setupConnection() invoked");
      
    // We have to have a valid connection to the peer in order to continue
    if(!connection) {
      if(this.debug) {
        console.error("Peer.setupConnection: connection is null or undefined!");
      }
      return false;
    }
    
    // Some initial variables...
    let created = new Date(new Date().toUTCString()),
      active = created;
    
    // We CANNOT trust the connection until after the HELO handshake takes place
    // and we are able to verify the connection's (peer's) public key via a 'trusted'
    // message exchange. Until the said is complete, the connection cannot and will not
    // be trusted and no other messages will be sent/received other than 'helo'.
    connection.trusted = false;
    
    connection.connected = true;
    
    connection.unconfirmedMessages = [];
    connection.requireConfirmation = false;

    connection.isAlive = true;
    connection.on('pong', function() {
      this.isAlive = true;
    });
    
    if(!connection.hasOwnProperty("originalAddress")) {
      if(request && request.hasOwnProperty("httpRequest") && 
        request.httpRequest.hasOwnProperty("headers") &&
        request.httpRequest.headers.hasOwnProperty("x-forwarded-for")) {
          connection.originalAddress = request.httpRequest.headers['x-forwarded-for'];
        
          if(this.debug) {
            console.log(`Address parsed from request.httpRequest.headers['x-forwarded-for']: ` +
              `${connection.originalAddress}`);
          }
      } else if(request && request.hasOwnProperty("connection") && 
        request.connection.hasOwnProperty("remoteAddress")) {
          connection.originalAddress = request.connection.remoteAddress;
          
          if(this.debug) {
            console.log(`Address parsed from request.connection.remoteAddress: ` +
              `${connection.originalAddress}`);
          }
      } else {
        connection.originalAddress = 
          request.connection.remoteAddress.slice(0).replace(/^::ffff:(.*)$/i, "$1");
      
        if(this.debug) {
          console.log(`Address parsed from connection: ${connection.originalAddress}`);
        }
      }
    }
    
    if(!connection.hasOwnProperty("originalPort")) {
      connection.originalPort = connection._socket.remotePort;
    }
      
    // Add the connection to our list of peers
    this.peers.push({ request, connection, created, active });
    
    // Set up our message receiver event handler for every connection
    connection.on('message', (data) => {
      // Process the WebSocket message via seld.receive
      this.receive({ connection, 'message': data });
    });
    
    // Set up our error event handler for every connection
    connection.on('error', (err) => {
      connection.trusted = false;
      connection.active = new Date(new Date().toUTCString());
      
      if(this.debug) {
        console.error("Connection Error: " + err.toString());
        console.error(JSON.stringify(err));
        console.error(err.stack);
      }
    });
    
    // Set up our connection close event handler for every connection
    connection.on('close', (code) => {
      connection.trusted = false;
      connection.active = new Date(new Date().toUTCString());
      
      if(this.debug)
        console.log(`Connection closed with code: ${code}`);
          
      // Detect abnormal closure.
      if(code !== 1000) {
        if(connection.hasOwnProperty("originalAddress")) {
          let toRediscover = {
            'address': connection.originalAddress
          };

          if(connection.hasOwnProperty("peerPublicKeySignature")) {
            toRediscover.signature = connection.peerPublicKeySignature.toString('base64');
          }

          this.discoveryAddresses.push(toRediscover);
          
          // On an abnormal close, we should try to discover in order
          // to reattempt connection with the peer we lost
          /*
          if(!this.discovering && this.ready) {
            this.discover.apply(this,null);
          }
          */
        }
      }
    });
    
    if(this.debug)
      console.log("Peer.setupConnection: sending HELO to connection...");
    
    // Now it's time to perform the HELO handshake to the Connection
    // NOTE: this handshake happens BOTH ways - e.g. a HELO is responded
    // to by a HELO of our own, making the handshake in total.
    try {
      // Send HELO
      var _helo = new Message();
      
      _helo.body = {
        // We have to send our public key and public key signature (signed
        // by the ring.pem) to the connection (peer) for validation. The peer
        // will do the same for us, so we can establish trust with one another.
        'publicKey': this.publicKey.exportKey("public"),
        'signature': this.signature.toString('base64')
      };

      var heloCallback = function(err, backoff, connection, message, self) {
        if(err) {
          self.managedTimeouts.setTimeout(() => {
            connection.send(message.toString(), (err) => {
              heloCallback(err, backoff*1.5, connection, message, self);
            });
          }, backoff);
        }  
      };
      
      //Send the message
      connection.send(_helo.toString(), (err) => {
        heloCallback(err, 5000, connection, _helo, this);
      });
    } catch(e) {
      // In case of error, log the stack. Most likely, if we're here, it is
      // the result of an export error in NodeRSA (above) or a message send
      // error (connection.send).
      console.error(e.stack);
    }
  }
  
  receive({ connection, message }) {
    if(message) {
      // Convert the message to a Message class object
      message = new Message({ message });
    } else {
      // If we weren't supplied a message, let's simply return false.
      return false;
    }
    
    // Convert the header 'type' property from a number into a human-readable string
    let headerTypeString = Message.TYPE_STRING(message.header.type);
    
    if(this.debug) {
      console.log(`Incoming message '${headerTypeString}' from `+
        `${connection.remoteAddress} - ${connection.originalAddress} ` +
        `on port ${connection.originalPort}`);
    }
    
    // Cycle through our list of peers and find the peer that this message is coming from.
    // Once found, update the 'active' property to the current time (in ms) to reflect when
    // the last message was received from the peer.
    for(let p of this.peers) {
      if(connection.hasOwnProperty("originalAddress") && 
        p.connection.hasOwnProperty("originalAddress")) {
          if(JSON.stringify(connection.originalAddress) == 
            JSON.stringify(p.connection.originalAddress)) {
              if(this.debug)
                console.log("Updating peer 'active' time to current timestamp (in ms).");
                
              p.active = new Date(new Date().toUTCString());
              break;
          }
      }
    }
    
    if(message.header.type == Message.TYPES._helo) {
      onHelo.apply(this, [{ connection, message }]);
    } else if(connection.trusted) {
      // The connection has been trusted prior to be past this point (post-HELO)
      
      // Check to see if we're receiving a verification of trust message (trusted)
      if(message.header.type == Message.TYPES._trusted) {
        onTrusted.apply(this, [{ connection, message }]);
      } else if(message.header.type == Message.TYPES._confirm) {
        onConfirm.apply(this, [{ connection, message }]);
      } else if (message.header.type == Message.TYPES._peers) {
        onPeers.apply(this, [{ connection, message }]);
      } else {
        onUnknown.apply(this, [{ connection, message }]);
      }
    }
  }

  broadcast(options) {
    let msg = false;
    
    if(options instanceof Message) {
      // Support for `peer.broadcast(<Message>);`
      msg = options;
    } else if(typeof options == "string") {
      // Support for `peer.broadcast(<string>);`
      msg = new Message({
        type: Message.TYPES._message,
        body: options
      });  
    }
    
    let { message=msg, connection=false } = options || {};
    
    if(this.debug) console.log(`Peer.broadcast invoked.`);
      
    // If there are no peers to broadcast to, exit
    if(this.peers.length < 1) {
      if(this.debug)
        console.error(`ERROR: No peers to broadcast message to. Exiting.`);
      return false;
    }
    
    // If there is no message to broadcast, exit
    if(!message || typeof message == 'undefined') {
      if(this.debug)
        console.error(`ERROR: No message to broadcast or incorrect message type. Exiting.`);
      return false;
    }
    
    if(this.debug)
      console.log(`Broadcasting ${message} to ${this.peers.length} peers...`);
    
    // If the message is not a string and is not an instance of Message ...
    if(typeof message !== "string" && 
      !(message instanceof Message)) {
        // ... stringify it
        try {
          message = JSON.stringify({ message });
        } catch(e) {
          console.error(`Unknown message or circular dependency when calling JSON.stringify.`);
          return false;
        }
    }
    
    // If we weren't given a specific connection, send to all peers
    var toSendTo = !connection ? this.peers : [{ connection }];
    
    // Broadcast a message to all connected peers
    for(let p of toSendTo) {
      if(p.connection.connected) {
        if(p.connection.trusted) {
          // We need to encrypt the message with the connection's AES properties
          let messageCopyToSend = new Message({ message });
          
          /*
            If the 'requireConfirmation' flag is set on this peer, then we need to
            check back at a scheduled timeout as to whether the message has been
            received by the peers we sent the message to.
          */
          if(this.requireConfirmation && 
            messageCopyToSend.header.type !== Message.TYPES._confirm) {
              /*
                Wrap in anonymous function in order to preserve scope (pass in peer and msg -- 
                the 'timeout' function occurs much later than when 'broadcast' is called, but we
                still need to access the peer and the message in question)
              */
              (function(self, peer, msg) {
                self.managedTimeouts.setTimeout(function() {
                  let found = false;
                  
                  for(let i=0; i<peer.connection.unconfirmedMessages.length; i++) {
                    // Look to match the message in question to those in 'unconfirmedMessages'
                    if(peer.connection.unconfirmedMessages[i].header.hash == msg.header.hash
                      && peer.connection.unconfirmedMessages[i].header.timestamp.toString() == msg.header.timestamp) {
                        found = true;
                        break;
                    }
                  }
                  
                  // Message hasn't been confirmd by peer yet, try sending again...
                  if(found) {
                    self.broadcast(msg);
                  } else if(self.debug) {
                    console.info(`\tMessage [${msg.header.hash}/${msg.header.timestamp.toISOString()}] ` +
                      `already confirmed, will not be resent.`);
                  }
                }, 30000);
              })(this, p, messageCopyToSend);
          }
          
          p.connection.unconfirmedMessages.push(message);
          
          try {
            // Write the signature (signed by OUR RSA private) to the message's header
            messageCopyToSend.header.signature = 
              (this.privateKey.sign(JSON.stringify(messageCopyToSend.body))).toString('base64');
            
            // Encrypt the message body with the connection's aes-256-cbc properties
            let cipher = crypto.createCipheriv('aes-256-cbc', p.connection.key, p.connection.iv);
            let messageBodyBuffer = Buffer.from(JSON.stringify(messageCopyToSend.body));
            messageCopyToSend.body = Buffer.concat([cipher.update(messageBodyBuffer), cipher.final()]).toString('base64');
            
            var sendCallback = function(err, backoff, peer, message, self) {
              if(err) {
                if(self.debug) {
                  console.error(`ERROR (${err.code}): broadcasting message failed...`);
                  console.error(`Message will try to resend in ${backoff}ms.`);
                }
                
                self.managedTimeouts.setTimeout(() => {
                  peer.connection.send(JSON.stringify(message), (err) => {
                    sendCallback(err, backoff*1.5, peer, message, self);
                  });
                }, backoff);
              }
            };
            
            p.connection.send(JSON.stringify(messageCopyToSend), (err) => {
              sendCallback(err, 5000, p, messageCopyToSend, this);
            });
          } catch(e) {
            // Something went wrong with the encryption, most likely, so let's
            // gracefully fail and exit...
            if(this.debug) {
              console.error("ERROR: broadcast to TRUSTED connection failed. This could be " +
                "and more likely is due to an encryption error. Exiting now.");
              console.error(e.stack);
            }
          }
        } else {
          // If we do not have a trusted connection, but we are trying to establish one
          // via a HELO handshake, let the message be sent
          if(message.header.type == Message.TYPES._helo) {
            var heloCallback = function(err, backoff, connection, message, self) {
              if(err) {
                self.managedTimeouts.setTimeout(() => {
                  connection.send(message, (err) => {
                    heloCallback(err, backoff*1.5, connection, message, self);
                  });
                }, backoff);
              }  
            };
            
            p.connection.send(message, (err) => {
              heloCallback(err, 5000, connection, message, this);
            });
          } else if(this.debug) {
            console.error("ERROR: broadcast invoked with sensitive message () but " +
              "the connection is not trusted; not sending message.");
          }
        }
      } else { // p.connection.connected == FALSE
        if(this.debug) {
          console.error(`ERROR: broadcast attempted to ${p.connection.originalAddress} but ` +
            `the connection is closed!`);
        }
      }
    }
    
    // For chaining
    return this;
  }
  
  close() {
    this.ready = false;
    
    for(let p of this.peers) {
      try {
        clearTimeout(p.connection.pingTimeout);
        p.connection.close();
      } catch(e) {
        if(this.debug)
          console.error(e.stack);
      }
    }

    this.managedTimeouts.destroy();

    clearInterval(this.pingInterval);
    
    this.wsServer.close();
    this.httpsServer.close();
    
    return this;
  }
  
  isOwnSignature(s) {
    if(!s) return false;
    if(typeof s !== "string") s = s.toString("base64");
    return s == this.signature.toString("base64");
  }
  
  inDiscoveryAddresses(peer) {
    let str = JSON.stringify(peer);
    for(let i=0; i<this.discoveryAddresses.length; i++) {
      // if(this.discoveryAddresses[i].hasOwnProperty("address") &&
      //   this.discoveryAddresses[i].hasOwnProperty("signature") &&
      //   this.discoveryAddresses[i].address &&
      //   this.discoveryAddresses[i].signature &&
      //   this.discoveryAddresses[i].address.toString() == address.toString() && 
      //   this.discoveryAddresses[i].signature.toString('base64') == signature.toString()) {
      //     return true;
      // }
      if(JSON.stringify(this.discoveryAddresses[i]) == str) {
        return true;
      }
    }
    
    return false;
  }
  
  isConnectedTo({ address, signature }) {
    // Check first to make sure we aren't trying to connect to ourself...
    if(this.signature.toString('base64') == signature) return true;
    
    for(let i=0; i<this.peers.length; i++) {
      // Check if we're connected to the peer before checking if the peer is
      // the same as the one given. If all the above, return true right away
      if(this.peers[i].connection.hasOwnProperty("peerPublicKeySignature") &&
        this.peers[i].connection.peerPublicKeySignature.toString('base64') == signature) {
          return true;
      }
    }
    
    // We've only reached here as a result of not finding an active connection
    // the same as the one we're given
    return false;
  }
  
  getPeerList(signaturesToOmit) {
    let peerList = [];
    
    if(!signaturesToOmit || !Array.isArray(signaturesToOmit))
      signaturesToOmit = [];
    
    // Add list of our known peers to the body, so that, when
    // received by the other peer, it can discover those addresses
    // as well, creating a fully connected, bidirectional graph (network).
    for(let i=0; i<this.peers.length; i++) {
      if(this.peers[i].connection.hasOwnProperty("peerPublicKeySignature") && 
        this.peers[i].connection.hasOwnProperty("originalAddress")) {
          let peerPublicKeySignatureBase64 = 
            this.peers[i].connection.peerPublicKeySignature.toString('base64');
            
          if(signaturesToOmit.indexOf(peerPublicKeySignatureBase64) < 0) {
            peerList.push({
              'address': `${this.peers[i].connection.originalAddress
                .slice(0).replace(/^::ffff:(.*)$/i, "$1")}` + 
                (
                  this.peers[i].connection.originalAddress.indexOf(":") > -1 ? 
                  `` : `:${this.peers[i].connection.originalPort}`
                ),
              // 'remoteAddress': this.peers[i].connection.remoteAddress,
              'signature': peerPublicKeySignatureBase64,
              'created': this.peers[i].created,
              'active': this.peers[i].active,
              'trusted': this.peers[i].connection.trusted
            });
          }
      }
    }
    
    return peerList;
  }
  
  toString() {
    return JSON.stringify({
      'credentials': {
        'key': this.httpsKeyLocation,
        'cert': this.httpsCertLocation
      },
      'debug': this.debug,
      'discoveryAddresses': this.discoveryAddresses.concat(this.getPeerList()),
      'discoveryRange': this.range,
      'port': this.port,
      'privateKey': this.privateKeyLocation,
      'publicAddress': this.publicAddress,
      'publicKey': this.publicKeyLocation,
      'requireConfirmation': this.requireConfirmation,
      'ringPublicKey': this.ringPublicKeyLocation,
      'signature': this.signatureLocation,
      'startDiscovery': this.startDiscovery,
      'wsServerOptions': {
        'autoAcceptConnections': typeof this.wsServerOptions.autoAcceptConnections !== "undefined" ? 
          this.wsServerOptions.autoAcceptConnections : false,
        'ignoreXForwardedFor': typeof this.wsServerOptions.ignoreXForwardedFor !== "undefined" ? 
          this.wsServerOptions.ignoreXForwardedFor : false,
        'keepAlive': typeof this.wsServerOptions.keepAlive !== "undefined" ? 
          this.wsServerOptions.keepAlive : false,
        'noServer': typeof this.wsServerOptions.noServer !== "undefined" ? 
          this.wsServerOptions.noServer : false
      }
    });
  }
  
};