import _ from 'lodash';
import 'babel-core/register';
import 'babel-polyfill';
import {
  createHash
} from 'crypto';
import Chalk from 'chalk';
import Filesize from 'filesize';
import FSE from 'fs-extra';
import Path from 'path';
import LoggerFactory from './logger-factory';

const assetSourceHashIndex = {};
const isMemoryFileSystem = outputFileSystem => outputFileSystem.constructor.name === 'MemoryFileSystem';

export default class Builder {
  constructor(_options) {
    this.options = _options;
    this.logger = LoggerFactory.getInstance(this.options.logLevel || 'info');
  }
  build(compilation, compiler) {
    this.logger.verbose(`writeCompiledFiles ${(new Date()).toLocaleTimeString()}`);

    this.options.build = _.assign({}, this.options.build);

    const outputPath = (_.has(compiler, 'options.output.path') && compiler.options.output.path !== '/') ? compiler.options.output.path : Path.resolve(process.cwd(), 'build');

    if (!isMemoryFileSystem(compiler.outputFileSystem) && !this.options.build.force) {
      this.logger.verbose(`----- ${!isMemoryFileSystem(compiler.outputFileSystem)} - ${!this.options.build.force}`);
      return false;
    }

    _.forEach(compilation.assets, (asset, assetPath) => {
      const outputFilePath = Path.isAbsolute(assetPath) ? assetPath : Path.join(outputPath, assetPath);
      const relativeOutputPath = Path.relative(process.cwd(), outputFilePath);
      const targetDefinition = `asset: ${Chalk.cyan(`./${assetPath}`)}; destination: ${Chalk.cyan(`./${relativeOutputPath}`)}`;

      const assetSize = asset.size();
      const assetSource = Array.isArray(asset.source()) ? asset.source().join('\n') : asset.source();

      if (this.options.build.useHashIndex) {
        const assetSourceHash = createHash('sha256').update(assetSource).digest('hex');
        if (assetSourceHashIndex[assetPath] && assetSourceHashIndex[assetPath] === assetSourceHash) {
          this.logger.verbose(targetDefinition, Chalk.yellow('[skipped; matched hash index]'));
          return;
        }
        assetSourceHashIndex[assetPath] = assetSourceHash;
      }

      FSE.ensureDirSync(Path.dirname(relativeOutputPath));

      try {
        FSE.writeFileSync(relativeOutputPath.split('?')[0], assetSource);
        this.logger.verbose(targetDefinition, Chalk.green('[written]'), Chalk.magenta(`(${Filesize(assetSize)})`));
      } catch (exp) {
        this.logger.verbose(targetDefinition, Chalk.bold.red('[is not written]'), Chalk.magenta(`(${Filesize(assetSize)})`));
        this.logger.verbose(Chalk.bold.bgRed('Exception:'), Chalk.bold.red(exp.message));
      }
    });

    return true;
  }
}
