const { PeerMessage } = require('./message');

class PeerMessageQueue extends Array {
  constructor(peerMessages) {
    super();
    this.addItems(peerMessages);
  }
  
  addItems(obj) {
    if(typeof obj == "object" && Array.isArray(obj)) {
      for(let i=0; i<obj.length; i++) {
        if(obj[i] instanceof PeerMessage) {
          this.push(obj[i]);
        }
      }
    } else if(typeof obj == "object" && obj instanceof PeerMessage) {
      this.push(obj);
    } else {
      // Not given an array of PeerMessages or a PeerMessage to start
    }
  }
  
  concat(pmq) {
    if(pmq instanceof PeerMessageQueue) {
      for(let i=0; i<pmq.queue.length; i++) {
        if(pmq[i] instanceof PeerMessage) {
          this.push(pmq[i])
        }
      }
    }
  }
  
  push(obj) { this.addItems(obj); }
}

module.exports = PeerMessageQueue;