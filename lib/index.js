'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _glob = require('glob');

var Glob = _interopRequireWildcard(_glob);

var _fsExtra = require('fs-extra');

var FSE = _interopRequireWildcard(_fsExtra);

var _fs = require('fs');

var FS = _interopRequireWildcard(_fs);

var _util = require('util');

var Util = _interopRequireWildcard(_util);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _nodeWatch = require('node-watch');

var _nodeWatch2 = _interopRequireDefault(_nodeWatch);

var _clientlibTemplateEngine = require('./clientlib-template-engine');

var _clientlibTemplateEngine2 = _interopRequireDefault(_clientlibTemplateEngine);

var _micromatch = require('micromatch');

var _micromatch2 = _interopRequireDefault(_micromatch);

var _logger = require('./logger');

require('babel-core/register');

require('babel-polyfill');

var _aemsync = require('aemsync');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class AEMClientLibGeneratorPlugin {

  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof this.options.exitOnErrors !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof this.options.cleanBuildsOnce !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.options.cleanBuilds = typeof this.options.cleanBuilds !== 'undefined' ? this.options.cleanBuilds : false;
    this.setImmediatePromise = Util.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'info';
    this.logger = _logger.LoggerFactory.getInstance(this.options.logLevel);
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
      _.forEach(this.options.watchPaths, function (watch) {
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
      });
      this.pusher.start();
    }
  }

  apply(compiler) {
    var _this2 = this;

    compiler.plugin('done', function (stats) {

      _this2.setUp();

      // Create a header string for the generated file:
      _this2.logger.verbose('compiler has emitted files...');

      if (_this2.exitOnErrors && stats.compilation.errors.length) {
        return;
      }

      _this2.generateClientLibs();
    });
  }

  createWatcher(path, pattern, isSyncOnly) {
    var _this3 = this;

    var nw = (0, _nodeWatch2.default)(path, {
      recursive: true,
      persistent: true
    }, function (evt, name) {
      if (_this3.pusher && evt === 'update') {
        if (typeof pattern === 'undefined' || (0, _micromatch2.default)([name], pattern).length > 0) {
          if (isSyncOnly) {
            _this3.pusher.enqueue(name);
          } else {
            _this3.generateClientLibs();
          }
        }
      }
    });

    process.on('SIGINT', nw.close);

    return nw;
  }

  generateClientLibs() {
    var _this4 = this;

    var promise = this.options.before ? this.options.before : Util.promisify(setImmediate);

    promise().then(function () {
      _this4.logger.info(`generating clientlib... ${new Date().toLocaleTimeString()}`);
      if (_this4.options.cleanBuildsOnce && !_this4.state.cleaned) {
        _this4.state.cleaned = true;
        return _this4.cleanClientLibs().catch(_this4.handleError);
      } else if (_this4.options.cleanBuilds) {
        return _this4.cleanClientLibs().catch(_this4.handleError);
      }
      return _this4.setImmediatePromise();
    }).then(function () {
      return _this4.createBlankClientLibFolders();
    }).then(function () {
      return _this4.createClientLibConfig();
    }).then(function () {
      return _this4.copyFilesToLibs();
    }).then(function () {
      _this4.logger.info(`clientlib generated - ${new Date().toLocaleTimeString()}`);
      if (_this4.pusher && _this4.copiedFiles) {
        _this4.copiedFiles.forEach(function (file) {
          _this4.pusher.enqueue(file);
        });
      }
      if (!_this4.isWatchEnabled()) {
        process.exit(0);
      }
      return true;
    }).catch(this.handleError);
  }

  buildWatchList() {
    var _this5 = this;

    if (this.options.watchDir) {
      var files = [];
      if (typeof this.options.watchDir === 'string') {
        files = files.concat(Glob.sync(this.options.watchDir, {
          cwd: this.options.context
        }));
      } else {
        _.forEach(this.options.watchDir, function (dir) {
          files = files.concat(Glob.sync(dir, {
            cwd: _this5.options.context
          }));
        });
      }
      return files;
    }
    return this.options.context;
  }

  cleanClientLibs() {
    var _this6 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this6.logger.verbose(`cleaning directory: ${dir}`);
      var promise = _this6.options.beforeEach ? _this6.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(function () {
        return FSE.emptyDir(dir).catch(_this6.handleError);
      }).catch(_this6.handleError);
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
    var _this7 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this7.logger.verbose(`creating directory: ${dir}`);
      return FSE.ensureDir(dir).catch(_this7.handleError);
    }));
  }

  createClientLibConfig() {
    var _this8 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var templateFn = this.templateEngine.compile();
    return Promise.all(_.map(libs, function (lib) {
      var xmlStr = templateFn({
        categoryName: typeof lib.categoryName === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : ''
      });
      var file = _path2.default.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      _this8.logger.verbose(`creating file: ${file}`);
      var promise = _this8.options.beforeEach ? _this8.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(function () {
        return FSE.outputFile(file, xmlStr).catch(_this8.handleError);
      }).catch(_this8.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs() {
    var _this9 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    this.copiedFiles = [];
    return Promise.all(_.map(libs, function (lib) {
      return _this9.copyAssetFilesToLib(lib, baseDir);
    })).catch(this.handleError);
  }

  copyAssetFilesToLib(lib) {
    var _this10 = this;

    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var clientLibPath = _path2.default.resolve(baseDir, lib.destination, lib.name);
    var promises = [];
    Object.keys(lib.assets).forEach(function (kind) {
      var promise = _this10.options.beforeEach ? _this10.options.beforeEach : Util.promisify(setImmediate);
      promise(lib).then(function () {
        var assets = _this10.buildAssetPaths(lib.assets[kind], kind, baseDir);
        assets.forEach(function (asset, i) {
          var srcFile = _path2.default.resolve(baseDir, assets[i].src);
          var destFolder = _path2.default.resolve(clientLibPath, assets[i].dest);
          var destFile = _path2.default.resolve(clientLibPath, assets[i].dest, _path2.default.basename(srcFile));
          asset.destFile = destFile;
          FSE.ensureDirSync(destFolder);
          var compareResult = _this10.compareFileFunc(srcFile, destFile);
          if (compareResult === true || compareResult === 'dir' && !FS.existsSync(destFile)) {
            promises.push(FSE.copy(srcFile, destFile, {
              preserveTimestamps: true
            }).catch(_this10.handleError));
            _this10.copiedFiles.push(destFile);
          }
        });
        if (['js', 'css'].indexOf(kind) > -1) {
          promises.push(_this10.createAssetTextFile(assets, kind, clientLibPath, typeof lib.baseTxtFile === 'object' ? lib.baseTxtFile[kind] : null).catch(_this10.handleError));
        }
        return true;
      });
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this11 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile) {
      var flattenedPaths = _this11.flattenAssetPathPatterns(sourceFile, kind, baseDir);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    var _this12 = this;

    return _.map(Glob.sync(pattern.src ? pattern.src : pattern, {
      cwd: baseDir
    }), function (src) {
      return {
        src,
        dest: _this12.getDestPath(pattern, kind, src),
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
    assets = _.sortBy(assets, ['destFile']);
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
    if (typeof baseTxtFile === 'string' && FSE.existsSync(baseTxtFile)) {
      var txFileContext = FSE.readFileSync(baseTxtFile);
      txtContent = `${txFileContext}\n${text.join('\n')}`;
    }
    this.copiedFiles.push(destFile);
    return FSE.outputFile(destFile, txtContent).catch(this.handleError);
  }

  compareFileFunc(src, dest) {
    var file1 = FSE.existsSync(src);
    var file2 = FSE.existsSync(dest);
    if (file1 === true && file2 === false) {
      return true;
    } else if (file1 === false) {
      return false;
    }
    var stats1 = FSE.statSync(src);
    var stats2 = FSE.statSync(dest);
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