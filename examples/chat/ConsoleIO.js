'use strict';

/**
 * ConsoleIO - Encapsulates input / output from / to console.
 */

const util = require('util');
const readline = require('readline');

const CONSOLE_COLORS = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underline: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",

  Foreground: {
    Black: "\x1b[30m",
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
  },

  Background: {
    Black: "\x1b[40m",
    Red: "\x1b[41m",
    Green: "\x1b[42m",
    Yellow: "\x1b[43m",
    Blue: "\x1b[44m",
    Magenta: "\x1b[45m",
    Cyan: "\x1b[46m",
    White: "\x1b[47m",
  },
};


class ConsoleIO {
  static Colors = {
    net: {
      log: [
        CONSOLE_COLORS.Dim,
        CONSOLE_COLORS.Foreground.White,
      ],
      error: [
        CONSOLE_COLORS.Background.White,
        CONSOLE_COLORS.Foreground.Red,
      ],
    },
    message: {
      peer: [
        CONSOLE_COLORS.Bright,
        CONSOLE_COLORS.Foreground.Green,
      ],
      own: [
        CONSOLE_COLORS.Bright,
        CONSOLE_COLORS.Foreground.Blue,
      ],
    },
  };

  _prompt;

  constructor(prompt='> ') {
    this._readInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this._prompt = prompt;
  }

  write(colorArgs, ...args) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(colorArgs.join(''));
    for(let arg of args) {
      if(typeof arg === 'string') {
        const formattedMessage = arg.split(/(\s+)/)
          .map(part => {
            try {
              if((new URL(part)).host) {
                return `${CONSOLE_COLORS.Underline}${part}` +
                  `${CONSOLE_COLORS.Reset}${colorArgs.join('')}`;
              }
            } catch (err) { /* Fall through... */ }
            return part;
          })
          .join('');
        process.stdout.write(formattedMessage);
      } else {
        process.stdout.write(util.format(arg));
      }
      if(args.length > 0) {
        process.stdout.write(' ');
      }
    }
    process.stdout.write('\n');
    process.stdout.write(CONSOLE_COLORS.Reset);
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
          this.write.apply(this, [ConsoleIO.Colors.net[key], '[NET]', ...args]); 
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
        return (from, text, isOwnMessage=false) => {
          const formatted = 
            `${ConsoleIO.Colors.message[key].join('')}` + 
            `[${from}]:` +
            `${CONSOLE_COLORS.Reset}${CONSOLE_COLORS.Foreground.White} ${text}`;
          this.write.apply(
            this, [[ CONSOLE_COLORS.Foreground.White ], formatted]);
        };
      }
    });
  }
}

module.exports = { ConsoleIO };