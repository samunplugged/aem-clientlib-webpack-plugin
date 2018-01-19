/* eslint no-unused-vars: 0, no-console: 0 */
import * as Log from 'npmlog';

class BaseLogger {
  constructor(_level) {
    this.level = typeof(_level) === 'string' ? _level : 'silent';
    console.log('Log level is', this.level);
    Log.level = this.level;
  }
  verbose(message) {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
  info(message) {
    throw new Error('Base class method can\'t be called. This class must be extended');
  }
}
class DefaultLogger extends BaseLogger {
  constructor() {
    super('info');
  }
  verbose(message) {
    // do nothing
  }
  info(message) {
    // do nothing
  }
}
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
    super('silly');
  }
  verbose(message) {
    Log.verbose('aem-clientlib-webpack-plugin', message);
  }
  info(message) {
    Log.info('aem-clientlib-webpack-plugin', message);
  }
}
export class LoggerFactory {
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
        return new DefaultLogger();
    }
  }
}
