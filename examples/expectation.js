"use strict";

module.exports = class Expectation {
  constructor(format) {
    // We will send back the 'args' variable as a return
    var args = {};
    
    for(var i=0; i<process.argv.length; i++) {
      let parts = process.argv[i].toString();
      let name = parts;
      let value = true;
      
      if(parts.indexOf("=")) {
        parts = parts.split("=");
        name = parts[0].slice(1),
        value = parts.length > 1 ? parts.slice(1).join("=") : true;
      }
      
      if(parts[0][0] == "-") {
        if(parseInt(format[name]) === format[name]) {
          //format[name] is INT
          value = parseInt(value);
        } else if(parseFloat(format[name]) === format[name]) {
          //format[name] is FLOAT
          value = parseFloat(value);
        } else if(Array.isArray(format[name])) {
          value = value.split(format[name][0] || ",");
        } else if(typeof format[name] == 'object') {
          try {
            value = JSON.parse(value);
          } catch(e) {}
        }
        
        args[name] = value;
      }
    }
    
    this.args = args;
    return this;
  }
};