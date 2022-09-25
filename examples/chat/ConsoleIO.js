'use strict';

/**
 * ConsoleIO - Encapsulates input / output from / to console.
 */

const util = require('util');
const readline = require('readline');

const colors = require('../colors');


class ConsoleIO {
  static Colors = {
    net: {
      log: [
        colors.Dim,
        colors.Foreground.White,
      ],
      error: [
        colors.Background.White,
        colors.Foreground.Red,
      ],
    },
    message: {
      peer: [
        colors.Foreground.White,
      ],
      own: [
        colors.Foreground.Blue,
      ],
    },
  };

  _defaultPrompt = 'NET> ';
  _prompt;

  constructor(prompt) {
    this._readInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this._prompt = prompt || this._defaultPrompt;
  }

  write(colorArgs, ...args) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(colorArgs.join(''));
    for(let arg of args) {
      process.stdout.write(typeof arg === 'string' ? arg :  util.format(arg));
    }
    process.stdout.write('\n');
    process.stdout.write(colors.Reset);
    process.stdout.cursorTo(0);
    process.stdout.write(this._prompt);
  }

  clear() {
    console.clear();
  }

  prompt = (prompt=this._prompt) => {
    return new Promise(resolve => 
      this._readInterface.question(prompt, resolve));
  }

  close() {
    this._readInterface.close();
    this._readInterface.removeAllListeners();
  }

  get net() {
    return new Proxy({}, {
      get: (_, key) => {
        if (!ConsoleIO.Colors.net.hasOwnProperty(key)) {
          throw new Error(`ConsoleIO.net has no method named '${key}'!`);
        }
        return (...args) => {
          this.write.apply(this, [ConsoleIO.Colors.net[key], ...args]); 
        };
      }
    });
  }

  get message() {
    return new Proxy({}, {
      get: (_, key) => {
        if (!ConsoleIO.Colors.message.hasOwnProperty(key)) {
          throw new Error(`ConsoleIO.message has no method named '${key}'!`);
        }
        return (...args) => {
          this.write.apply(this, [ConsoleIO.Colors.message[key], ...args]);
        };
      }
    });
  }
}

module.exports = { ConsoleIO };