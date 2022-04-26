class ManagedTimeouts {
	constructor() {
		this.timeouts = {};
		this.intervals = {};
		this.timeoutId = 0;
		this.intervalId = 0;
		this.enabled = true;
	}

	setTimeout(f, d) {
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
				f.apply(this, []);
		    }, d);
		})(this, id);

		this.timeoutId++;
		return id;
	}

	clearTimeout(id) {
		clearTimeout(this.timeouts[id]);
		delete this.timeouts[id];
	}

	setInterval(f, d) {
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

		const id = this.intervalId;

		((self, id) => {
		    self.intervals[id] = setInterval(function() {
		    	delete self.intervals[id];
				f.apply(this, []);
		    }, d);
		})(this, id);

		this.intervalId++;
		return id;
	}

	clearInterval(id) {
		clearInterval(this.intervals[id]);
		delete this.intervals[id];
	}

	clearAll() {
		for(let id of Object.keys(this.timeouts)) {
			try {
				this.clearTimeout(id);
			} catch(e) { /* Oh whale. */ }
		}

		for(let id of Object.keys(this.intervals)) {
			try {
				this.clearInterval(id);
			} catch(e) { /* Oh whale. */ }
		}
	}

	destroy() {
		this.enabled = false;
		this.clearAll();
	}
}

module.exports = ManagedTimeouts;