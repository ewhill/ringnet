const crypto = require('crypto');

class Message {
  constructor(options = {}) {
    const { body = {} } = options;

    this._timestamp = (new Date());
    this.body = body;
  }

  get body() { return this._body; }
  set body(value) {
    this._body = value;
    this.calculateHash();
  }

  get hash() { return this._hash; }
  set hash(value) {
    throw new Error(`Property 'hash' is not allowed to be set.`);
  }

  set header(value) {
    const { hash, timestamp, signature } = value;

    if(hash) {
      throw new Error(`Property 'hash' is not allowed to be set.`);
    }

    if(timestamp) {
      this.timestamp = timestamp;
    }

    if(signature) {
      this._signature = signature;
    }
  }
  get header() {
    return {
      timestamp: this.timestamp,
      hash: this.hash,
      signature: this._signature,
    };
  }

  get timestamp() {return this._timestamp; }
  set timestamp(value) {
    if(typeof value === 'string' || typeof value === 'number') {
      value = new Date(value);
    }

    this._timestamp = value;
  }

  calculateHash() {
    this._hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(this.body))
        .digest('hex');
  }

  from(message) {
    if(message instanceof Message) {
      const { header, body } = message;

      if(header) {
        const { hash, timestamp } = header;

        if(hash) {
          this._hash = hash;
        }

        if(timestamp) {
          this._timestamp = timestamp;
        }
      }

      if(body) {
        this.body = body;
      }
    } else {
      throw new Error(`Parameter 'message' is not of type 'Message'!`);
    }
  }

  clone() {
    throw new Error(`Method 'clone()' not implemented for base class.`);
  }
  
  toString() {
    return JSON.stringify({ header: this.header, body: this.body });
  }
}

module.exports = Message;