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
      error: [
        CONSOLE_COLORS.Background.White,
        CONSOLE_COLORS.Foreground.Red,
      ],
      info: [
        CONSOLE_COLORS.Bright,
        CONSOLE_COLORS.Foreground.Blue,
      ],
      log: [
        CONSOLE_COLORS.Dim,
        CONSOLE_COLORS.Foreground.White,
      ],
      warn: [
        CONSOLE_COLORS.Dim,
        CONSOLE_COLORS.Background.Black,
        CONSOLE_COLORS.Foreground.Yellow,
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

  _activePeers = [];
  _isSidebarEnabled = true;
  _prompt;
  _sidebarSize = 32;
  _stdOutBuffer = [];

  constructor(prompt='> ', sidebarEnabled=true) {
    this._readInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this._prompt = prompt;

    if(sidebarEnabled) {
      this.enableSidebar();
    } else {
      this.disableSidebar();
    }

    process.stdout.on('resize', () => {
        this.render();
      });
  }

  get readInterface() {
    return this._readInterface;
  }

  get sidebarSize() {
    return this._isSidebarEnabled ? this._sidebarSize : 0;
  }

  net = {
    _write: (netColors, message) => {
      const format = 
        `${CONSOLE_COLORS.Reset}${netColors}`;
      let output = `${format}[NET]: ` + 
        (typeof message === 'string' ? 
          message : util.inspect(message, {depth: null, colors: true }));
      output
        .split('\n')
        .map(line => `${format}${line}`)
        .forEach(line => this.write.apply(this, [line]));
    },
    error: (message) =>
      this.net._write(ConsoleIO.Colors.net.error.join(''), message),
    info: (message) =>
      this.net._write(ConsoleIO.Colors.net.info.join(''), message),
    log: (message) =>
      this.net._write(ConsoleIO.Colors.net.log.join(''), message),
    warn: (message) =>
      this.net._write(ConsoleIO.Colors.net.warn.join(''), message),
  };

  message = {
    _write: (messageColors, from, text) => {
      this.write(
        `${messageColors}` + 
        `[${from}]: ` +
        `${CONSOLE_COLORS.Reset}${CONSOLE_COLORS.Foreground.White}` +
        `${text}`);
    },
    peer: (from, text) =>
      this.message._write(ConsoleIO.Colors.message.peer.join(''), from, text),
    own: (from, text) =>
      this.message._write(ConsoleIO.Colors.message.own.join(''), from, text),
  }

  get isSidebarEnabled() {
    return this._isSidebarEnabled;
  }

  enableSidebar() {
    this._isSidebarEnabled = true;
    this._readInterface.setPrompt(
      CONSOLE_COLORS.Background.White + CONSOLE_COLORS.Foreground.Black +
      (new Array(this.sidebarSize + 1).join(' ')) + CONSOLE_COLORS.Reset + 
      this._prompt);
  }

  disableSidebar() {
    this._isSidebarEnabled = false;
    this._readInterface.setPrompt(this._prompt);
  }

  updateActivePeers(activePeers) {
    this._activePeers = activePeers;
  }

  _sizeOutput(output, size, padFormat=[CONSOLE_COLORS.Reset]) {
    const pieces = output.split(/(\x1b\[[0-9]+m)/ig);

    let count = 0;
    let builder = '';

    for (let piece of pieces) {
      builder += piece;

      if(/\x1b\[[0-9]+m/ig.test(piece)) {
        continue; 
      }

      count += piece.length;
      if(count > size) {
        return builder + piece.substr(0, size - builder.length);
      } else if (count === size) {
        return builder + piece;
      }
    }

    return (builder + 
      padFormat.join('') + 
      (new Array(size - count + 1)).join(' '));
  }

  render() {
    for(let y=0; y<=process.stdout.rows; y++) {
      process.stdout.cursorTo(0, y);
      this.renderSidebar(y);
      if (y < process.stdout.rows) {
        this.renderChat(y);
      } else {
        this.renderPrompt();
      }
    }
  }

  renderSidebar(row) {
    if(!this._isSidebarEnabled) {
      return;
    }

    let line = 
      CONSOLE_COLORS.Background.White + CONSOLE_COLORS.Foreground.Black;
    if (row === 0) {
      if(this._activePeers.length > 0) {
        line += ' Active peers:';
      } else {
        line += ' No active peers.';
      }
    } else if((row-1) > -1 && (row-1) < this._activePeers.length) {
      line += 
        ` ${CONSOLE_COLORS.Foreground.Green}●`+
        `${CONSOLE_COLORS.Foreground.Black} ${this._activePeers[row - 1]}`;
    }

    process.stdout.write(this._sizeOutput(line, this._sidebarSize, []));
  }

  renderChat(row) {
    let line = CONSOLE_COLORS.Reset;
    const bufferIndex = 
      this._stdOutBuffer.length - process.stdout.rows + row + 1;
    if(bufferIndex > -1 && bufferIndex < this._stdOutBuffer.length) {
      line += this._stdOutBuffer[bufferIndex];
    }

    process.stdout.write(this._sizeOutput(line, process.stdout.columns - this.sidebarSize));
  }

  renderPrompt() {
    const line = CONSOLE_COLORS.Reset + this._prompt + this._readInterface.line;
    process.stdout.write(
      this._sizeOutput(line, process.stdout.columns - this.sidebarSize));
    process.stdout.cursorTo(
      this.sidebarSize + this._prompt.length /*+ this._readInterface.cursor*/,
      process.stdout.rows);
  }

  write(...args) {
    const output = 
      args
        .reduce((prev, curr, index) => {
          return prev + 
            (index > 0 ? ' ' : '') + 
            (typeof curr === 'string' ? 
              curr : util.inspect(curr, { depth: null, colors: true }));
        })
        .replace(/\t/ig, '   ');
    this._stdOutBuffer = this._stdOutBuffer.concat(output.split('\n'));
    this.render();
  }

  clear() {
    console.clear();
  }

  close() {
    this._readInterface.close();
    this._readInterface.removeAllListeners();
  }
}

module.exports = { ConsoleIO };