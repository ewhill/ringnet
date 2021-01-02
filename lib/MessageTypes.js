
module.exports = ((messageTypes) => {
	const DEFAULT_MESSAGE_TYPES = {
		'_helo': 0,
		'_trusted': 1,
		'_peers': 2
	};

	// Merge the given message types with the default message types.
	const MESSAGE_TYPES = {
		...messageTypes,
		...DEFAULT_MESSAGE_TYPES
	};

	return {
		...MESSAGE_TYPES,
		toString: (value) => {
			for(let key of Object.keys(MESSAGE_TYPES)) {
				if(MESSAGE_TYPES[key] === value) {
					return key;
				}
			}

			throw new Error(`No message defined for given value: ${value}!`);
		},
		fromString: (type) => {
			if(MESSAGE_TYPES.hasOwnProperty(type)) {
				return MESSAGE_TYPES[type];
			} else {
				throw new Error(`No message defined for given type ${type}`);
			}
		}
	};
});