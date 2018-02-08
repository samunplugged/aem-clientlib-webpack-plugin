'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _crypto = require('crypto');

var _aemsync = require('aemsync');

var _timers = require('timers');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

require('babel-core/register');

require('babel-polyfill');

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _filesize = require('filesize');

var _filesize2 = _interopRequireDefault(_filesize);

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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* imports end */

/* relative imports */
var assetSourceHashIndex = {}; /* eslint no-console: 0 */
/* imports */

var isMemoryFileSystem = function isMemoryFileSystem(outputFileSystem) {
  return outputFileSystem.constructor.name === 'MemoryFileSystem';
};

class AEMClientLibGeneratorPlugin {

  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof this.options.exitOnErrors !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof this.options.cleanBuildsOnce !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.options.cleanBuilds = typeof this.options.cleanBuilds !== 'undefined' ? this.options.cleanBuilds : false;
    this.setImmediatePromise = _util2.default.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'info';
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

    if (this.isWatchEnabled()) {
      _lodash2.default.forEach(this.options.watchPaths, function (watch) {
        _this.createWatcher(watch.path, watch.match, watch.syncOnly);
      });
    }

    if (this.options.sync) {
      this.pusher = new _aemsync.Pusher(this.options.sync.targets, this.options.sync.pushInterval, function (err, host) {
        if (err) {
          _this.logger.error('Error when pushing package', err);
        } else {
          _this.logger.info(`Package pushed to ${host}`);
        }
        if (_this.options.sync.onPushEnd) {
          _this.options.sync.onPushEnd(err, host, _this.pusher);
        }
        (0, _timers.setTimeout)(function () {
          if (typeof _this.pendingCallback === 'function') {
            _this.pendingCallback();
            _this.pendingCallback = null;
          }
        }, 1000);
      });
      this.pusher.start();
    }
  }

  apply(compiler) {
    var _this2 = this;

    compiler.plugin('emit', function (compilation, callback) {

      _this2.setUp();

      _this2.logger.info('compiler is emitting files...');

      if (_this2.exitOnErrors && compilation.errors.length) {
        return;
      }

      _this2.writeCompiledFiles(compilation, compiler);

      (0, _timers.setTimeout)(function () {
        _this2.generateClientLibs(callback);
      }, 1000);
    });
  }

  writeCompiledFiles(compilation, compiler) {
    var _this3 = this;

    this.logger.info(`writeCompiledFiles ${new Date().toLocaleTimeString()}`);

    this.options.build = _lodash2.default.assign({}, this.options.build);

    var outputPath = _lodash2.default.has(compiler, 'options.output.path') && compiler.options.output.path !== '/' ? compiler.options.output.path : _path2.default.resolve(process.cwd(), 'build');

    if (!isMemoryFileSystem(compiler.outputFileSystem) && !this.options.build.force) {
      this.logger.info(`----- ${!isMemoryFileSystem(compiler.outputFileSystem)} - ${!this.options.build.force}`);
      return false;
    }

    _lodash2.default.forEach(compilation.assets, function (asset, assetPath) {
      var outputFilePath = _path2.default.isAbsolute(assetPath) ? assetPath : _path2.default.join(outputPath, assetPath);
      var relativeOutputPath = _path2.default.relative(process.cwd(), outputFilePath);
      var targetDefinition = `asset: ${_chalk2.default.cyan(`./${assetPath}`)}; destination: ${_chalk2.default.cyan(`./${relativeOutputPath}`)}`;

      var assetSize = asset.size();
      var assetSource = Array.isArray(asset.source()) ? asset.source().join('\n') : asset.source();

      if (_this3.options.build.useHashIndex) {
        var assetSourceHash = (0, _crypto.createHash)('sha256').update(assetSource).digest('hex');
        if (assetSourceHashIndex[assetPath] && assetSourceHashIndex[assetPath] === assetSourceHash) {
          _this3.logger.info(targetDefinition, _chalk2.default.yellow('[skipped; matched hash index]'));
          return;
        }
        assetSourceHashIndex[assetPath] = assetSourceHash;
      }

      _fsExtra2.default.ensureDirSync(_path2.default.dirname(relativeOutputPath));

      try {
        _fsExtra2.default.writeFileSync(relativeOutputPath.split('?')[0], assetSource);
        _this3.logger.info(targetDefinition, _chalk2.default.green('[written]'), _chalk2.default.magenta(`(${(0, _filesize2.default)(assetSize)})`));
      } catch (exp) {
        _this3.logger.info(targetDefinition, _chalk2.default.bold.red('[is not written]'), _chalk2.default.magenta(`(${(0, _filesize2.default)(assetSize)})`));
        _this3.logger.info(_chalk2.default.bold.bgRed('Exception:'), _chalk2.default.bold.red(exp.message));
      }
    });

    return true;
  }

  createWatcher(path, pattern, isSyncOnly) {
    var _this4 = this;

    var nw = (0, _nodeWatch2.default)(path, {
      recursive: true,
      persistent: true
    }, function (evt, name) {
      if (_this4.pusher && evt === 'update') {
        if (typeof pattern === 'undefined' || (0, _micromatch2.default)([name], pattern).length > 0) {
          if (isSyncOnly) {
            _this4.pusher.enqueue(name);
          } else {
            _this4.generateClientLibs();
          }
        }
      }
    });

    process.on('SIGINT', nw.close);

    return nw;
  }

  generateClientLibs(callback) {
    var _this5 = this;

    var promise = this.options.before ? this.options.before : _util2.default.promisify(setImmediate);

    promise().then(function () {
      _this5.logger.info(`generating clientlib... ${new Date().toLocaleTimeString()}`);
      if (_this5.options.cleanBuildsOnce && !_this5.state.cleaned) {
        _this5.state.cleaned = true;
        return _this5.cleanClientLibs().catch(_this5.handleError);
      } else if (_this5.options.cleanBuilds) {
        return _this5.cleanClientLibs().catch(_this5.handleError);
      }
      return _this5.setImmediatePromise();
    }).then(function () {
      return _this5.createBlankClientLibFolders();
    }).then(function () {
      return _this5.createClientLibConfig();
    }).then(function () {
      return _this5.copyFilesToLibs();
    }).then(function () {
      _this5.logger.info(`clientlib generated - ${new Date().toLocaleTimeString()}`);
      if (_this5.pusher && _this5.copiedFiles) {
        if (callback) {
          _this5.pendingCallback = callback;
        }
        _this5.copiedFiles.forEach(function (file) {
          _this5.pusher.enqueue(file);
        });
      } else if (callback) {
        callback();
      }
      if (!_this5.isWatchEnabled()) {
        process.exit(0);
      }
      return true;
    }).catch(this.handleError);
  }

  buildWatchList() {
    var _this6 = this;

    if (this.options.watchDir) {
      var files = [];
      if (typeof this.options.watchDir === 'string') {
        files = files.concat(_glob2.default.sync(this.options.watchDir, {
          cwd: this.options.context
        }));
      } else {
        _lodash2.default.forEach(this.options.watchDir, function (dir) {
          files = files.concat(_glob2.default.sync(dir, {
            cwd: _this6.options.context
          }));
        });
      }
      return files;
    }
    return this.options.context;
  }

  cleanClientLibs() {
    var _this7 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this7.logger.verbose(`cleaning directory: ${dir}`);
      var promise = _this7.options.beforeEach ? _this7.options.beforeEach : _util2.default.promisify(setImmediate);
      return promise(lib).then(function () {
        return _fsExtra2.default.emptyDir(dir).catch(_this7.handleError);
      }).catch(_this7.handleError);
    })).catch(this.handleError);
  }

  handleError(err) {
    console.error('aem-clientlib-webpack-plugin', 'handleError', err);
    console.trace('aem-clientlib-webpack-plugin', 'trace', err);
    if (this && this.isWatchEnabled && !this.isWatchEnabled()) {
      process.exit(1);
    }
  }

  createBlankClientLibFolders() {
    var _this8 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this8.logger.verbose(`creating directory: ${dir}`);
      return _fsExtra2.default.ensureDir(dir).catch(_this8.handleError);
    }));
  }

  createClientLibConfig() {
    var _this9 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    this.copiedFiles = [];
    var templateFn = this.templateEngine.compile();
    return Promise.all(_lodash2.default.map(libs, function (lib) {
      var xmlStr = templateFn({
        categoryName: typeof lib.categoryName === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : ''
      });
      var file = _path2.default.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      _this9.logger.verbose(`creating file: ${file}`);
      var promise = _this9.options.beforeEach ? _this9.options.beforeEach : _util2.default.promisify(setImmediate);
      _this9.copiedFiles.push(file);
      return promise(lib).then(function () {
        return _fsExtra2.default.outputFile(file, xmlStr).catch(_this9.handleError);
      }).catch(_this9.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs() {
    var _this10 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_lodash2.default.map(libs, function (lib) {
      return _this10.copyAssetFilesToLib(lib, baseDir);
    })).catch(this.handleError);
  }

  copyAssetFilesToLib(lib) {
    var _this11 = this;

    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var clientLibPath = _path2.default.resolve(baseDir, lib.destination, lib.name);
    var promises = [];
    Object.keys(lib.assets).forEach(function (kind) {
      var promise = _this11.options.beforeEach ? _this11.options.beforeEach : _util2.default.promisify(setImmediate);
      promise(lib).then(function () {
        var assets = _this11.buildAssetPaths(lib.assets[kind], kind, baseDir);
        assets.forEach(function (asset, i) {
          var srcFile = _path2.default.resolve(baseDir, assets[i].src);
          var destFolder = _path2.default.resolve(clientLibPath, assets[i].dest);
          var destFile = _path2.default.resolve(clientLibPath, assets[i].dest, _path2.default.basename(srcFile));
          asset.destFile = destFile;
          _fsExtra2.default.ensureDirSync(destFolder);
          var compareResult = _this11.compareFileFunc(srcFile, destFile);
          if (compareResult === true || compareResult === 'dir' && !_fs2.default.existsSync(destFile)) {
            promises.push(_fsExtra2.default.copy(srcFile, destFile, {
              preserveTimestamps: true
            }).catch(_this11.handleError));
            _this11.copiedFiles.push(destFile);
          }
        });
        if (['js', 'css'].indexOf(kind) > -1) {
          promises.push(_this11.createAssetTextFile(assets, kind, clientLibPath, typeof lib.baseTxtFile === 'object' ? lib.baseTxtFile[kind] : null).catch(_this11.handleError));
        }
        return true;
      });
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this12 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile) {
      var flattenedPaths = _this12.flattenAssetPathPatterns(sourceFile, kind, baseDir);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    var _this13 = this;

    return _lodash2.default.map(_glob2.default.sync(pattern.src ? pattern.src : pattern, {
      cwd: baseDir
    }), function (src) {
      return {
        src,
        dest: _this13.getDestPath(pattern, kind, src),
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
      this.logger.verbose(`copying file: ${_path2.default.relative(this.options.context, src)} to ${_path2.default.relative(this.options.context, dest)}`);
      return true;
    } else if (stats1.size !== stats2.size) {
      this.logger.verbose(`copying file:: ${_path2.default.relative(this.options.context, src)} to ${_path2.default.relative(this.options.context, dest)}`);
      return true;
    }
    this.logger.verbose(`skipping file: ${_path2.default.relative(this.options.context, src)}`);
    return false;
  }

  isWatchEnabled() {
    return process.argv.indexOf('--watch') !== -1;
  }
}
exports.default = AEMClientLibGeneratorPlugin;