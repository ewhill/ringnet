#!/bin/sh

tmux new-session -d 'node --no-warnings --no-deprecation examples/peerCoordination/index.js -port=26781 -private=first.peer.pem -public=first.peer.pub -signature=first.peer.signature -ring=.ring.pem -publicAddress="127.0.0.1:26781/worker" -console'
tmux split-window -v 'node --no-warnings --no-deprecation examples/peerCoordination/index.js -port=26782 -peers="127.0.0.1:26781/worker" -private=second.peer.pem -public=second.peer.pub -signature=second.peer.signature -ring=.ring.pem -publicAddress="127.0.0.1:26782/worker"'
tmux split-window -h 'node --no-warnings --no-deprecation examples/peerCoordination/index.js -port=26783 -peers="127.0.0.1:26781/worker" -private=third.peer.pem -public=third.peer.pub -signature=third.peer.signature -ring=.ring.pem -publicAddress="127.0.0.1:26783/worker"'

tmux -2 attach-session -d