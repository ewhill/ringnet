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

  _isSidebarEnabled = true;
  _prompt;
  _sidebarSize = 32;
  _stdOutBuffer = [];

  constructor(prompt='> ') {
    this._readInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this._prompt = prompt;
  }

  static formatHyperlinks(text) {
    return text.split(/(\s+)/g)
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
  }

  get sidebarSize() {
    return this._isSidebarEnabled ? this._sidebarSize : 0;
  }

  get net() {
    return new Proxy({}, {
      get: (_, key) => {
        if (!ConsoleIO.Colors.net.hasOwnProperty(key)) {
          throw new Error(`ConsoleIO.net has no method named '${key}'!`);
        }
        return (message) => {
          this.write(`${ConsoleIO.Colors.net[key].join('')}[NET]:`, message);
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
        return (from, text) => {
          this.write(
            `${ConsoleIO.Colors.message[key].join('')}` + 
            `[${from}]: ` +
            `${CONSOLE_COLORS.Reset}${CONSOLE_COLORS.Foreground.White}` +
            `${text}`);
        };
      }
    });
  }

  get isSidebarEnabled() {
    return this._isSidebarEnabled;
  }

  enableSidebar() {
    this._isSidebarEnabled = true;
  }

  disableSidebar() {
    this._isSidebarEnabled = false;
  }

  render(sidebarText) {
    this.renderChat();
    this.renderSidebar(sidebarText);
    this.renderPrompt();
  }

  renderSidebar(text) {
    if(!this._isSidebarEnabled) {
      return;
    }

    process.stdout.write(CONSOLE_COLORS.Background.White);
    process.stdout.write(CONSOLE_COLORS.Foreground.Black);

    for (let i=0; i<process.stdout.rows; i++) {
      process.stdout.cursorTo(0, i);
      process.stdout.write((new Array(this.sidebarSize + 1)).join(' '));
    }

    process.stdout.cursorTo(0, 0);

    text.split('\n').forEach(line => {
      process.stdout.write(' ' + line + '\n');
    });
  }

  renderChat() {
    const cols = process.stdout.columns - this.sidebarSize;
    const rows = process.stdout.rows - 1;

    for(let y=0; y<rows; y++) {
      process.stdout.cursorTo(this.sidebarSize, y);
      process.stdout.write(CONSOLE_COLORS.Reset);
      for(let x=0; x<cols; x++) {
        process.stdout.write(' ');
      }
    }

    let output = this._stdOutBuffer.slice(-rows);
    const start = output.length > rows ? output.length - rows : 0;
    const size = output.length - start;
    for(let j=start; j<output.length; j++) {
        process.stdout.cursorTo(this.sidebarSize, rows - size + j);
        process.stdout.write(output[j]);
    }
    process.stdout.write(CONSOLE_COLORS.Reset);
  }

  renderPrompt() {
    process.stdout.cursorTo(this.sidebarSize, process.stdout.rows);
    process.stdout.write(CONSOLE_COLORS.Reset);
    process.stdout.write(this._prompt);
    process.stdout.write(this._readInterface.line);
    const start = 
      this.sidebarSize + this._prompt.length + this._readInterface.line.length;
    for(let x=start; x<process.stdout.columns; x++) {
      process.stdout.write(' ');
    }
    process.stdout.cursorTo(
      this.sidebarSize + this._readInterface.getCursorPos().cols,
      process.stdout.rows);
  }

  write(...args) {
    let output = ''
    for(let arg of args) {
      output += 
        ConsoleIO.formatHyperlinks(typeof arg === 'string' ? 
          arg : util.format(arg));
      if(args.length > 1) {
        output += ' '
      }
    }
    output += CONSOLE_COLORS.Reset
    this._stdOutBuffer = this._stdOutBuffer.concat(output.split('\n'));
  }

  clear() {
    console.clear();
  }

  prompt(prompt=this._prompt) {
    return new Promise(resolve => {
      return this._readInterface.question(prompt, resolve);
    });
  }

  close() {
    this._readInterface.close();
    this._readInterface.removeAllListeners();
  }
}

module.exports = { ConsoleIO };