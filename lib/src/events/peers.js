const Message = require('../message');

module.exports = function({ connection, message }) {
	// Create and send a verification of trust message
    let peers = new Message();
    peers.header.type = Message.TYPES._peers;
    peers.body = { 'peers': this.getPeerList() };
    peers.header.signature = this.privateKey.sign(JSON.stringify(peers.body));
    
    var peersCallback = function(err, backoff, connection, message, self) {
      if(err) {
        /* istanbul ignore if */
        if(self.debug) {
          console.error(`ERROR (${err.code}): Failed to send peers response message.`);
          console.error(`Message will be resent in ${backoff}ms.`);
        }

        self.managedTimeouts.setTimeout(() => {
          connection.send(message.toString(), (err) => {
            peersCallback(err, backoff*1.5, connection, message, self);
          });
        }, backoff);
      }
    };

    // Send the message
    connection.send(peers.toString(), (err) => {
      peersCallback(err, 5000, connection, peers, this);
    });
}