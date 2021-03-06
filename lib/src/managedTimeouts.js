class ManagedTimeouts {
	constructor() {
		this.timeouts = {};
		this.timeoutId = 0;
		this.enabled = true;
	}

	setTimeout(f,d) {
		if(!this.enabled) {
			return null;
		}

		if(!d || typeof d !== "number") {
			d = 0;
		}
		
		d = parseInt(d);

		/* istanbul ignore if */
		if(isNaN(d)) {
			d = 0;
		}

		const id = this.timeoutId;

		((self, id) => {
		    self.timeouts[id] = setTimeout(function() {
				delete self.timeouts[id];
				f.apply(this,[]);
		    }, d);
		})(this, id);

		this.timeoutId++;
		return id;
	}

	clearTimeout(id) {
		clearTimeout(this.timeouts[id]);
		delete this.timeouts[id];
	}

	clearAll() {
		for(let id of Object.keys(this.timeouts)) {
			try {
				this.clearTimeout(id);
				delete this.timeouts[id];
			} catch(e) {
				/* Oh whale. */
			}
		}
	}

	destroy() {
		this.enabled = false;
		this.clearAll();
	}
}

module.exports = ManagedTimeouts;