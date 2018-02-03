'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LoggerFactory = undefined;

var _npmlog = require('npmlog');

var Log = _interopRequireWildcard(_npmlog);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class BaseLogger {
  constructor(_level) {
    this.level = typeof _level === 'string' ? _level : 'silent';
    console.log('Log level is', this.level);
    Log.level = this.level;
  }
  verbose(message) {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
  info(message) {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
  error(err) {
    Log.error('aem-clientlib-webpack-plugin', err);
  }
} /* eslint no-unused-vars: 0, no-console: 0 */

class SilentLogger extends BaseLogger {
  constructor() {
    super('silent');
  }
  verbose(message) {
    // do nothing
  }
  info(message) {
    // do nothing
  }
}
class InfoLogger extends BaseLogger {
  constructor() {
    super('info');
  }
  verbose(message) {
    // do nothing
  }
  info(message) {
    Log.info('aem-clientlib-webpack-plugin', message);
  }
}
class VerboseLogger extends BaseLogger {
  constructor() {
    super('verbose');
  }
  verbose(message) {
    Log.info('aem-clientlib-webpack-plugin', message);
  }
  info(message) {
    Log.level = this.level;
    Log.info('aem-clientlib-webpack-plugin', message);
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
      case 'silent':
        return new SilentLogger();
      default:
        throw new Error('Unknown log level');
    }
  }
}
exports.LoggerFactory = LoggerFactory;