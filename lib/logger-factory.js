'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _logger = require('./logger');

class LoggerFactory {
  constructor() {
    throw new Error('LoggerFactory, must not be initialitzed. Call getInstance method instead');
  }
  static getInstance(level) {
    switch (level) {
      case 'info':
        return new _logger.InfoLogger();
      case 'verbose':
        return new _logger.VerboseLogger();
      case 'silent':
        return new _logger.SilentLogger();
      default:
        throw new Error('Unknown log level');
    }
  }

}
exports.default = LoggerFactory;