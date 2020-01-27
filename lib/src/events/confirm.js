

module.exports = function({ connection, message}) {
  /* istanbul ignore if */
  if(!this.requireConfirmation) {
    return;
  }
  
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
        console.log(`\tPeer would like to confirm receipt of message ` + 
          `[${message.header.confirm.hash}/` + 
          `${message.header.confirm.timestamp}]`);
      }
        
      /*
       * Let's try to find the matching message (by hash) in the 
       * 'unconfirmedMessages' array.
       */
      for(let i=connection.unconfirmedMessages.length-1; i>=0; i--) {
        const hashesAreEqual = 
          connection.unconfirmedMessages[i].header.hash == 
            message.header.confirm.hash;

        const timestampsAreEqual = 
          connection.unconfirmedMessages[i].header.timestamp.toISOString() == 
            message.header.confirm.timestamp;

        if(hashesAreEqual && timestampsAreEqual) {
          /* 
           * Confirm message receipt by removing it from 'unconfirmedMessages' 
           * and pushing it to the 'confirmedMessages'.
           */
          connection.confirmedMessages.push(
            connection.unconfirmedMessages.splice(i,1)[0]);
          
          /* istanbul ignore if */
          if(this.debug) {
            console.log(`\tMessage [${message.header.confirm.hash}/` +
              `${message.header.confirm.timestamp}] has been confirmed.`);
          }
            
          break;
        }
      }
  }
}