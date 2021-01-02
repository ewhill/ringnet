const crypto = require('crypto');
const fs = require('fs');
const url = require('url');
const https = require('https');

const { Peer, Message } = require('../index.js');
const { HTTPS_SERVER_MODES } = require('../lib/Server.js');

// ----------------------------------------------
// ----------------------------------------------

class CliMessage extends Message {
    constructor(options = {}) {
        super();
        const { data } = options;
        this.data = data;
    }

    get data() { return this.data_}
    set data(value) { this.data_ = value; }
}

let keyNames = ["../first", "../second", "../third" ];
let nPeers = 3;
let peers = {};

const httpServer = https.createServer({
    'key': fs.readFileSync("../https.key.pem"),
    'cert': fs.readFileSync("../https.cert.pem")
});

for(let i=0; i<nPeers; i++) {
    let options = {
        'publicAddress': "127.0.0.1",
        'signaturePath': keyNames[i]+".peer.signature",
        'publicKeyPath': keyNames[i]+".peer.pub",
        'privateKeyPath': keyNames[i]+".peer.pem",
        'ringPublicKeyPath': "../.ring.pub",
        'debug': true,
        'httpsServerConfig': {
            'mode': HTTPS_SERVER_MODES.PASS,
            'server': httpServer,
        },
        'wsServerConfig': {
            noServer: true
        }
    };

    let peer = new Peer(options);
    let address = crypto.randomBytes(4).toString('hex');

    ((peer, address) => {
        peer
            .bind(CliMessage)
            .to((peer, message, connection, logger=console) => {
                console.log(`${address} says: ${message.data}`);
            });
    })(peer, address);

    peers[address] = peer;
}

// ----------------------------------------------
// ----------------------------------------------

class RingnetGateway {
    constructor({
        debug       = false,
        httpServer  = false,
        map         = {},
        port        = 26780
    }) {
        this.debug = debug;
        this.map = map;
        this.port = port;
        this.server = httpServer;

        if(this.server) {
            this.server.on('upgrade', (request, socket, head) => 
                this.onUpgrade.apply(this, [ request, socket, head ]));

            this.server.listen(this.port, () => this.onListen.apply(this, []));
        }
    }

    onListen() {
        if(this.debug) {
            console.log(`Ringnet gateway listening on port ${this.port}`);
            console.log(`Mappings:`);
            for(let route of Object.keys(this.map)) {
                console.log(`\t${route}`);
            }
        }
    }

    onUpgrade(request, socket, head) {
        let pathname = url.parse(request.url).pathname;
        pathname = pathname.replace(/^([\/\\]*)(.*)$/i, '$2');

        if(this.map.hasOwnProperty(pathname) && this.map[pathname] instanceof Peer) {
            if(this.debug) {
                console.log(`Accepted connection to ${pathname}.`);
                console.log(`Upgrading connection to Websocket connection...`);
            }

            this.map[pathname].wsServer.handleUpgrade(request, socket, head,
                (ws) => this.map[pathname].wsServer.emit('connection', ws, request));
        } else {
            // There is no corresponding client, destroy socket.
            socket.destroy();
        }
    }
}


let rng = new RingnetGateway({
    debug: true,
    httpServer,
    map: peers,
    port: 26780
});
