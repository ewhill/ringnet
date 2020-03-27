

module.exports = function({ connection, message }) {
  /*
   * The message needs to have both iv and key properties in order to upgrade 
   * the connection's message encryption scheme to AES-256-CBC as opposed to 
   * the RSA encryption used in the handshake.
   */
  /* istanbul ignore else */
  if(message.body.hasOwnProperty("iv") && message.body.hasOwnProperty("key")) {
    /*
     * We need to try to take the key and iv the peer has given us and decrypt 
     * them using our private key (since they were encrypted using our public 
     * key post-HELO).
     */
    try {
      connection.peerIv = 
        this.peerRSAKeyPair_.decrypt(Buffer.from(message.body.iv, 'base64'));

      connection.peerKey = 
        this.peerRSAKeyPair_.decrypt(Buffer.from(message.body.key, 'base64'));

      if(this.untrustedConnections_.hasOwnProperty(connection.id)) {
        this.untrustedConnections_[connection.id].resolve(connection);
      }
      
      if(typeof this.reservedEventHandlers_.connection === 'function') {
        this.reservedEventHandlers_.connection.apply(this, [{ connection }]);
      }
    } catch(e) {
      /* istanbul ignore if */
      if(this.isDebugEnabled_) {
        console.error(`'trusted' message received but given peer private ` + 
          `key could not decrypt its contents!`);
      }

      if(this.untrustedConnections_.hasOwnProperty(connection.id)) {
        this.untrustedConnections_[connection.id].reject(connection);
      }
      
      return false;
    }
    
    if(message.body.hasOwnProperty('listening') && 
      typeof message.body.listening === 'object') {
        if(message.body.listening.hasOwnProperty('address')) {
          /* istanbul ignore if */
          if(this.isDebugEnabled_) {
            console.log(`Peer reports it is listening on address ` +
              `${message.body.listening.address}; Peer \`originalAddress\` ` + 
              `attribute will be updated to reflect so.`);
          }
          
          if(typeof message.body.listening.address === 'string') {
            connection.originalAddress = message.body.listening.address;
          } else {
            /* istanbul ignore if */
            if(this.isDebugEnabled_) {
              console.log(`Peer reports it is listening on an invalid ` + 
                `address; not setting connection original address as a ` + 
                `result.`);
            }
          }
        }
      
        if(message.body.listening.hasOwnProperty('port')) {
          let toParse = message.body.listening.port;
          
          if(typeof message.body.listening.port !== 'number') {
            try {
              toParse = parseInt(toParse);

              if(isNaN(toParse)) {
                throw new Error("Port is NaN!");
              }

              /* istanbul ignore if */
              if(this.isDebugEnabled_) {
                console.log(`Peer reports it is listening on port ` + 
                  `${toParse}; Peer 'originalPort' attribute will be ` + 
                  `updated to reflect so.`);
              }

              connection.originalPort = toParse;
            } catch(e) {}
          } else {
            connection.originalPort = toParse;
          }
        }
    }
    
    /*
     * Check to see if the verification of trust (trusted) message contains a 
     * list of known peers to this peer. This is done for discovery.
     */
    if(message.body.hasOwnProperty('peers') && 
      Array.isArray(message.body.peers)) {
        /* istanbul ignore if */
        if(this.isDebugEnabled_) {
          console.log(message.body.peers);
        }

        this.parseDiscoveryAddresses(message.body.peers);
        this.discover();
    }
  } else {
    /* istanbul ignore if */
    if(this.isDebugEnabled_) {
      console.error(`ERROR: 'trusted' message received but message body ` +
        `does not contain correct content. Exiting now.`);
    }

    if(this.untrustedConnections_.hasOwnProperty(connection.id)) {
      this.untrustedConnections_[connection.id].reject(connection);
    }
  }
}