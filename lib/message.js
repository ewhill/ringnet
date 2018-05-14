//message.js

const crypto = require('crypto');

const PEER_MESSAGE_TYPES = {
  'helo': 0,
  'trusted': 1,
  'update': 2,
  'peers': 3
};

const PEER_MESSAGE_STRING = (type) => {
  // Determine message type (as string) and output to console
  let messageTypeString = `(unknown: ${type})`;
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
    var { message=false, messageType=PEER_MESSAGE_TYPES.helo } = options || {};
    
    this.defaults({ messageType });
    
    // If we were supplied with a constructor argument 'message'...
    if(message) {
      // Try to parse the given 'message'
      var res = this.parse({ message });
      
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
  
  defaults({ messageType=PEER_MESSAGE_TYPES.helo }) {
    // Set the header to defaults
    this.header = {
      'type': messageType,
      'timestamp': (new Date()),
      'hash': (new Array(64)).map(() => { return "0"; }).join("")
    };
    
    // Set the body to empty object as defualt
    this.body = {};
    
    // For chaining...
    return this;
  }
  
  toString() {
    // Make sure our hash is up-to-date...
    this.header.hash = crypto.createHash('sha256').update(JSON.stringify(this.body)).digest('hex');
    
    // 'this' is just an object, so stringify it using JSON lib and return
    return JSON.stringify(this);
  }
  
  parse({ message }) {
    // JSON.parse can error out, so let's do this gracefully...
    try {
      // If we're being passed a message as a string, we need
      // to first try and JSON.parse the message to an object
      if(typeof message == 'string') {
        message = JSON.parse(message);
      }
      
      // Cycle through the properties in 'message'
      for(var i in message) {
        // Check for matching structure, 'message' against 'this'
        if(message.hasOwnProperty(i) && this.hasOwnProperty(i)) {
          // Matching structure, clone the message's property to us
          this[i] = message[i];
        }
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

module.exports = {
  'PeerMessage': PeerMessage,
  'PEER_MESSAGE_TYPES': PEER_MESSAGE_TYPES,
  'PEER_MESSAGE_STRING': PEER_MESSAGE_STRING
};