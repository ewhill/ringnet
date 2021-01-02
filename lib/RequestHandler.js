const Message = require('./Message');

class RequestHandler {
  constructor(RequestClass) {
    if(!RequestClass) {
      throw new Error(`Must provide valid request class.`);
    }

    this._id = RequestClass.name;
    this._classRef = RequestClass;
  }

  upgrade(requestJSON) {
    let requestObj;

    if(typeof requestJSON === 'string') {
	    try {
	      requestObj = JSON.parse(requestJSON);
	    } catch(e) {
	      throw new Error(`Invalid request; failed to interpret request object.`);
	    }
	} else if(typeof requestJSON === 'object') {
		requestObj = requestJSON;
	}

    const instance = new this._classRef();

    ['header', 'body'].map((part) => {
      if(requestObj.hasOwnProperty(part) && 
        typeof requestObj.body === 'object') {
          const nonEnumerableGeneric = 
            Object.getOwnPropertyNames(Message.prototype);
          const nonEnumerableInstance = 
            Object.getOwnPropertyNames(this._classRef.prototype);

          // TODO: What to do if the message object conatins insufficient or 
          // extra properties.
          for(let prop of Object.keys(requestObj[part])) {
            if(prop === 'constructor') {
              continue;
            }

            if(nonEnumerableInstance.indexOf(prop) || 
              nonEnumerableGeneric.indexOf(prop)) {
                try {
                  instance[prop] = requestObj[part][prop];
                } catch(e) {
                  // TODO: What to do if the property isn't available / valid.
                }
            }
          }
      }
    });

    return instance;
  }

  get id () { return this._id; }
  set id(_) { throw new Error(`Setting 'id' prohibited.`); }

  to(handler) {
    if(!(handler instanceof Function)) {
      throw new Error(`Invalid type for parameter 'handler'.`);
    }

    this._handler = handler;
  }

  invoke(message, connection) {
    if(this._handler) {
      this._handler(message, connection);
    }
  }
}

module.exports = {
	RequestHandler
};