'use strict';

/**
 * TextMessage class - A simple text message class used to chat between peers.
 */

const { Message } = require('ringnet');


class TextMessage extends Message {
  constructor(options = {}) {
    super();
    const { text='' } = options;
    this.text = text;
  }

  get text() { return this.body.text; }
  set text(value) { this.body.text = value; }
}

module.exports = { TextMessage };