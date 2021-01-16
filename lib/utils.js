
const fs 	= require('fs');
const path 	= require('path');

class NoSuchFileError extends Error {
  constructor(message) {
    super(message); 
    this.name = "NoSuchFile";
  }
}

module.exports = {
	expandRange: function(start, end) {
		const size = (end - start) + 1;
		return [ ...Array(size) ].map((e,i) => (start + i));
	},
	// parseAddressFromRequest: function(request) {
	// 	if(request) {
	// 		const hasHttpRequest = request.hasOwnProperty("httpRequest");
	// 		const httpRequestHasHeaders = 
	// 			hasHttpRequest &&
	// 			request.httpRequest.hasOwnProperty("headers");
	// 		const hasXForwardedFor = 
	// 			hasHttpRequest &&
	// 			request.httpRequest.headers.hasOwnProperty("x-forwarded-for");

	// 		const hasConnection = request.hasOwnProperty("connection");
	// 		const connectionHasRemoteAddress = 
	// 			hasConnection &&
	// 			request.connection.hasOwnProperty("remoteAddress")

	// 		if(hasHttpRequest && httpRequestHasHeaders && hasXForwardedFor) {
	// 			return request.httpRequest.headers['x-forwarded-for'];
	// 		} else if(hasConnection && connectionHasRemoteAddress) {
	// 			return request.connection.remoteAddress;
	// 		}
	// 	}

	// 	throw new Error(`Could not parse address from request!`);
	// },
	isValidRange: function(start, end) {
		return typeof start === 'number' && typeof end === 'number' && 
			start <= end;
	},
	checkFiles(checks, logger=console) {
	    return new Promise((resolve, reject) => {
	      for(let check of checks) {
	        logger.log(`Checking for ${check.description} at ` + 
	          `'${check.location}'...`);
	          
	        // Make sure we have all the files necessary.
	        fs.exists(check.location, (err) => {
	            if(err) {
	              return reject(new NoSuchFileError(`Invalid ` + 
	                `${check.description} file location (given: ` + 
	                `'${check.location}').`));
	            }
	          });
	      }

	      return resolve();
	    });
	  },
	readFileAsync(fileLocation) {
		return new Promise((resolve, reject) => {
			if(!fileLocation) {
				return reject(new Error(`Invalid path!`));
			}

			const absolutePath = path.resolve(fileLocation);
			if(fs.existsSync(absolutePath)) {
				fs.readFile(absolutePath, 'utf8', (err, data) => {
					if(err) {
						return reject(err);
					}
					return resolve(data);
				});
			} else {
				const noSuchFileError = 
					new NoSuchFileError(
						`File does not exist: '${fileLocation}'!`);
				return reject(noSuchFileError);
			}
		});
	},
	parseUrl: function(url) {
		let urlRegex = new RegExp (
			// Start of the line:
			"^" + 
			// Protocol:
			"(?:(?:([^\\s\\:]+)\\:\\\/\\/)?(?:\\/\\/)?)?" + 
			// Host:
			"([^\\s\\:\\/]+)" +
			// Port:
			"(?:\:([0-9]+))?" + 
			// Path ():
			"((?:[\\/\\\\](?:[a-z0-9.\\-_~!$&'\"()*+,;=:\\@]|\\%[0-9a-f]{2})+)*)?" + 
			// Trailing slash:
			"[\\/\\\\]?" + 
			// Query parameters:
			"(\\?[^#\\s]*|\\?)?" + 
			// Hash:
			"(\\#[^\\s]*)?" + 
			// End of the line:
			"$", 
			// Case insensitive, multiline
			'im'
		);

		let [, protocol, host, port, path, query, hash ] = urlRegex.exec(url);

		let hasProtocol = protocol !== undefined;
		let hasPath = path !== undefined;
		let hasPort = port !== undefined;

		if(hasPort) {
			/* istanbul ignore next */
			try {
				port = parseInt(port);
			} catch(e) {
				hasPort = false;
			}
		}

		/* 
		* The NodeJS URL library is very strange... It's string output, when 
		* 'format' is called with an object having the 'host' property as the 
		* parameter, does not contain the port. So, to work around this, a 
		* temporary object is used for parsing, and a url object is made up on 
		* the fly with it's 'host' property set to null in order for the port to 
		* be in the string output of 'format()'.
		* 
		* See https://github.com/nodejs/node/issues/12067 for more details.
		*/
	
		return {
			'protocol': (hasProtocol ? protocol : "wss:"),
			'slashes': true,
			'hostname': (host !== null ? host : "localhost"),
			'host': null,
			'port': (hasPort ? port : ""),
			'pathname': (hasPath ? path : "")
		};
	},
	stripIpv4Prefix: function(address) {
		return address.slice(0).replace(/^::ffff:(.*)$/i, "$1");
	},
	utcTimestamp: function() {
		return new Date(new Date().toUTCString());
	},
	NoSuchFileError,
};