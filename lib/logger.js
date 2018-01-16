'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
/* eslint no-unused-vars: 0, no-console: 0 */
class BaseLogger {
  constructor() {
    this.level = '';
  }
  verbose(message) {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
  info() {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
}
class DefaultLogger extends BaseLogger {
  constructor() {
    super();
    this.level = 'off';
  }
  verbose(message) {
    // do nothing
  }
  info() {
    // do nothing
  }
}
class InfoLogger extends BaseLogger {
  constructor() {
    super();
    this.level = 'info';
  }
  verbose(message) {
    // do nothing
  }
  info(message) {
    console.info(message);
  }
}
class VerboseLogger extends BaseLogger {
  constructor() {
    super();
    this.level = 'verbose';
  }
  verbose(message) {
    console.info(message);
  }
  info(message) {
    console.info(message);
  }
}
class LoggerFactory {
  constructor() {
    throw new Error('LoggerFactory, must not be initialitzed. Call getInstance method instead');
  }
  static getInstance(level) {
    switch (level) {
      case 'info':
        return new InfoLogger();
      case 'verbose':
        return new VerboseLogger();
      default:
        return DefaultLogger();
    }
  }
}
exports.LoggerFactory = LoggerFactory;