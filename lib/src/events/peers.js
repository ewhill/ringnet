const Message = require('../message');

module.exports = function({ connection, message }) {
  let peers = new Message({
    type: Message.TYPES._peers,
    body:  {
      'peers': this.getPeerList()
    }
  });

  peers.header.signature = 
    (this.peerRSAKeyPair.sign(JSON.stringify(peers.body))).toString('hex');
  
  var peersCallback = function(err, backoff, connection, message, self) {
    if(err) {
      /* istanbul ignore if */
      if(self.debug) {
        console.error(`ERROR (${err.code}): Failed to send peers response!`);
        console.error(`Attempting to resend response in ${backoff}ms.`);
      }
      
      self.managedTimeouts.setTimeout(() => {
          connection.send(message.toString(), (err) => {
            peersCallback(err, backoff*1.5, connection, message, self);
          });
        }, backoff);
    }
  };
  
  connection.send(peers.toString(), (err) => {
      peersCallback(err, 5000, connection, peers, this);
    });
}