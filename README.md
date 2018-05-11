##A secure peer-to-peer network discovery module based on WebSockets using RSA and AES.

This package aims to create a trust network among decentralized peers, and make the aforementioned easy to setup and use right out-of-the-box. 
This package is in ALPHA development; you've been warned.

###TEST:

Use Node/OpenSSL to create two sets of public/private key pairs, name them peer1 and peer2, respectively. Doing so should result in 4 total files:
- peer1.pem
- peer1.pub
- peer2.pem
- peer2.pub

Use Node/OpenSSL to create a master ring public/private key pair, name it ring. Doing so should result in 2 total files:
- ring.pem
- ring.pub

Use Node/OpenSSL to sign peer1.pub and peer2.pub, saving the signatures to peer1.signature and peer2.signature, respectively.

Start peer 1 (in background if peer 1 and peer 2 are to be running on same machine):
$ node index.js -port=26781 -signature=peer1.signature -ring=ring.pub -private=peer1.pem -public=peer1.pub -debug -d > "p1.txt" 2>&1 &

Start peer 2 (in foreground):
$ node index.js -port=26782 -peers=127.0.0.1:26781 -signature=peer2.signature -ring=ring.pub -private=peer2.pem -public=peer2.pub -debug

Type some text into terminal/prompt while peer 2 is running and hit enter. Peer 2 will send the message securely to peer 1, as the peers have 
established trust in the decentralized network. Ctrl^C peer 2 to exit. verify the encrypted message sent by peer 2 made it to peer 1 by opening 
p1.txt. The last few lines will now reflect the message sent by peer 2 to peer 1 and received by peer 1 from peer 2.
