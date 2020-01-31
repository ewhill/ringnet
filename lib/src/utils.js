

module.exports = {
	expandRange: function(range) {
		const size = range[1]-range[0]+1;
		return [...Array(size)].map((e,i) => (range[0] + i));
	},
	getClassName: function(o) {
		let r = /function (.{1,})\(/.exec(o.constructor.toString());
		return (r && r.length > 1 ? r[1] : false);
	},
	isValidRange: function(range) {
		return range && Array.isArray(range) && range.length == 2 && 
			typeof range[0] === 'number' && typeof range[0] === 'number' && 
			range[0] <= range[1];
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

		let [
				,
				protocol, 
				host, 
				port, 
				path, 
				query, 
				hash
			] = urlRegex.exec(url);

		let hasProtocol = protocol !== undefined,
		hasPath = path !== undefined,
		hasPort = port !== undefined;

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
	
		/*
		console.log(`Discovery Address` + 
		  `\n\tProtocol: ${(hasProtocol ? "✔" : "✖")}` +
		  `\n\tPath:     ${(hasPath ? "✔" : "✖")}` +
		  `\n\tPort:     ${(hasPort ? "✔" : "✖")}`);
		*/

		return {
				'protocol': (hasProtocol ? protocol : "wss:"),
				'slashes': true,
				'hostname': (host !== null ? host : "localhost"),
				'host': null,
				'port': (hasPort ? port : ""),
				'pathname': (hasPath ? path : "")
			};
	}
};