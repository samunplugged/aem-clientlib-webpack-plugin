import {InfoLogger, VerboseLogger, SilentLogger} from './logger';

export default class LoggerFactory {
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
