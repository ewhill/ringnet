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

const fs = require('fs');
const RSAKeyPair = require('../lib/src/RSAKeyPair.js');
const Expectation = require('./expectation');

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
  ringRSAKeyPair = false,
  peerRSAKeyPair = false,
  keySize = args.b || 2048;
  
// Create `debug` function, if `verbose`, from console.log
// (`debug` only `console.log`'s if `verbose` is true)
var verbose = !(args.s || args.silent),
  debug = verbose ? console.log.bind(console) : ()=>{};

debug(`Parsing / Generating ring keys...`);

if(args.ring && Array.isArray(args.ring)) {
  // We were given the command line option `-ring`
  if(args.ring.length == 2) {
    // Given BOTH private and public keys
    ringRSAKeyPair = new RSAKeyPair({
        privateKeyPath: args.ring[0],
        publicKeyPath: args.ring[1]
      });
  } else if(args.ring.length == 1) {
    // Given ONLY private key
    ringRSAKeyPair = ringRSAKeyPair = new RSAKeyPair({
        privateKeyPath: args.ring[0]
      });
  }
} else {
  createdRing = true;
  ringRSAKeyPair = (new RSAKeyPair()).generate({ modulusLength: keySize });
}

debug(`Parsing / Generating peer keys...`);

if(args.peer && Array.isArray(args.peer)) {
  // We were given the command line option `-peer`
  if(args.peer.length == 2) {
    // Given BOTH private and public keys
    peerRSAKeyPair = new RSAKeyPair({
        privateKeyPath: args.peer[0],
        publicKeyPath: args.peer[1]
      });
  } else if(args.peer.length == 1) {
    // Given ONLY private key
    peerRSAKeyPair = new RSAKeyPair({
        privateKeyPath: args.peer[0]
      });
  }
} else {
  // Not given any `-peer` command line option, create peer key pair
  createdPeer = true;
  peerRSAKeyPair = (new RSAKeyPair()).generate({ modulusLength: keySize });
}

// Export the ring keys
debug(`Exporting ring RSA keys...`);
const ringKeys = 
  ringRSAKeyPair.export({ mode: 'both', returnBuffer: true });

// Export the peer keys
debug(`Exporting peer RSA keys...`);
const peerKeys = 
  peerRSAKeyPair.export({ mode: 'both', returnBuffer: true });

// Sign peer public, write the signature to file
debug(`Signing peer public key with ring private key...`);
const peerSignatureBuffer = ringRSAKeyPair.sign(peerKeys.public);
const peerSignature = peerSignatureBuffer.toString('hex');

console.log(`\t${peerSignature}`);

// Write our peer signature to file system
debug(`Writing peer signature to file system...`);
fs.writeFileSync(fileName + ".peer.signature", peerSignature, 'utf8');
debug(`\t${fileName}.peer.signature`);

if(createdRing) {
  // Write our ring key pair to file system
  debug(`Writing ring keys to file system...`);

  fs.writeFileSync(".ring.pem", ringKeys.private, 'utf8');
  debug(`\t.ring.pem`);

  fs.writeFileSync(".ring.pub", ringKeys.public, 'utf8');
  debug(`\t.ring.pub`);
}

if(createdPeer) {
  // Write our peer key pair to file system
  debug(`Writing peer keys to file system...`);

  fs.writeFileSync(fileName + ".peer.pem", peerKeys.private, 'utf8');
  debug(`\t${fileName}.peer.pem`);

  fs.writeFileSync(fileName + ".peer.pub", peerKeys.public, 'utf8');
  debug(`\t${fileName}.peer.pub`);
}

debug(`Done.`);
process.exit(0);
