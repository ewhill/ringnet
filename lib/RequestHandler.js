const Message = require('./Message');

class RequestHandler {
  constructor(RequestClass, pattern) {
    if(!RequestClass) {
      throw new Error(`Must provide valid request class.`);
    }

    this._classRef = RequestClass;
    this._id = RequestClass.name;
    this._pattern = pattern;
  }

  upgrade(requestJSON) {
    let requestObj;

    if(typeof requestJSON === 'string') {
	    try {
	    	requestObj = JSON.parse(requestJSON);
	    } catch(e) {
	    	throw new Error(
	    		`Invalid request; failed to interpret request object.`);
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

				// TODO: What to do if the message object conatins insufficient 
				// or extra properties.
				for(let prop of Object.keys(requestObj[part])) {
					if(prop === 'constructor') {
						continue;
					}

					if(nonEnumerableInstance.indexOf(prop) || 
						nonEnumerableGeneric.indexOf(prop)) {
						    try {
						    	instance[prop] = requestObj[part][prop];
						    } catch(e) {
						    	// TODO: What if property isn't available/valid.
						    }
					}
				}
		}
    });

    return instance;
  }

  matches(address) {
    return this._pattern && this._pattern instanceof RegExp ? 
    	this._pattern.test(address) : this._pattern === address;
  }

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

  get id() { return this._id; }
  set id(_) { throw new Error(`Setting 'id' prohibited.`); }
  get patternString() { return this._pattern.toString(); }
}

module.exports = RequestHandler;