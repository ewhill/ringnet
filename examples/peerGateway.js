const crypto = require('crypto');
const fs = require('fs');
const url = require('url');
const https = require('https');

const { Peer, Message } = require('../index.js');
const Server = require('../lib/Server.js');

// ----------------------------------------------
// ----------------------------------------------

class TextMessage extends Message {
  constructor(options = {}) {
    super();
    const { text='' } = options;
    this.body = { text };
  }

  clone() {
    return new TextMessage({ text: this.text });
  }

  get text() { return this.body.text; }
  set text(value) { this.body = { ...this.body, text: value }; }
}

const sink = () => {};
const sinkLogger = { error: sink, info: sink, log: sink, warn: sink };
const keyNames = ['first', 'second', 'third' ];
const nPeers = 3;
let peers = {};

const httpServer = https.createServer({
    key: fs.readFileSync('https.key.pem'),
    cert: fs.readFileSync('https.cert.pem')
});

for(let i=0; i<nPeers; i++) {
    let options = {
        signaturePath: `${keyNames[i]}.peer.signature`,
        publicKeyPath: `${keyNames[i]}.peer.pub`,
        privateKeyPath: `${keyNames[i]}.peer.pem`,
        ringPublicKeyPath: ".ring.pub",
        httpsServerConfig: {
            mode: Server.MODES.PASS,
            server: httpServer,
        },
        wsServerConfig: {
            noServer: true,
        },
        logger: sinkLogger,
    };

    let peer = new Peer(options);
    const address = crypto.randomBytes(4).toString('hex');

    peer.bind(TextMessage).to((message, connection) => {
            console.log(`${address} received message from ` + 
                `${connection.address} which says: "${message.text}"`);
        });

    peers[address] = peer;
}

// ----------------------------------------------
// ----------------------------------------------

class RingnetGateway {
    constructor({
        httpServer  = false,
        logger      = console,
        map         = {},
        port        = 26780
    }) {
        this.logger = logger;
        this.map = map;
        this.port = port;
        this.server = httpServer;

        if(this.server) {
            this.server.on('upgrade', (request, socket, head) => {
                    this.onUpgrade(request, socket, head);
                });
            this.server.listen(this.port, () => {
                    this.onListen();
                });
        }
    }

    onListen() {
        this.logger.log(`Ringnet gateway listening on port ${this.port}`);
        this.logger.log(`Mappings:`);
        for(let route of Object.keys(this.map)) {
            this.logger.log(`\t${route}`);
        }
    }

    onUpgrade(request, socket, head) {
        let pathname = url.parse(request.url).pathname;
        pathname = pathname.replace(/^([\/\\]*)(.*)$/i, '$2');

        if(!this.map.hasOwnProperty(pathname)) {
            this.logger.error(`No registered client for "${pathname}"!`);
            // There is no corresponding client, destroy socket.
            socket.destroy();
            return;
        }

        this.logger.log(`Accepted connection to ${pathname}.`);
        this.logger.log(`Upgrading connection to Websocket connection...`);

        return this.map[pathname].wsServer.handleUpgrade(
            request, socket, head, (ws) => {
                    this.logger.log(
                        `Emitting new WebSocket connection event...`);
                    this.map[pathname].wsServer.emit(
                        'connection', ws, request);
                });
    }
}


let rng = new RingnetGateway({
    httpServer,
    logger: console,
    map: peers,
    port: 26780
});
