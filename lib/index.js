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

var _util = require('util');

var util = _interopRequireWildcard(_util);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _nodeWatch = require('node-watch');

var _nodeWatch2 = _interopRequireDefault(_nodeWatch);

var _clientlibTemplateEngine = require('./clientlib-template-engine');

var _clientlibTemplateEngine2 = _interopRequireDefault(_clientlibTemplateEngine);

var _logger = require('./logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class AEMClientLibGeneratorPlugin {
  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.setImmediatePromise = util.promisify(setImmediate);
    this.logger = _logger.LoggerFactory.getInstance(_options.logLevel);
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new _clientlibTemplateEngine2.default(false, this.options.templateSettings);
  }

  apply(compiler) {
    var _this = this;

    compiler.plugin('done', function () /*stats*/{
      // Create a header string for the generated file:
      _this.logger.verbose('compiler has emitted files...');

      var watchList = _this.buildWatchList();

      _this.logger.verbose('watching following folders:');
      _this.logger.verbose(watchList);

      var nw = (0, _nodeWatch2.default)(watchList, {
        recursive: true,
        persistent: true
      }, _.debounce(_this.generateClientLibs.bind(_this), 1000));

      process.on('SIGINT', nw.close);

      return _this.generateClientLibs().catch(_this.handleError);
    });
  }

  generateClientLibs() {
    var _this2 = this;

    return this.setImmediatePromise().then(function () {
      _this2.logger.info('generating clientlib');
      if (_this2.options.cleanBuilds) {
        return _this2.cleanClientLibs().catch(_this2.handleError);
      }
      return _this2.setImmediatePromise();
    }).then(function () {
      return _this2.createBlankClientLibFolders();
    }).then(function () {
      return _this2.createClientLibConfig();
    }).then(function () {
      return _this2.copyFilesToLibs();
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
      return FSE.remove(dir).catch(_this4.handleError);
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
      return FSE.outputFile(file, xmlStr).catch(_this6.handleError);
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
        _this8.logger.verbose(`copying asset: ${_path2.default.relative(baseDir, srcFile)} to ${_path2.default.relative(baseDir, destFile)}`);
        promises.push(FSE.ensureDir(destFolder).then(function () {
          return FSE.copyFile(srcFile, destFile).catch(_this8.handleError);
        }));
      });
      if (['js', 'css'].indexOf(kind) > -1) {
        _this8.createAssetTextFile(assets, kind, clientLibPath);
      }
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this9 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile, i) {
      var flattenedPaths = _this9.flattenAssetPathPatterns(sourceFiles[i], kind, baseDir);
      _this9.logger.verbose(`flattened paths:${flattenedPaths}`);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    return _.map(Glob.sync(pattern.src ? pattern.src : pattern, { cwd: baseDir }), function (src) {
      return { src, dest: typeof pattern === 'object' && pattern.dest ? kind + _path2.default.sep + pattern.dest : kind };
    });
  }

  createAssetTextFile(assets, kind, clientlibFolder) {
    var text = [`#base=${kind}`];
    assets = _.sortBy(assets, ['destFile']);
    assets.forEach(function (asset) {
      if (!_path2.default.extname(asset.destFile).endsWith(kind)) {
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
    return FSE.outputFile(destFile, text.join('\n')).catch(this.handleError);
  }
}
exports.default = AEMClientLibGeneratorPlugin;