'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

require('babel-core/register');

require('babel-polyfill');

var _crypto = require('crypto');

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _filesize = require('filesize');

var _filesize2 = _interopRequireDefault(_filesize);

var _fsExtra = require('fs-extra');

var _fsExtra2 = _interopRequireDefault(_fsExtra);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _loggerFactory = require('./logger-factory');

var _loggerFactory2 = _interopRequireDefault(_loggerFactory);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var assetSourceHashIndex = {};
var isMemoryFileSystem = function isMemoryFileSystem(outputFileSystem) {
  return outputFileSystem.constructor.name === 'MemoryFileSystem';
};

class Builder {
  constructor(_options) {
    this.options = _options;
    this.logger = _loggerFactory2.default.getInstance(this.options.logLevel || 'info');
  }
  build(compilation, compiler) {
    var _this = this;

    this.logger.verbose(`writeCompiledFiles ${new Date().toLocaleTimeString()}`);

    this.options.build = _lodash2.default.assign({}, this.options.build);

    var outputPath = _lodash2.default.has(compiler, 'options.output.path') && compiler.options.output.path !== '/' ? compiler.options.output.path : _path2.default.resolve(process.cwd(), 'build');

    if (!isMemoryFileSystem(compiler.outputFileSystem) && !this.options.build.force) {
      this.logger.verbose(`----- ${!isMemoryFileSystem(compiler.outputFileSystem)} - ${!this.options.build.force}`);
      return false;
    }

    _lodash2.default.forEach(compilation.assets, function (asset, assetPath) {
      var outputFilePath = _path2.default.isAbsolute(assetPath) ? assetPath : _path2.default.join(outputPath, assetPath);
      var relativeOutputPath = _path2.default.relative(process.cwd(), outputFilePath);
      var targetDefinition = `asset: ${_chalk2.default.cyan(`./${assetPath}`)}; destination: ${_chalk2.default.cyan(`./${relativeOutputPath}`)}`;

      var assetSize = asset.size();
      var assetSource = Array.isArray(asset.source()) ? asset.source().join('\n') : asset.source();

      if (_this.options.build.useHashIndex) {
        var assetSourceHash = (0, _crypto.createHash)('sha256').update(assetSource).digest('hex');
        if (assetSourceHashIndex[assetPath] && assetSourceHashIndex[assetPath] === assetSourceHash) {
          _this.logger.verbose(targetDefinition, _chalk2.default.yellow('[skipped; matched hash index]'));
          return;
        }
        assetSourceHashIndex[assetPath] = assetSourceHash;
      }

      _fsExtra2.default.ensureDirSync(_path2.default.dirname(relativeOutputPath));

      try {
        _fsExtra2.default.writeFileSync(relativeOutputPath.split('?')[0], assetSource);
        _this.logger.verbose(targetDefinition, _chalk2.default.green('[written]'), _chalk2.default.magenta(`(${(0, _filesize2.default)(assetSize)})`));
      } catch (exp) {
        _this.logger.verbose(targetDefinition, _chalk2.default.bold.red('[is not written]'), _chalk2.default.magenta(`(${(0, _filesize2.default)(assetSize)})`));
        _this.logger.verbose(_chalk2.default.bold.bgRed('Exception:'), _chalk2.default.bold.red(exp.message));
      }
    });

    return true;
  }
}
exports.default = Builder;