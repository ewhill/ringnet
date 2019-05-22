"use strict";

/**************************************************************************************************
***************************************************************************************************
---------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------
    
    ||\\ //\\ //\\ ||\\ //=== //\\ ==== || || ||\\       || //===
    ||// ||// ||// ||// \\=\\ ||//  ||  || || ||//       || \\=\\
    ||   \\== \\== ||\\ ===// \\==  ||  \\=// ||    =  \\// ===//
    
    peerSetup.js

---------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------

A small script to generate necessary RSA Keys / signature
for use in a ringnet.

REMEMBER: peers on the same ringnet
MUST have a valid signature (signed public key) from the 
same ring private key. If the signature cannot be validated,
the peer will not be able to join the ringnet. This being 
said, if peer1 has been signed by ring.pem and peer2 wishes
to talk to peer1 on peer1's ringnet, then peer2 has to have
a signature (signed public key) provided from the same ring 
private that signed peer1's public key.

---------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------

USAGE:

  Typical:
    $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath>
  Silent Mode:
    $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> -s
  Create Ring Keys Also:
    $ node peerSetup.js -o=<fileNamePrefix> -s
  Just Sign (Peer Keys Provided):
    $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> \
        -peer=<peerPrivateFilePath>,<peerPublicFilePath>
  Specify Key Size (Must Be Multiple of 8):
    $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> -b=2048

---------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------
***************************************************************************************************
**************************************************************************************************/

const fs = require('fs'),
  NodeRSA = require('node-rsa'),
  Expectation = require('./expectation');

// Grab the necessary arguments from `process.argv` using `Expectation`
const args =  (new Expectation({
  "ring":[","], //optional
  "peer":[","], //optional
  "o": "",      //optional
  "out": "",    //optional
  "b": 0        //optional
}).args);

if(args.h || args.help) {
  console.log(`\npeerSetup.js\n\nUSAGE:
    Typical:
      $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath>
    Silent Mode:
      $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> -s
    Create Ring Keys Also:
      $ node peerSetup.js -o=<fileNamePrefix> -s
    Just Sign (Peer Keys Provided):
      $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> \\
          -peer=<peerPrivateFilePath>,<peerPublicFilePath>
    Specify Key Size (Must Be Multiple of 8):
      $ node peerSetup.js -o=<fileNamePrefix> -ring=<ringPrivateFilePath>,<ringPublicFilePath> -b=2048\n`);
  process.exit(0);
}

// A little bit of setup required...
let fileName = args.o || args.out || "",
  createdRing = false, createdPeer = false,
  ringPrivate = false, ringPublic = false,
  peerPrivate = false, peerPublic = false,
  keySize = args.b || 2048;
  
// Create `debug` function, if `verbose`, from console.log
// (`debug` only `console.log`'s if `verbose` is true)
var verbose = !(args.s || args.silent),
  debug = verbose ? console.log.bind(console) : ()=>{};

debug(`Parsing / Generating ring keys...`);

if(args.ring && Array.isArray(args.ring)) {
  if(args.ring.length == 2) {
    ringPrivate = new NodeRSA(fs.readFileSync(args.ring[0]));
    ringPublic = new NodeRSA(fs.readFileSync(args.ring[1]));
  } else if(args.ring.length == 1) {
    ringPrivate = new NodeRSA(fs.readFileSync(args.ring[0]));
    ringPublic = new NodeRSA(ringPrivate.exportKey("public"));
  }
} else {
  createdRing = true;
  ringPrivate = new NodeRSA({b: keySize});
  ringPublic = new NodeRSA(ringPrivate.exportKey("public"));
}

debug(`Parsing / Generating peer keys...`);

if(args.peer && Array.isArray(args.peer)) {
  // We were given the command line option `-peer`
  if(args.peer.length == 2) {
    // Given BOTH private and public keys
    peerPrivate = new NodeRSA(fs.readFileSync(args.peer[0]));
    peerPublic = new NodeRSA(fs.readFileSync(args.peer[1]));
  } else if(args.peer.length == 1) {
    // Given ONLY private key
    peerPrivate = new NodeRSA(fs.readFileSync(args.peer[0]));
    // Generate public from private
    peerPublic = new NodeRSA(peerPrivate.exportKey("public"));
  }
} else {
  // Not given any `-peer` command line option, create peer key pair
  createdPeer = true;
  peerPrivate = new NodeRSA({b: keySize});
  peerPublic = new NodeRSA(peerPrivate.exportKey("public"));
}

debug(`Signing peer public with ring private...`);

// Sign peer public, write the signature to file
fs.writeFileSync(fileName + ".peer.signature", ringPrivate.sign(peerPublic.exportKey('public')));
debug(`\t${fileName}.peer.signature`);

if(createdRing) {
  // Write our ring key pair to file system
  debug(`Writing ring keys to file system...`);
  fs.writeFileSync(".ring.pem", ringPrivate.exportKey('private'));
  debug(`\t.ring.pem`);
  fs.writeFileSync(".ring.pub", ringPublic.exportKey('public'));
  debug(`\t.ring.pub`);
}

if(createdPeer) {
  // Write our peer key pair to file system
  debug(`Writing peer keys to file system...`);
  fs.writeFileSync(fileName + ".peer.pem", peerPrivate.exportKey('private'));
  debug(`\t${fileName}.peer.pem`);
  fs.writeFileSync(fileName + ".peer.pub", peerPublic.exportKey('public'));
  debug(`\t${fileName}.peer.pub`);
}

debug(`Done.`);
process.exit(0);
