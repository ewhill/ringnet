

module.exports = function({ connection, message }) {
  // The message needs to have both iv and key properties in order to upgrade 
  // the connection's message encryption scheme to AES-256-CBC as opposed to 
  // the RSA encryption used in the handshake.
  if(message.body.hasOwnProperty("iv") && message.body.hasOwnProperty("key")) {
    // We need to try to take the key and iv the peer has given us and decrypt them
    // using our private key (since they were encrypted using our public key post-HELO)
    try {
      connection.peerIv = this.privateKey.decrypt(
        Buffer.from(message.body.iv, 'base64'));

      connection.peerKey = this.privateKey.decrypt(
        Buffer.from(message.body.key, 'base64'));
      
      this.emit('connection', { connection });
    } catch(e) {
      /* istanbul ignore if */
      if(this.debug) {
        console.error("ERROR: 'trusted' message received but our private key " +
          "could not decrypt its contents. Exiting now.");
      }
          
      // TODO: Should we add this peer back to discoveryAddresses then? Try again?
      return false;
    }
    
    if(message.body.hasOwnProperty("requireConfirmation") && 
      typeof message.body.requireConfirmation == "boolean") {
        /* istanbul ignore if */
        if(this.debug) {
          console.log(`Peer at ${connection.remoteAddress} - ` +
            `${connection.originalAddress} on port ${connection._socket.remotePort} ` +
            `${(message.body.requireConfirmation ? "is" : "is NOT")}` + 
            ` requesting message confirmation.`);
        }
          
        connection.requireConfirmation = message.body.requireConfirmation;    
    }
    
    if(message.body.hasOwnProperty("listening") && 
      typeof message.body.listening == "object") {
        if(message.body.listening.hasOwnProperty("address")) {
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Peer reports it is listening on address ` +
              `${message.body.listening.address}; Peer \`originalAddress\` attribute ` +
              `will be updated to reflect so.`);
          }
          
          if(typeof message.body.listening.address == "string") {
            connection.originalAddress = message.body.listening.address;
          } else {
            /* istanbul ignore if */
            if(this.debug) {
              console.log(`Peer reports it is listening on an invalid address; not ` +
                `setting connection original address as a result.`);
            }
          }
        }
      
        if(message.body.listening.hasOwnProperty("port")) {
          let toParse = message.body.listening.port;
          
          if(typeof message.body.listening.port !== "number") {
            try {
              toParse = parseInt(toParse);
            } catch(e) {
              toParse = message.body.listening.port;
            }
          }
          
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`Peer reports it is listening on port ${toParse}; ` +
              `Peer \`originalPort\` attribute will be updated to reflect so.`);
          }
          
          connection.originalPort = toParse;
        }
    }
    
    // Check to see if the verification of trust (trusted) message contains a list
    // of known peers to this peer. This is done for discovery.
    if(message.body.hasOwnProperty("peers") && Array.isArray(message.body.peers)) {
      // Create a variable to compare to the length of discoveryAddresses later
      let lengthBefore = this.discoveryAddresses.length;
      
      for(let i=0; i<message.body.peers.length; i++) {
        // Check for leading '::ffff:', if so, we have IPv4 address and can strip it
        if(message.body.peers[i].address.indexOf("::ffff:") === 0)
          message.body.peers[i].address = message.body.peers[i].address.slice(7);
        
        // If we haven't seen a peer in the list of peers that this peer has given
        // us (wow, what a mouthful!), then add it to our discoveryAddresses array
        // for discovery at a later time
        if(!this.inDiscoveryAddresses(message.body.peers[i]) && // not already in queue
          !this.isConnectedTo(message.body.peers[i]) && // not already connected
          !this.isOwnSignature(message.body.peers[i].signature)) { // not itself
            /* istanbul ignore if */
            if(this.debug) {
              console.log(`Peer gave new unknown peer to discover: ` +
                `${JSON.stringify(message.body.peers[i])}`);
            }
            
            this.discoveryAddresses.push(message.body.peers[i]);
        }
      }
      
      // Check if we've added any addresses to discover
      if(this.discoveryAddresses.length > lengthBefore) {
        this.discover();
      }
    }
  } else {
    /* istanbul ignore if */
    if(this.debug) {
      console.error("ERROR: 'trusted' message received but message body " +
        "does not contain correct content. Exiting now.");
    }
          
    // TODO: Should we add this peer back to discoveryAddresses then? Try again?
  }
}