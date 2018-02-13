/* eslint no-console: 0 */
import _ from 'lodash';
import Moment from 'moment';
import Chalk from 'chalk';

export const pluginName = 'aem-clientlib-webpack-plugin';

export class BaseLogger {
  constructor(_level) {
    this.level = typeof (_level) === 'string' ? _level : 'silent';
  }
  verbose(...message) {
    throw new Error(`Base class method can't be called. This class must be extended. verbose(...message) called with ${message}`);
  }
  info(...message) {
    throw new Error(`Base class method can't be called. This class must be extended. info(...message) called with ${message}`);
  }
  error(...message) {
    throw new Error(`Base class method can't be called. This class must be extended. error(...message) called with ${message}`);
  }
  log(type, ...append) {
    // console.log(type, ...append);
    console.log(...BaseLogger.getLogBanner(type), ...append);
  }
  static getColor(type) {
    switch (type) {
      case 'info':
        return Chalk.yellow;
      case 'verbose':
        return Chalk.blueBright;
      case 'error':
        return Chalk.red;
      default:
        return Chalk.black;
    }
  }
  static getLogBanner(type) {
    return [BaseLogger.getColor(type)(type), Moment().format('HH:mm:ss'), Chalk.cyan(pluginName)];
  }
  static get pluginName() {
    return 'aem-clientlib-webpack-plugin';
  }
}
export class SilentLogger extends BaseLogger {
  constructor() {
    super('silent');
  }
  verbose(...message) {
    _.noop(message);
  }
  info(...message) {
    _.noop(message);
  }
  error(...message) {
    _.noop(message);
  }
}
export class InfoLogger extends BaseLogger {
  constructor() {
    super('info');
  }
  verbose(...message) {
    _.noop(message);
  }
  info(...message) {
    this.log('info', ...message);
  }
  error(...message) {
    this.log('error', ...message);
  }
}
export class VerboseLogger extends BaseLogger {
  constructor() {
    super('verbose');
  }
  verbose(...message) {
    this.log('verbose', ...message);
  }
  info(...message) {
    this.log('info', ...message);
  }
  error(...message) {
    this.log('info', ...message);
  }
}

