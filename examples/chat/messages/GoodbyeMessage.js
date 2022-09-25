'use strict';

/**
 * GoodbyeMessage class - Inidicates that a sender intends to disconnect.
 */

const { Message } = require('ringnet');


class GoodbyeMessage extends Message {
  constructor(options = {}) {
    super();
  }
}

module.exports = { GoodbyeMessage };