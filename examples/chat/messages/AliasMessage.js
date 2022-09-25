'use strict';

/**
 * AliasMessage class - Message used to indicate an update to a sender's alias.
 */

const { Message } = require('ringnet');


class AliasMessage extends Message {
  constructor(options = {}) {
    super();
    const { alias='' } = options;
    this.alias = alias;
  }

  get alias() { return this.body.alias; }
  set alias(value) { this.body.alias = value; }
}

module.exports = { AliasMessage };