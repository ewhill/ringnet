const { Peer, Message } = require('../index.js');

const { colors, fakeLogger, sink } = require('./utils');

const createPeerProxy = ({
		peers,
	 	messageClasses,
	 	logger=sink
	 }) => {
		const isPeersValid = 
			Array.isArray(peers) && 
			peers.length > 0 &&
			peers.reduce((prev, curr) => prev && (curr instanceof Peer));
		const isMessageClassesValid = 
			Array.isArray(messageClasses) && 
			messageClasses.length > 0 &&
			messageClasses.reduce((prev, curr) => 
				prev && (curr instanceof Message));
		if (!isPeersValid || !isMessageClassesValid) {
				throw new Error(`Invalid options for class PeerProxy!`);
		}

		for (let i=0; i<peers.length; i++) {
			const peer = peers[i];
			const others = peers.slice(0, i).concat(peers.slice(i+1));
			for (let other of others) {
				for (let messageClass of messageClasses) {
					logger.log(`Creating proxy for ${messageClass.name}...`);

					peer.bind(messageClass).to((message, connection) => {
						if (!other.isReady) {
							throw new Error(
								'Cannot proxy message; destination peer is ' +
								'not ready!');
						}
						logger.log(`Proxying ${messageClass.name}...`);
						other.broadcast(message);
				    });
				}
			}
		}
	};

module.exports = { createPeerProxy };