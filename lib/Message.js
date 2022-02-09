const crypto = require('crypto');

class Message {
  constructor(options = {}) {
    const { body = {} } = options;

    this._timestamp = (new Date());
    this.body = body;
  }

  get body() {
    const self = this;
    return new Proxy(this._body, {
      set(target, prop, value) {
        if(!target.hasOwnProperty('prop') && target[prop] !== value) {
          target[prop] = value;
          self.calculateHash();
        }
        return true;
      },
    });
  }
  set body(value) {
    this._body = value;
    this.calculateHash();
  }

  get hash() {
    return this._hash;
  }
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
        .update(JSON.stringify(this._body))
        .digest('hex');
  }

  static from(message) {
    if(!(message instanceof Message)) {
      throw new Error(`Parameter 'message' is not of type 'Message'!`);
    }

    message.calculateHash();

    const ret = new Message();
    const { header, body } = message;

    if(header) {
      const { hash, timestamp, signature } = header;

      if(hash) {
        ret._hash = hash;
      }

      if(timestamp) {
        ret._timestamp = timestamp;
      }

      if(signature) {
        ret._signature = signature;
      }
    }

    if(body) {
      ret.body = body;
    }

    return ret; 
  }
  
  toString() {
    return JSON.stringify({ header: this.header, body: this._body });
  }
}

module.exports = Message;