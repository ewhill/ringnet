"use strict";

class ArgumentsParser {
  static ARGUMENT_TYPE_ENUM = {
    BOOL: 0,
    STRING: 1,
    INT: 2,
    FLOAT: 3,
    ARRAY: 4,
    OBJECT: 5,
    BOOL_ARRAY: 6,
    STRING_ARRAY: 7,
    INT_ARRAY: 8,
    FLOAT_ARRAY: 9,
  };

  static parseValueAsArray = (value) => {
    let inString = false;
    let lastCommaIndex = 0;
    let ret = [];
    for (let i=0; i<value.length; i++) {
      if (value[i] === '"' || value[i] === '\'') {
        if (i === 0 || (i>0 && value[i-1] !== '\\')) {
          quoteChar = value[i];
          if(!inString) {
            inString = true
          } else if (value[i] === quoteChar) {
            inString = false
          }
        }
      }
      if (!inString && value[i] === ',') {
        ret.push(value.slice(lastCommaIndex, i));
        lastCommaIndex = i+1;
      }
    }
    if (lastCommaIndex < value.length) {
      ret.push(value.slice(lastCommaIndex, value.length));
    }
    return ret;
  };

  args = {};

  constructor(format) {
    for (let i=0; i<process.argv.length; i++) {
      let parts = process.argv[i].toString();
      let name = parts;
      let value = true;
      
      if (parts.indexOf('=') > -1) {
        parts = parts.split('=');
        name = parts[0].slice(1);
        value = parts.length > 1 ? parts.slice(1).join('=') : true;
      }

      let j = 0;
      while (j < name.length && name[j] === '-') { j++ };
      name = name.slice(j);

      if (format.hasOwnProperty(name)) {
        switch (format[name]) {
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL:
            value = !!value;
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING:
            value = value;
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.INT:
            value = parseInt(value);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.FLOAT:
            value = parseFloat(value);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.ARRAY:
            value = ArgumentsParser.parseValueAsArray(value);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.OBJECT:
            value = JSON.parse(value);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.BOOL_ARRAY:
            value = ArgumentsParser.parseValueAsArray(value);
            value = value.map((i) => !!i);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.STRING_ARRAY:
            value = ArgumentsParser.parseValueAsArray(value);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.INT_ARRAY:
            value = ArgumentsParser.parseValueAsArray(value);
            value = value.map(parseInt);
            break;
          case ArgumentsParser.ARGUMENT_TYPE_ENUM.FLOAT_ARRAY:
            value = ArgumentsParser.parseValueAsArray(value);
            value = value.map(parseFloat);
            break;
          default:
            value = value;
        }
        this.args[name] = value;
      }
    }
  }

  parse() {
    return this.args;
  }
};

module.exports = ArgumentsParser;
