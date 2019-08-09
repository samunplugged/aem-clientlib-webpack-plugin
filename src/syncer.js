/* eslint no-console: 0 */
import {
  Pipeline
} from 'aemsync';
import 'babel-core/register';
import 'babel-polyfill';
import Queue from 'queue';
import _ from 'lodash';
import LoggerFactory from './logger-factory';

export default class Syncer {
  constructor(targets, pushInterval = 1000, onPushEndCallback = null, logLevel = 'info') {
    this.targets = targets;
    this.pushInterval = pushInterval;
    this.onPushEndCallback = onPushEndCallback;
    this.logger = LoggerFactory.getInstance(logLevel);
    this.setUp();
  }
  setUp() {
    this.pusher = new Pipeline({
      targets: this.targets, 
      interval: this.pushInterval, 
      packmgrPath: null, 
      onPushEnd: (err, host) => {
        this.onPushEnd(err, host);
      }
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

    if (typeof (this.oneTimeCallback) === 'function') {
      this.logger.info('pendingCallback is a function');
      this.oneTimeCallback(err, host, this);
      this.oneTimeCallback = null;
      this.copiedFiles = [];
    }
  }
  enqueue(file) {
    if (typeof file === 'string') {
      this.pusher.enqueue(file);
    } else {
      _.forEach(file, (filepath) => {
        this.pusher.enqueue(filepath);
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
  static uploadImmediately(file, targets, onPushEndCallback, logLevel = 'info') {
    let syncer;

    if (typeof Syncer.queue === 'undefined') {
      Syncer.queue = Queue({concurrency: 1, autostart: true});
    }

    const promise = new Promise((resolve, reject) => {
      Syncer.queue.push(() => new Promise((resolve2, reject2) => {
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
      }).catch(syncer.handleError));
    });

    return promise;
  }

}
