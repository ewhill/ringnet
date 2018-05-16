# ringnet

## A secure peer-to-peer networking module based on WebSockets using RSA and AES.

This package aims to create a secure, trusted network among decentralized peers, and make the aforementioned easy to setup and use right out-of-the-box.

### This package is in ALPHA development; you've been warned.

### Testing On Local Machine:
1. Set up initial peer - Use peerSetup.js to generate ring public / private key pair and peer1 public/private key pair and signature

    ```bash
    $ node peerSetup.js -o=first -b=2048
    ```

2. Set up second peer - Use peerSetup.js to generate second peer public / private key pair and signature

    ```bash
    $ node peerSetup.js -o=second -b=2048 -ring=.ring.pem
    ```

4. Start first peer (in background, logging stdout and stderr to `first.peer.log`):
    
    ```bash
    $ node test/peerCommandLine.js -port=26781 -ring=.ring.pub -private=first.peer.pem -public=first.peer.pub -signature=first.peer.signature -v -d > "first.peer.log" 2>&1 &
    ```
    
5. Start second peer (in foreground, with user interaction):
    
    ```bash
    $ node test/peerCommandLine.js -port=26782 -peers=127.0.0.1:26781 -ring=.ring.pub -private=second.peer.pem -public=second.peer.pub -signature=second.peer.signature -v
    ```
    
6. Once the peer-to-peer network has been established (post-HELO handshake), messages from one peer can be sent out to all other peers in the network securely, just as in a typical client-server scenario. The catch? Decentralization. Every peer is a server and every peer is a client. There is no central management.
7. Type some text into terminal/prompt while the second peer is running and hit enter. The second peer will send the message securely to the first peer, as the peers have established trust in the decentralized network.
8. Quit (`Ctrl^C` or type `exit` and hit enter) on the second peer to quit the second peer.
9. Verify the encrypted message sent by the second peer made it to the first peer by opening `first.peer.log`. The last few lines will now reflect the message sent by the second peer to the first peer and received by the first peer from the second peer.
10. Quit (`kill -9 <pidOfFirstPeer>`) the second peer, as it is still running in the background.