'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BuilderUtil = exports.SyncerUtil = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

require('babel-core/register');

require('babel-polyfill');

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _fsExtra = require('fs-extra');

var _fsExtra2 = _interopRequireDefault(_fsExtra);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _micromatch = require('micromatch');

var _micromatch2 = _interopRequireDefault(_micromatch);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _nodeWatch = require('node-watch');

var _nodeWatch2 = _interopRequireDefault(_nodeWatch);

var _clientlibTemplateEngine = require('./clientlib-template-engine');

var _clientlibTemplateEngine2 = _interopRequireDefault(_clientlibTemplateEngine);

var _loggerFactory = require('./logger-factory');

var _loggerFactory2 = _interopRequireDefault(_loggerFactory);

var _syncer = require('./syncer');

var _syncer2 = _interopRequireDefault(_syncer);

var _builder = require('./builder');

var _builder2 = _interopRequireDefault(_builder);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* imports end */

/* relative imports */
class AEMClientLibGeneratorPlugin {

  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof this.options.exitOnErrors !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof this.options.cleanBuildsOnce !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.options.cleanBuilds = typeof this.options.cleanBuilds !== 'undefined' ? this.options.cleanBuilds : false;
    this.setImmediatePromise = _util2.default.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'info';
    this.options.onBuild = _options.onBuild ? _options.onBuild : _lodash2.default.noop;
    this.options.sync = typeof _options.sync === 'function' ? _options.sync() : _options.sync;
    this.logger = _loggerFactory2.default.getInstance(this.options.logLevel);
    this.state = {
      cleaned: false,
      watching: false,
      setupDone: false
    };
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new _clientlibTemplateEngine2.default(false, this.options.templateSettings);
  }

  setUp() {
    var _this = this;

    if (this.state.setupDone) {
      return;
    }

    this.state.watching = true;
    this.state.setupDone = true;

    if (this.options.sync) {
      this.syncer = new _syncer2.default(this.options.sync.targets, this.options.sync.pushInterval || 1000, this.options.sync.onPushEnd || _lodash2.default.noop);
    }

    if (this.isWatchEnabled()) {
      _lodash2.default.forEach(this.options.watchPaths, function (watch) {
        _this.createWatcher(watch.path, watch.match, watch.syncOnly);
      });
    }

    this.builder = new _builder2.default(this.options);
  }

  apply(compiler) {
    var _this2 = this;

    compiler.plugin('emit', function (compilation, callback) {

      _this2.setUp();

      _this2.copiedFiles = [];

      _this2.logger.info('compiler is emitting files...');

      if (_this2.exitOnErrors && compilation.errors.length) {
        return;
      }
      _this2.builder.build(compilation, compiler);
      setTimeout(function () {
        _this2.generateClientLibs(callback);
      }, 1000);
    });
  }

  createWatcher(path, pattern, isSyncOnly) {
    var _this3 = this;

    var nw = (0, _nodeWatch2.default)(path, {
      recursive: true,
      persistent: true
    }, function (evt, name) {
      if (_this3.syncer && evt === 'update') {
        if (typeof pattern === 'undefined' || (0, _micromatch2.default)([name], pattern).length > 0) {
          if (isSyncOnly) {
            _this3.syncer.enqueue(name);
          } else {
            _this3.generateClientLibs();
          }
        }
      }
    });

    process.on('SIGINT', nw.close);

    return nw;
  }

  generateClientLibs(callback) {
    var _this4 = this;

    var promise = this.options.before ? this.options.before : _util2.default.promisify(setImmediate);

    promise(this).then(function () {
      _this4.logger.info('generating clientlib...');
      if (_this4.options.cleanBuildsOnce && !_this4.state.cleaned) {
        _this4.state.cleaned = true;
        return _this4.cleanClientLibs().catch(_this4.handleError);
      } else if (_this4.options.cleanBuilds) {
        return _this4.cleanClientLibs().catch(_this4.handleError);
      }
      return _this4.setImmediatePromise();
    }).then(function () {
      return _this4.ensureClientLibFoldersExists();
    }).then(function () {
      return _this4.copyFilesToLibs();
    }).then(function () {
      return _this4.createClientLibConfig();
    }).then(function () {
      _this4.logger.info('clientlib generated');
      if (_this4.syncer && _this4.copiedFiles.length > 0) {
        _syncer2.default.uploadImmediately(_this4.copiedFiles, _this4.options.sync.targets, function (err, host, syncer) {
          console.log('new pending callback called');
          if (callback) {
            callback(err, host, syncer);
          }
          if (_this4.options.onBuild) {
            _this4.options.onBuild(_this4.options);
          }
          if (typeof _this4.options.sync.onPushEnd === 'function') {
            _this4.options.sync.onPushEnd();
          }
        }, _this4.options.logLevel);
        _this4.copiedFiles = [];
      } else if (callback) {
        callback();
        _this4.options.onBuild(_this4.options);
      }
      if (!_this4.isWatchEnabled()) {
        process.exit(0);
      }
      return true;
    }).catch(this.handleError);
  }

  cleanClientLibs() {
    var _this5 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this5.logger.verbose('cleaning directory:', _chalk2.default.cyan(_path2.default.relative(baseDir, dir)));
      var promise = _this5.options.beforeEach ? _this5.options.beforeEach : _util2.default.promisify(setImmediate);
      return promise(lib).then(function () {
        return _fsExtra2.default.emptyDir(dir).catch(_this5.handleError);
      }).catch(_this5.handleError);
    })).catch(this.handleError);
  }

  handleError(err) {
    console.error('aem-clientlib-webpack-plugin', 'handleError', err);
    console.trace('aem-clientlib-webpack-plugin', 'trace', err);
    if (this && this.isWatchEnabled && !this.isWatchEnabled()) {
      process.exit(1);
    }
  }

  ensureClientLibFoldersExists() {
    var _this6 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this6.logger.verbose('ensuring directory exists:', _chalk2.default.cyan(_path2.default.relative(baseDir, dir)));
      return _fsExtra2.default.ensureDir(dir).catch(_this6.handleError);
    }));
  }

  createClientLibConfig() {
    var _this7 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var templateFn = this.templateEngine.compile();
    var syncEntireLib = false;
    if (typeof this.isFirstRun === 'undefined') {
      this.isFirstRun = true;
      if (this.options.sync && this.options.sync.pushEntireClientlibOnFirstRun) {
        syncEntireLib = true;
      }
    } else {
      this.isFirstRun = false;
    }
    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var xmlStr = templateFn({
        allowProxy: lib.allowProxy ? 'true' : 'false',
        categoryName: typeof lib.categoryName === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : '',
        embed: lib.embed ? lib.embed : ''
      });
      var file = _path2.default.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      var promise = _this7.options.beforeEach ? _this7.options.beforeEach : _util2.default.promisify(setImmediate);
      var uploadPromiseFn = Promise.resolve.bind(Promise);
      var matchResult = _this7.fileMatchesContent(file, xmlStr);
      if (_this7.syncer && (syncEntireLib || !matchResult)) {
        uploadPromiseFn = _syncer2.default.uploadImmediately;
        _this7.copiedFiles = [];
        _this7.logger.verbose('creating config:', _chalk2.default.cyan(_path2.default.relative(baseDir, file)));
      } else if (_this7.syncer && matchResult) {
        _this7.logger.verbose('no change to config:', _chalk2.default.cyan(_path2.default.relative(baseDir, file)));
        return uploadPromiseFn();
      }
      return promise(lib).then(function () {
        return _fsExtra2.default.outputFile(file, xmlStr).then(function () {
          return uploadPromiseFn(file, _this7.options.sync.targets, _this7.options.sync.onPushEnd, _this7.options.logLevel);
        });
      }).catch(_this7.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs() {
    var _this8 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      return _this8.copyAssetFilesToLib(lib, baseDir);
    })).catch(this.handleError);
  }

  copyAssetFilesToLib(lib) {
    var _this9 = this;

    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var clientLibPath = _path2.default.resolve(baseDir, lib.destination, lib.name);
    var promises = [];
    Object.keys(lib.assets).forEach(function (kind) {
      var promise = _this9.options.beforeEach ? _this9.options.beforeEach : _util2.default.promisify(setImmediate);
      promise(lib).then(function () {
        var assets = _this9.buildAssetPaths(lib.assets[kind], kind, baseDir);
        assets.forEach(function (asset, i) {
          var srcFile = _path2.default.resolve(baseDir, assets[i].src);
          var destFolder = _path2.default.resolve(clientLibPath, assets[i].dest);
          var destFile = _path2.default.resolve(clientLibPath, assets[i].dest, _path2.default.basename(srcFile));
          asset.destFile = destFile;
          _fsExtra2.default.ensureDirSync(destFolder);
          var compareResult = _this9.compareFileFunc(srcFile, destFile);
          if (compareResult === true || compareResult === 'dir' && !_fs2.default.existsSync(destFile)) {
            promises.push(_fsExtra2.default.copy(srcFile, destFile, {
              preserveTimestamps: true
            }).catch(_this9.handleError));
            _this9.copiedFiles.push(destFile);
          }
        });
        if (['js', 'css'].indexOf(kind) > -1) {
          promises.push(_this9.createAssetTextFile(assets, kind, clientLibPath, typeof lib.baseTxtFile === 'object' ? lib.baseTxtFile[kind] : null).catch(_this9.handleError));
        }
        return true;
      });
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this10 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile) {
      var flattenedPaths = _this10.flattenAssetPathPatterns(sourceFile, kind, baseDir);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    var _this11 = this;

    return _lodash2.default.map(_glob2.default.sync(pattern.src ? pattern.src : pattern, {
      cwd: baseDir
    }), function (src) {
      return {
        src,
        dest: _this11.getDestPath(pattern, kind, src),
        excludeFromTxt: typeof pattern === 'object' && typeof pattern.excludeFromTxt === 'boolean' ? pattern.excludeFromTxt : false
      };
    });
  }

  getDestPath(pattern, kind, src) {
    var destFolder = './';
    if (typeof pattern === 'object' && pattern.dest) {
      destFolder = pattern.dest;
    }
    return pattern.base ? _path2.default.dirname(_path2.default.join(kind, destFolder, _path2.default.relative(pattern.base, src))) : _path2.default.join(kind, destFolder);
  }

  createAssetTextFile(assets, kind, clientlibFolder, baseTxtFile) {
    var text = [`#base=${kind}`];
    assets = _lodash2.default.sortBy(assets, ['destFile']);
    assets.forEach(function (asset) {
      if (!_path2.default.extname(asset.destFile).endsWith(kind)) {
        return;
      }
      if (asset.excludeFromTxt) {
        return;
      }
      var relativePath = _path2.default.relative(_path2.default.resolve(clientlibFolder, kind), asset.destFile);
      if (_path2.default.basename(relativePath) === relativePath) {
        text.push(relativePath);
      } else if (text.lastIndexOf(`#base=${_path2.default.dirname(relativePath)}`) === -1) {
        text.push(`#base=${_path2.default.dirname(relativePath)}`);
        text.push(_path2.default.basename(relativePath));
      } else {
        text.push(_path2.default.basename(relativePath));
      }
    });
    var destFile = _path2.default.resolve(clientlibFolder, `${kind}.txt`);
    var txtContent = text.join('\n');
    if (typeof baseTxtFile === 'string' && _fsExtra2.default.existsSync(baseTxtFile)) {
      var txFileContext = _fsExtra2.default.readFileSync(baseTxtFile);
      txtContent = `${txFileContext}\n${text.join('\n')}`;
    }
    this.copiedFiles.push(destFile);
    return _fsExtra2.default.outputFile(destFile, txtContent).catch(this.handleError);
  }

  compareFileFunc(src, dest) {
    var file1 = _fsExtra2.default.existsSync(src);
    var file2 = _fsExtra2.default.existsSync(dest);
    if (file1 === true && file2 === false) {
      return true;
    } else if (file1 === false) {
      return false;
    }
    var stats1 = _fsExtra2.default.statSync(src);
    var stats2 = _fsExtra2.default.statSync(dest);
    if (stats1.isDirectory()) {
      return 'dir';
    } else if (stats1.mtimeMs !== stats2.mtimeMs) {
      this.logger.verbose('copying file.', _chalk2.default.cyan(_path2.default.relative(this.options.context, src)));
      return true;
    } else if (stats1.size !== stats2.size) {
      this.logger.verbose('copying file:', _chalk2.default.cyan(_path2.default.relative(this.options.context, src)));
      return true;
    }
    this.logger.verbose('skipping file', _chalk2.default.cyan(_path2.default.relative(this.options.context, src)));
    return false;
  }

  fileMatchesContent(filePath, content) {
    return _fsExtra2.default.existsSync(filePath) && _fsExtra2.default.readFileSync(filePath).toString() === content;
  }

  isWatchEnabled() {
    return process.argv.indexOf('--watch') !== -1;
  }
}

exports.default = AEMClientLibGeneratorPlugin; /* eslint no-console: 0 */
/* imports */

class SyncerUtil extends _syncer2.default {}
exports.SyncerUtil = SyncerUtil;
class BuilderUtil extends _builder2.default {}
exports.BuilderUtil = BuilderUtil;