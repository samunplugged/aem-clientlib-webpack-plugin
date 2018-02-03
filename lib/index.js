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

var _psNode = require('ps-node');

var _psNode2 = _interopRequireDefault(_psNode);

var _nodeWatch = require('node-watch');

var _nodeWatch2 = _interopRequireDefault(_nodeWatch);

var _copyNewer = require('copy-newer');

var _copyNewer2 = _interopRequireDefault(_copyNewer);

var _clientlibTemplateEngine = require('./clientlib-template-engine');

var _clientlibTemplateEngine2 = _interopRequireDefault(_clientlibTemplateEngine);

var _logger = require('./logger');

require('babel-core/register');

require('babel-polyfill');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class AEMClientLibGeneratorPlugin {
  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof this.options.exitOnErrors !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof this.options.cleanBuildsOnce !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.setImmediatePromise = Util.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'verbose';
    this.logger = _logger.LoggerFactory.getInstance(this.options.logLevel);
    this.state = {
      cleaned: false,
      watching: false
    };
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new _clientlibTemplateEngine2.default(false, this.options.templateSettings);
  }

  setUp() {
    this.state.watching = true;

    var watchList = this.buildWatchList();

    this.logger.verbose('watching following folders:');
    this.logger.verbose(watchList);

    var nw = (0, _nodeWatch2.default)(watchList, {
      recursive: true,
      persistent: true
    }, _.debounce(this.generateClientLibs.bind(this), 300, { maxWait: 6000 }));

    process.on('SIGINT', nw.close);
  }

  apply(compiler) {
    var _this = this;

    compiler.plugin('done', function (stats) {
      if (!_this.state.watching) {
        _this.setUp();
      }
      // Create a header string for the generated file:
      _this.logger.verbose('compiler has emitted files...');

      if (_this.exitOnErrors && stats.compilation.errors.length) {
        return;
      }

      _this.generateClientLibs();
    });
  }

  generateClientLibs() {
    var _this2 = this;

    var promise = this.options.before ? this.options.before : Util.promisify(setImmediate);

    promise().then(function () {
      _this2.logger.info(`generating clientlib ${_this2.options.cleanBuildsOnce} --- ${_this2.state.cleaned}`);
      if (_this2.options.cleanBuildsOnce && !_this2.state.cleaned) {
        _this2.state.cleaned = true;
        return _this2.cleanClientLibs().catch(_this2.handleError);
      } else if (_this2.options.cleanBuilds) {
        return _this2.cleanClientLibs().catch(_this2.handleError);
      }
      return _this2.setImmediatePromise();
    }).then(function () {
      return _this2.createBlankClientLibFolders();
    }).then(function () {
      return _this2.createClientLibConfig();
    }).then(function () {
      return _this2.copyFilesToLibs();
    }).then(function () {
      _this2.logger.info('clientlib generated' + new Date().toLocaleTimeString());
      return true;
    }).catch(this.handleError);
  }

  buildWatchList() {
    var _this3 = this;

    if (this.options.watchDir) {
      var files = [];
      if (typeof this.options.watchDir === 'string') {
        files = files.concat(Glob.sync(this.options.watchDir, { cwd: this.options.context }));
      } else {
        _.forEach(this.options.watchDir, function (dir) {
          files = files.concat(Glob.sync(dir, { cwd: _this3.options.context }));
        });
      }
      return files;
    }
    return this.options.context;
  }

  cleanClientLibs() {
    var _this4 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this4.logger.verbose(`cleaning directory: ${dir}`);
      var promise = _this4.options.beforeEach ? _this4.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(function () {
        return FSE.emptyDir(dir).catch(_this4.handleError);
      }).catch(_this4.handleError);
    })).catch(this.handleError);
  }

  handleError(err) {
    console.error('aem-clientlib-webpack-plugin', 'handleError', err);
    console.trace('aem-clientlib-webpack-plugin', 'trace', err);
  }

  createBlankClientLibFolders() {
    var _this5 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this5.logger.verbose(`creating directory: ${dir}`);
      return FSE.ensureDir(dir).catch(_this5.handleError);
    }));
  }

  createClientLibConfig() {
    var _this6 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var templateFn = this.templateEngine.compile();
    return Promise.all(_.map(libs, function (lib) {
      var xmlStr = templateFn({
        categoryName: typeof lib.categoryName === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : ''
      });
      var file = _path2.default.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      _this6.logger.verbose(`creating file: ${file}`);
      var promise = _this6.options.beforeEach ? _this6.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(function () {
        return FSE.outputFile(file, xmlStr).catch(_this6.handleError);
      }).catch(_this6.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs() {
    var _this7 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      return _this7.copyAssetFilesToLib(lib, baseDir);
    })).catch(this.handleError);
  }

  copyAssetFilesToLib(lib) {
    var _this8 = this;

    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;


    var clientLibPath = _path2.default.resolve(baseDir, lib.destination, lib.name);
    var promises = [];
    Object.keys(lib.assets).forEach(function (kind) {
      var assets = _this8.buildAssetPaths(lib.assets[kind], kind, baseDir);
      assets.forEach(function (asset, i) {
        var srcFile = _path2.default.resolve(baseDir, assets[i].src);
        var destFolder = _path2.default.resolve(clientLibPath, assets[i].dest);
        var destFile = _path2.default.resolve(clientLibPath, assets[i].dest, _path2.default.basename(srcFile));
        asset.destFile = destFile;
        var promise = _this8.options.beforeEach ? _this8.options.beforeEach : Util.promisify(setImmediate);
        promises.push(promise(lib).then(function () {
          return FSE.ensureDir(destFolder).then(function () {
            return FSE.copy(srcFile, destFile, { preserveTimestamps: true, filter: _this8.compareFileFunc.bind(_this8) }).catch(_this8.handleError);
          });
        }));
      });
      if (['js', 'css'].indexOf(kind) > -1) {
        _this8.createAssetTextFile(assets, kind, clientLibPath, typeof lib.baseTxtFile === 'object' ? lib.baseTxtFile[kind] : null);
      }
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this9 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile, i) {
      var flattenedPaths = _this9.flattenAssetPathPatterns(sourceFile, kind, baseDir);
      _this9.logger.info(`${sourceFile} flattened paths:${flattenedPaths}`);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    return _.map(Glob.sync(pattern.src ? pattern.src : pattern, { cwd: baseDir }), function (src) {
      return { src, dest: typeof pattern === 'object' && pattern.dest ? kind + _path2.default.sep + pattern.dest : kind, excludeFromTxt: typeof pattern === 'object' && typeof pattern.excludeFromTxt === 'boolean' ? pattern.excludeFromTxt : false };
    });
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

    return FSE.outputFile(destFile, txtContent).catch(this.handleError);
  }

  doesFileExists(filepath) {
    var promise = new Promise(function (resolve, reject) {
      return FS.exists(filepath, function (exists) {
        if (!exists) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    }).catch(this.handleError);
    return promise;
  }

  getFileStat(filepath) {
    var _this10 = this;

    var promise = new Promise(function (resolve, reject) {
      _this10.doesFileExists(filepath).then(function (exists) {
        if (!exists) {
          resolve(false);
          return;
        }
        return FS.stat(filepath, function (err, stats) {
          if (err) {
            resolve(false);
            return;
          }
          resolve(stats);
        });
      }).catch(_this10.handleError);
    }).catch(this.handleError);
    return promise;
  }

  compareFileFunc(src, dest) {
    var _this11 = this;

    var promise = new Promise(function (resolve, reject) {
      Promise.all([_this11.getFileStat(src), _this11.getFileStat(dest)]).then(function (values) {
        if (values.length < 2 || values[0] === false || values[1] === false) {
          resolve(true);
          return;
        }
        var stats1 = values[0];
        var stats2 = values[1];
        if (stats1.mtimeMs !== stats2.mtimeMs) {
          _this11.logger.verbose(`copying file: ${_path2.default.relative(_this11.options.context, src)} to ${_path2.default.relative(_this11.options.context, dest)}`);
          resolve(true);
        } else if (stats1.size !== stats2.size) {
          _this11.logger.verbose(`copying file:: ${_path2.default.relative(_this11.options.context, src)} to ${_path2.default.relative(_this11.options.context, dest)}`);
          resolve(true);
        } else {
          _this11.logger.verbose(`skipping file: ${_path2.default.relative(_this11.options.context, src)}`);
          resolve(false);
        }
      }).catch(_this11.handleError);
    });
    return promise;
  }
}
exports.default = AEMClientLibGeneratorPlugin;