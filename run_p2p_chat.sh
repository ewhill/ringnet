#!/bin/sh

tmux new-session -d 'node --no-warnings --no-deprecation examples/peerCommandLine.js -port=26781 -ring=.ring.pub -signature=first.peer.signature -private=first.peer.pem -public=first.peer.pub'
tmux split-window -v 'node --no-warnings --no-deprecation examples/peerCommandLine.js -port=26782 -peers="127.0.0.1:26781" -ring=.ring.pub -signature=second.peer.signature -private=second.peer.pem -public=second.peer.pub'
tmux split-window -h 'node --no-warnings --no-deprecation examples/peerCommandLine.js -port=26783 -peers="127.0.0.1:26781" -ring=.ring.pub -signature=third.peer.signature -private=third.peer.pem -public=third.peer.pub'

tmux -2 attach-session -d