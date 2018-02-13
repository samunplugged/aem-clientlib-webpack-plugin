'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VerboseLogger = exports.InfoLogger = exports.SilentLogger = exports.BaseLogger = exports.pluginName = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var pluginName = exports.pluginName = 'aem-clientlib-webpack-plugin'; /* eslint no-console: 0 */
class BaseLogger {
  constructor(_level) {
    this.level = typeof _level === 'string' ? _level : 'silent';
  }
  verbose() {
    for (var _len = arguments.length, message = Array(_len), _key = 0; _key < _len; _key++) {
      message[_key] = arguments[_key];
    }

    throw new Error(`Base class method can't be called. This class must be extended. verbose(...message) called with ${message}`);
  }
  info() {
    for (var _len2 = arguments.length, message = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      message[_key2] = arguments[_key2];
    }

    throw new Error(`Base class method can't be called. This class must be extended. info(...message) called with ${message}`);
  }
  error() {
    for (var _len3 = arguments.length, message = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
      message[_key3] = arguments[_key3];
    }

    throw new Error(`Base class method can't be called. This class must be extended. error(...message) called with ${message}`);
  }
  log(type) {
    for (var _len4 = arguments.length, append = Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
      append[_key4 - 1] = arguments[_key4];
    }

    // console.log(type, ...append);
    console.log(...BaseLogger.getLogBanner(type), ...append);
  }
  static getColor(type) {
    switch (type) {
      case 'info':
        return _chalk2.default.yellow;
      case 'verbose':
        return _chalk2.default.blueBright;
      case 'error':
        return _chalk2.default.red;
      default:
        return _chalk2.default.black;
    }
  }
  static getLogBanner(type) {
    return [BaseLogger.getColor(type)(type), (0, _moment2.default)().format('HH:mm:ss'), _chalk2.default.cyan(pluginName)];
  }
  static get pluginName() {
    return 'aem-clientlib-webpack-plugin';
  }
}
exports.BaseLogger = BaseLogger;
class SilentLogger extends BaseLogger {
  constructor() {
    super('silent');
  }
  verbose() {
    for (var _len5 = arguments.length, message = Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
      message[_key5] = arguments[_key5];
    }

    _lodash2.default.noop(message);
  }
  info() {
    for (var _len6 = arguments.length, message = Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
      message[_key6] = arguments[_key6];
    }

    _lodash2.default.noop(message);
  }
  error() {
    for (var _len7 = arguments.length, message = Array(_len7), _key7 = 0; _key7 < _len7; _key7++) {
      message[_key7] = arguments[_key7];
    }

    _lodash2.default.noop(message);
  }
}
exports.SilentLogger = SilentLogger;
class InfoLogger extends BaseLogger {
  constructor() {
    super('info');
  }
  verbose() {
    for (var _len8 = arguments.length, message = Array(_len8), _key8 = 0; _key8 < _len8; _key8++) {
      message[_key8] = arguments[_key8];
    }

    _lodash2.default.noop(message);
  }
  info() {
    for (var _len9 = arguments.length, message = Array(_len9), _key9 = 0; _key9 < _len9; _key9++) {
      message[_key9] = arguments[_key9];
    }

    this.log('info', ...message);
  }
  error() {
    for (var _len10 = arguments.length, message = Array(_len10), _key10 = 0; _key10 < _len10; _key10++) {
      message[_key10] = arguments[_key10];
    }

    this.log('error', ...message);
  }
}
exports.InfoLogger = InfoLogger;
class VerboseLogger extends BaseLogger {
  constructor() {
    super('verbose');
  }
  verbose() {
    for (var _len11 = arguments.length, message = Array(_len11), _key11 = 0; _key11 < _len11; _key11++) {
      message[_key11] = arguments[_key11];
    }

    this.log('verbose', ...message);
  }
  info() {
    for (var _len12 = arguments.length, message = Array(_len12), _key12 = 0; _key12 < _len12; _key12++) {
      message[_key12] = arguments[_key12];
    }

    this.log('info', ...message);
  }
  error() {
    for (var _len13 = arguments.length, message = Array(_len13), _key13 = 0; _key13 < _len13; _key13++) {
      message[_key13] = arguments[_key13];
    }

    this.log('info', ...message);
  }
}
exports.VerboseLogger = VerboseLogger;