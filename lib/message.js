//message.js

const crypto = require('crypto');

const PEER_MESSAGE_TYPES = {
  '_helo': 0,
  '_trusted': 1,
  '_message': 2,
  '_confirm': 3,
  '_peers': 4
};

const PEER_MESSAGE_STRING = (type) => {
  // Determine message type (as string) and output to console
  let messageTypeString = type;
  let keys = Object.keys(PEER_MESSAGE_TYPES);
  
  for(let i=0; i<keys.length; i++) {
    if(PEER_MESSAGE_TYPES[keys[i]] == type) {
      messageTypeString = keys[i];
      break;
    }
  }
  
  return messageTypeString;
};

class PeerMessage {
  constructor(options) {
    let msg = false, bdy = {};
    
    if(options instanceof PeerMessage) {
      // Cloning support: `new PeerMessage(<PeerMessage>);`
      msg = options;
    } else if(typeof options == "string") {
      // String support: `new PeerMessage(<string>);`
      bdy = options;
    }
    
    let { message=msg, type, body=bdy } = options || {};
    
    this.defaults({ type, body });
    
    // If we were supplied with a constructor argument 'message'...
    if(message) {
      // Try to parse the given 'message'
      let res = this.parse({ message });
      
      if(res) {
        // Successfully parsed the message
      } else {
        // Something may have gone wrong parsing 'message'
        console.warn("WARNING: PeerMessage 'message' not successfully " +
          "parsed. PeerMessage object may be unstable and result in errors.");
      }
    }
    
    // For chaining...
    return this;
  }
  
  defaults({ type=PEER_MESSAGE_TYPES._helo, body="" }) {
    // Set the header to defaults
    this.header = {
      'type': type,
      'timestamp': (new Date()),
      'hash': (new Array(65)).join("")
    };
    
    // Set the body to empty object as defualt
    this.body = body;

    this.calculateHash();
    
    // For chaining...
    return this;
  }

  calculateHash() {
    this.header.hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.body))
      .digest('hex');

    // For chaining...
    return this;
  }
  
  toString() {
    // Make sure our hash is up-to-date...
    this.calculateHash();
    
    // 'this' is just an object, so stringify it using JSON lib and return
    return JSON.stringify({
      header: this.header,
      body: this.body
    });
  }
  
  parse({ message }) {
    // JSON.parse can error out, so let's do this gracefully...
    try {
      // If we're being passed a message as a string, we need
      // to first try and JSON.parse the message to an object
      if(typeof message == 'string') {
        message = JSON.parse(message);
      }
      
      if(typeof message.header !== "undefined") {
        this.header = message.header;
      }

      if(typeof message.body !== "undefined") {
        this.body = message.body;
      }
      
      // Success parsing the message, return the message to caller
      return message;
    } catch(e) {
      // We've experienced an error parsing the message, return false
      // to signal the failure to the caller
      return false;
    }
  }
}

module.exports = PeerMessage;
module.exports.PEER_MESSAGE_TYPES = PEER_MESSAGE_TYPES;
module.exports.PEER_MESSAGE_STRING = PEER_MESSAGE_STRING;