
class Pipe extends EventEmitter {
  constuctor(wsConnection, publicKeyBuffer, signatureBuffer, ringPublicKeyBuffer) {
    this.request_ = request;
    this.connection_ = wsConnection;

    this.publicKey_ = publicKey;
    this.signature_ = signature;
    this.ringPublicKey_ = ringPublicKey_;

    if(!this.connection_) {
      throw new Error(`Connection 'wsConnection' not provided!`);
    }

    this.connected = true;
    this.key = null;
    this.id = crypto
      .createHash('sha256')
      .update(crypto.randomBytes(32))
      .digest('hex');
    this.iv = null;
    this.trusted = false;

    this.connection_.on('close', (code) => {
      this.connected = false;
      this.trusted = false;
      this.emit('close', { connection: this, code })
    });
    
    this.connection_.on('error', (error) => {
      this.emit('error', { connection: this, error });
    });

    this.connection_.on('message', (message) => {
      this.emit('message', { connection: this, message });
    });

    this.sendHelo();

    this.trustTimeout_ = this.managedTimeouts_.setTimeout(() => {
      this.connection_.close();
    }, 30000);
  }

  /**
   * Adds connection properties and event handlers in order to start a channel 
   * of communication.
   * 
   * @param  {WebSocketClient} options.connection 
   *         The connection to set up.
   * @param  {Object} options.request 
   *         The HTTP request object. Defaults to null if not given.
   * @return {Promise}
   *         A promise which resolves when the connection is determined to be 
   *         trustworthy or rejects when the connection is determined to be 
   *         untrustworthy.
   */
  sendHelo() {
    /*
     * We CANNOT trust the connection until after the HELO handshake takes 
     * place and we are able to verify the connection's (peer's) public key via 
     * a 'trusted' message exchange. Until the said is complete, the connection 
     * cannot and will not be trusted and no other messages will be sent or 
     * received other than 'helo'.
     */
    
    /* 
     * Now it's time to perform the HELO handshake to the Connection. This 
     * handshake happens BOTH ways - e.g. a received HELO is responded to 
     * by sending a HELO, in total, making the handshake.
     *
     * We have to send our public key and public key signature (signed by the 
     * ring private key) to the connection (peer) for validation. The peer 
     * will do the same for this peer, so both can establish trust with one 
     * another.
     */
    
    let heloMessage = new HeloRequest({
      type: Message.TYPES._helo,
      body: {
        'publicKey': this.publicKey_.toString('utf8'),
        'signature': this.signature_.toString('hex')
      }
    });

    return this.send(heloMessage);
  }

  async send(message) {
    if(!(message instanceof HeloRequest)) {
      if(this.trusted) {
        try {
          message.header.signature = 
            (this.peerRSAKeyPair_.sign(JSON.stringify(message.body)))
              .toString('hex');

          const cipher = 
            crypto.createCipheriv('aes-256-cbc', this.key, this.iv);

          const messageBodyBuffer = Buffer.from(JSON.stringify(message.body));

          const encryptedMessageBodyBuffer = 
            Buffer.concat([cipher.update(messageBodyBuffer), cipher.final()]);

          message.body = encryptedMessageBodyBuffer.toString('base64');
        } catch(e) {
          throw new Error(`Could not encrypt message!`);
        }
      } else {
        throw new Error(`Cannot send message before connection is trusted!`);
      }
    }

    return new Promise((resolve, reject) => {
      this.connection_.send(message.toString(), (err) => {
        if(err) {
          return reject(err);
        }
        return resolve({ connection: this, message });
      });
    });
  }
}