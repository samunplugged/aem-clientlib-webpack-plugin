'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _aemsync = require('aemsync');

require('babel-core/register');

require('babel-polyfill');

var _queue = require('queue');

var _queue2 = _interopRequireDefault(_queue);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _loggerFactory = require('./logger-factory');

var _loggerFactory2 = _interopRequireDefault(_loggerFactory);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint no-console: 0 */
class Syncer {
  constructor(targets) {
    var pushInterval = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1000;
    var onPushEndCallback = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    var logLevel = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'info';

    this.targets = targets;
    this.pushInterval = pushInterval;
    this.onPushEndCallback = onPushEndCallback;
    this.logger = _loggerFactory2.default.getInstance(logLevel);
    this.setUp();
  }
  setUp() {
    var _this = this;

    this.pusher = new _aemsync.Pusher(this.targets, this.pushInterval, function (err, host) {
      _this.onPushEnd(err, host);
    });
    this.pusher.start();
  }
  sync() {
    this.pusher.start();
  }
  onPushEnd(err, host) {
    if (err) {
      this.logger.error('Error when pushing package', err);
    } else {
      this.logger.info(`Package pushed to ${host}`);
    }
    if (this.onPushEndCallback) {
      this.onPushEndCallback(err, host, this.pusher);
    }

    if (typeof this.oneTimeCallback === 'function') {
      this.logger.info('pendingCallback is a function');
      this.oneTimeCallback(err, host, this);
      this.oneTimeCallback = null;
      this.copiedFiles = [];
    }
  }
  enqueue(file) {
    var _this2 = this;

    if (typeof file === 'string') {
      this.pusher.enqueue(file);
    } else {
      _lodash2.default.forEach(file, function (filepath) {
        _this2.pusher.enqueue(filepath);
      });
    }
  }
  setPendingCallback(callback) {
    this.oneTimeCallback = callback;
  }
  handleError(err) {
    console.error('aem-clientlib-webpack-plugin', 'handleError', err);
    console.trace('aem-clientlib-webpack-plugin', 'trace', err);
    if (this && this.isWatchEnabled && !this.isWatchEnabled()) {
      process.exit(1);
    }
  }
  static uploadImmediately(file, targets, onPushEndCallback) {
    var logLevel = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'info';

    var syncer = void 0;

    if (typeof Syncer.queue === 'undefined') {
      Syncer.queue = (0, _queue2.default)({ concurrency: 1, autostart: true });
    }

    var promise = new Promise(function (resolve, reject) {
      Syncer.queue.push(function () {
        return new Promise(function (resolve2, reject2) {
          syncer = new Syncer(targets, 300, function onPushEndHandler(err, host) {
            if (err) {
              reject2(err);
              reject(err);
            } else {
              resolve2();
              resolve();
            }
            if (typeof onPushEndCallback === 'function') {
              onPushEndCallback(err, host, this);
            }
          }, logLevel);
          syncer.enqueue(file);
        }).catch(syncer.handleError);
      });
    });

    return promise;
  }

}
exports.default = Syncer;