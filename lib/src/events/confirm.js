

module.exports = function({ connection, message}) {
  if(!this.requireConfirmation) return;
        
  /* istanbul ignore if */
  if(this.debug)
    console.log("Received message confirmation from peer");
  
  // Receive confirmation that peer has received a message prior sent
  if(message.hasOwnProperty("header") && 
    message.header.hasOwnProperty("confirm") &&
    typeof message.header.confirm == "object" &&
    message.header.confirm.hasOwnProperty("hash") &&
    typeof message.header.confirm.hash == "string" && 
    message.header.confirm.hasOwnProperty("timestamp") &&
    typeof message.header.confirm.timestamp == "string") {
      
      /* istanbul ignore if */
      if(this.debug) {
        console.log(`\tPeer would like to confirm receipt of message [` +
          `${message.header.confirm.hash}/${message.header.confirm.timestamp}]`);
      }
        
      // Let's try to find the matching message (by hash)
      for(let i=connection.unconfirmedMessages.length-1; i>=0; i--) {
        // Check our 'unconfirmedMessages' hashes against 'confirm' message header hash
        if(connection.unconfirmedMessages[i].header.hash == message.header.confirm.hash
          && connection.unconfirmedMessages[i].header.timestamp.toISOString() == 
          message.header.confirm.timestamp) {
            // We have a match, confirm the message's receipt by removing it from 
            // 'unconfirmedMessages' array.
            connection.unconfirmedMessages.splice(i,1);
            
            /* istanbul ignore if */
            if(this.debug)
              console.log(`\tMessage [${message.header.confirm.hash}/` +
                `${message.header.confirm.timestamp}] has been confirmed.`);
              
            break;
        }
      }
  }
}