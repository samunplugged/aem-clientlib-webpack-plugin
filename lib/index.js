'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _glob = require('glob');

var Glob = _interopRequireWildcard(_glob);

var _fsExtra = require('fs-extra');

var FSE = _interopRequireWildcard(_fsExtra);

var _logger = require('./logger');

var _clientlibTemplateEngine = require('./clientlib-template-engine');

var _clientlibTemplateEngine2 = _interopRequireDefault(_clientlibTemplateEngine);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class AEMClientLibGeneratorPlugin {
  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.logger = _logger.LoggerFactory.getInstance(_options.logLevel);
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new _clientlibTemplateEngine2.default(false, this.options.templateSettings);
  }

  apply(compiler) {
    var _this = this;

    compiler.plugin('compile', function () /*params*/{
      _this.logger.info('\nThe compiler is starting to compile...\n');
    });

    compiler.plugin('compilation', function (compilation) {
      _this.logger.info('\nThe compiler is starting a new compilation...\n');

      compilation.plugin('optimize', function () {
        _this.logger.info('\nThe compilation is starting to optimize files...\n');
      });
    });

    compiler.plugin('emit', function (compilation, callback) {
      // Create a header string for the generated file:
      _this.logger.info('\nThe compilation is starting to emit files...\n');

      Object.keys(compilation.assets).forEach(function (filename) {
        _this.logger.verbose(filename);
      });

      _this.logger.verbose(`now going to create directory under base: ${_this.options.context}`);

      if (_this.options.cleanBuilds) {
        return _this.cleanClientLibs().then(function () {
          return _this.generateClientLibs(callback);
        }).catch(function () {
          return _this.handleError();
        });
      } else {
        return _this.generateClientLibs(callback).catch(function () {
          return _this.handleError();
        });
      }
    });
  }

  generateClientLibs(callback) {
    var _this2 = this;

    return this.createBlankClientLibFolders().then(function () {
      return _this2.createClientLibConfig();
    }).then(function () {
      return _this2.copyFilesToLibs();
    }).then(function () {
      callback();
    }).catch(function () {
      return _this2.handleError();
    });
  }

  cleanClientLibs() {
    var _this3 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      return FSE.remove(dir).catch(function () {
        return _this3.handleError();
      });
    })).catch(function () {
      return _this3.handleError();
    });
  }

  handleError(err) {
    throw new Error(err);
  }

  createBlankClientLibFolders() {
    var _this4 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      var dir = _path2.default.resolve(baseDir, lib.destination, lib.name);
      _this4.logger.verbose(`Creating directory: ${dir}`);
      return FSE.ensureDir(dir).catch(function () {
        return _this4.handleError();
      });
    }));
  }

  createClientLibConfig() {
    var _this5 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var templateFn = this.templateEngine.compile();
    return Promise.all(_.map(libs, function (lib) {
      var xmlStr = templateFn({
        name: lib.name,
        dependencies: lib.dependencies ? lib.dependencies : ''
      });
      var file = _path2.default.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      _this5.logger.verbose(`Creating directory: ${file}`);
      return FSE.outputFile(file, xmlStr).catch(function () {
        return _this5.handleError();
      });
    })).catch(function () {
      return _this5.handleError();
    });
  }

  copyFilesToLibs() {
    var _this6 = this;

    var libs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.libs;
    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    return Promise.all(_.map(libs, function (lib) {
      return _this6.copyAssetFilesToLib(lib, baseDir);
    })).catch(function () {
      return _this6.handleError();
    });
  }

  copyAssetFilesToLib(lib) {
    var _this7 = this;

    var baseDir = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.context;

    var clientLibPath = _path2.default.resolve(baseDir, lib.destination, lib.name);
    var promises = [];
    Object.keys(lib.assets).forEach(function (kind) {
      var assets = _this7.buildAssetPaths(lib.assets[kind], kind, baseDir);
      assets.forEach(function (asset, i) {
        var srcFile = _path2.default.resolve(baseDir, assets[i].src);
        var destFolder = _path2.default.resolve(clientLibPath, assets[i].dest);
        var destFile = _path2.default.resolve(clientLibPath, assets[i].dest, _path2.default.basename(srcFile));
        asset.destFile = destFile;
        _this7.logger.verbose(`Copying asset: ${srcFile} to ${destFile}`);
        promises.push(FSE.ensureDir(destFolder).then(function () {
          return FSE.copyFile(srcFile, destFile).catch(function () {
            return _this7.handleError();
          });
        }));
      });
      if (['js', 'css'].indexOf(kind) > -1) {
        _this7.createAssetTextFile(assets, kind, clientLibPath);
      }
    });
    return Promise.all(promises).catch(function () {
      return _this7.handleError();
    });
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    var _this8 = this;

    var paths = [];
    sourceFiles.forEach(function (sourceFile, i) {
      var flattenedPaths = _this8.flattenAssetPathPatterns(sourceFiles[i], kind, baseDir);
      _this8.logger.verbose(`flattened paths:${flattenedPaths}`);
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
    var _this9 = this;

    var text = [`#base=${kind}`];
    assets = _.sortBy(assets, ['destFile']);
    assets.forEach(function (asset) {
      console.log('ext:' + _path2.default.extname(asset.destFile));
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
    var destFile = _path2.default.resolve(clientlibFolder, kind + '.txt');
    return FSE.outputFile(destFile, text.join('\n')).catch(function () {
      return _this9.handleError();
    });
  }
}
exports.default = AEMClientLibGeneratorPlugin;
//# sourceMappingURL=index.js.map