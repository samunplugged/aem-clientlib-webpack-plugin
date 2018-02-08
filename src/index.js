/* eslint no-console: 0 */
/* imports */
import {
  createHash
} from 'crypto';
import {
  Pusher
} from 'aemsync';
import { setTimeout } from 'timers';
import _ from 'lodash';
import 'babel-core/register';
import 'babel-polyfill';
import Chalk from 'chalk';
import Filesize from 'filesize';
import FSE from 'fs-extra';
import FS from 'fs';
import Glob from 'glob';
import MM from 'micromatch';
import Path from 'path';
import Util from 'util';
import Watch from 'node-watch';


/* relative imports */
import ClientlibTemplateEngine from './clientlib-template-engine';
import LoggerFactory from './logger-factory';
/* imports end */

const assetSourceHashIndex = {};
const isMemoryFileSystem = outputFileSystem => outputFileSystem.constructor.name === 'MemoryFileSystem';

export default class AEMClientLibGeneratorPlugin {

  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof (this.options.exitOnErrors) !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof (this.options.cleanBuildsOnce) !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.options.cleanBuilds = typeof (this.options.cleanBuilds) !== 'undefined' ? this.options.cleanBuilds : false;
    this.setImmediatePromise = Util.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'info';
    this.logger = LoggerFactory.getInstance(this.options.logLevel);
    this.state = {
      cleaned: false,
      watching: false,
      setupDone: false
    };
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new ClientlibTemplateEngine(false, this.options.templateSettings);
  }

  setUp() {
    if (this.state.setupDone) {
      return;
    }
    this.state.watching = true;
    this.state.setupDone = true;

    if (this.isWatchEnabled()) {
      _.forEach(this.options.watchPaths, (watch) => {
        this.createWatcher(watch.path, watch.match, watch.syncOnly);
      });
    }

    if (this.options.sync) {
      this.pusher = new Pusher(this.options.sync.targets, this.options.sync.pushInterval, (err, host) => {
        if (err) {
          this.logger.error('Error when pushing package', err);
        } else {
          this.logger.info(`Package pushed to ${host}`);
        }
        if (this.options.sync.onPushEnd) {
          this.options.sync.onPushEnd(err, host, this.pusher);
        }
        setTimeout(() => {
          if (typeof (this.pendingCallback) === 'function') {
            this.pendingCallback();
            this.pendingCallback = null;
          }
        }, 1000);
      });
      this.pusher.start();
    }
  }

  apply(compiler) {

    compiler.plugin('emit', (compilation, callback) => {

      this.setUp();

      this.logger.info('compiler is emitting files...');

      if (this.exitOnErrors && compilation.errors.length) {
        return;
      }

      this.writeCompiledFiles(compilation, compiler);

      setTimeout((() => {
        this.generateClientLibs(callback);
      }), 1000);

    });
  }

  writeCompiledFiles(compilation, compiler) {
    this.logger.info(`writeCompiledFiles ${(new Date()).toLocaleTimeString()}`);

    this.options.build = _.assign({}, this.options.build);

    const outputPath = (_.has(compiler, 'options.output.path') && compiler.options.output.path !== '/') ? compiler.options.output.path : Path.resolve(process.cwd(), 'build');

    if (!isMemoryFileSystem(compiler.outputFileSystem) && !this.options.build.force) {
      this.logger.info(`----- ${!isMemoryFileSystem(compiler.outputFileSystem)} - ${!this.options.build.force}`);
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
          this.logger.info(targetDefinition, Chalk.yellow('[skipped; matched hash index]'));
          return;
        }
        assetSourceHashIndex[assetPath] = assetSourceHash;
      }

      FSE.ensureDirSync(Path.dirname(relativeOutputPath));

      try {
        FSE.writeFileSync(relativeOutputPath.split('?')[0], assetSource);
        this.logger.info(targetDefinition, Chalk.green('[written]'), Chalk.magenta(`(${Filesize(assetSize)})`));
      } catch (exp) {
        this.logger.info(targetDefinition, Chalk.bold.red('[is not written]'), Chalk.magenta(`(${Filesize(assetSize)})`));
        this.logger.info(Chalk.bold.bgRed('Exception:'), Chalk.bold.red(exp.message));
      }
    });

    return true;
  }

  createWatcher(path, pattern, isSyncOnly) {
    const nw = Watch(path, {
      recursive: true,
      persistent: true,
    }, ((evt, name) => {
        if (this.pusher && evt === 'update') {
          if (typeof (pattern) === 'undefined' || MM([name], pattern).length > 0) {
            if (isSyncOnly) {
              this.pusher.enqueue(name);
            } else {
              this.generateClientLibs();
            }
          }
        }
      }));

    process.on('SIGINT', nw.close);

    return nw;
  }

  generateClientLibs(callback) {

    const promise = this.options.before ? this.options.before : Util.promisify(setImmediate);

    promise().then(() => {
      this.logger.info(`generating clientlib... ${(new Date()).toLocaleTimeString()}`);
      if (this.options.cleanBuildsOnce && !this.state.cleaned) {
        this.state.cleaned = true;
        return this.cleanClientLibs().catch(this.handleError);
      } else if (this.options.cleanBuilds) {
        return this.cleanClientLibs().catch(this.handleError);
      }
      return this.setImmediatePromise();
    }).then(() => this.createBlankClientLibFolders())
      .then(() => this.createClientLibConfig())
      .then(() => this.copyFilesToLibs())
      .then(() => {
        this.logger.info(`clientlib generated - ${(new Date()).toLocaleTimeString()}`);
        if (this.pusher && this.copiedFiles) {
          if (callback) {
            this.pendingCallback = callback;
          }
          this.copiedFiles.forEach((file) => {
            this.pusher.enqueue(file);
          });
        } else if (callback) {
          callback();
        }
        if (!this.isWatchEnabled()) {
          process.exit(0);
        }
        return true;
      })
      .catch(this.handleError);

  }

  buildWatchList() {
    if (this.options.watchDir) {
      let files = [];
      if (typeof (this.options.watchDir) === 'string') {
        files = files.concat(Glob.sync(this.options.watchDir, {
          cwd: this.options.context,
        }));
      } else {
        _.forEach(this.options.watchDir, (dir) => {
          files = files.concat(Glob.sync(dir, {
            cwd: this.options.context,
          }));
        });
      }
      return files;
    }
    return this.options.context;

  }

  cleanClientLibs(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      this.logger.verbose(`cleaning directory: ${dir}`);
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(() => FSE.emptyDir(dir).catch(this.handleError)).catch(this.handleError);
    })).catch(this.handleError);
  }

  handleError(err) {
    console.error('aem-clientlib-webpack-plugin', 'handleError', err);
    console.trace('aem-clientlib-webpack-plugin', 'trace', err);
    if (this && this.isWatchEnabled && !this.isWatchEnabled()) {
      process.exit(1);
    }
  }

  createBlankClientLibFolders(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      this.logger.verbose(`creating directory: ${dir}`);
      return FSE.ensureDir(dir).catch(this.handleError);
    }));
  }

  createClientLibConfig(libs = this.options.libs, baseDir = this.options.context) {
    this.copiedFiles = [];
    const templateFn = this.templateEngine.compile();
    return Promise.all(_.map(libs, (lib) => {
      const xmlStr = templateFn({
        categoryName: typeof (lib.categoryName) === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : '',
      });
      const file = Path.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      this.logger.verbose(`creating file: ${file}`);
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      this.copiedFiles.push(file);
      return promise(lib).then(() => FSE.outputFile(file, xmlStr).catch(this.handleError)).catch(this.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, lib => this.copyAssetFilesToLib(lib, baseDir))).catch(this.handleError);
  }

  copyAssetFilesToLib(lib, baseDir = this.options.context) {
    const clientLibPath = Path.resolve(baseDir, lib.destination, lib.name);
    const promises = [];
    Object.keys(lib.assets).forEach((kind) => {
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      promise(lib).then(() => {
        const assets = this.buildAssetPaths(lib.assets[kind], kind, baseDir);
        assets.forEach((asset, i) => {
          const srcFile = Path.resolve(baseDir, assets[i].src);
          const destFolder = Path.resolve(clientLibPath, assets[i].dest);
          const destFile = Path.resolve(clientLibPath, assets[i].dest, Path.basename(srcFile));
          asset.destFile = destFile;
          FSE.ensureDirSync(destFolder);
          const compareResult = this.compareFileFunc(srcFile, destFile);
          if (compareResult === true || (compareResult === 'dir' && !FS.existsSync(destFile))) {
            promises.push(FSE.copy(srcFile, destFile, {
              preserveTimestamps: true
            }).catch(this.handleError));
            this.copiedFiles.push(destFile);
          }
        });
        if (['js', 'css'].indexOf(kind) > -1) {
          promises.push(this.createAssetTextFile(assets, kind, clientLibPath, (typeof (lib.baseTxtFile) === 'object') ? lib.baseTxtFile[kind] : null).catch(this.handleError));
        }
        return true;
      });
    });
    return Promise.all(promises).catch(this.handleError);
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    let paths = [];
    sourceFiles.forEach((sourceFile) => {
      const flattenedPaths = this.flattenAssetPathPatterns(sourceFile, kind, baseDir);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    return _.map(Glob.sync(pattern.src ? pattern.src : pattern, {
      cwd: baseDir
    }), src => ({
      src,
      dest: this.getDestPath(pattern, kind, src),
      excludeFromTxt: (typeof pattern === 'object' && typeof (pattern.excludeFromTxt) === 'boolean') ? pattern.excludeFromTxt : false,
    }));
  }

  getDestPath(pattern, kind, src) {
    let destFolder = './';
    if (typeof pattern === 'object' && pattern.dest) {
      destFolder = pattern.dest;
    }
    return pattern.base ? Path.dirname(Path.join(kind, destFolder, Path.relative(pattern.base, src))) : Path.join(kind, destFolder);
  }

  createAssetTextFile(assets, kind, clientlibFolder, baseTxtFile) {
    const text = [`#base=${kind}`];
    assets = _.sortBy(assets, ['destFile']);
    assets.forEach((asset) => {
      if (!Path.extname(asset.destFile).endsWith(kind)) {
        return;
      }
      if (asset.excludeFromTxt) {
        return;
      }
      const relativePath = Path.relative(Path.resolve(clientlibFolder, kind), asset.destFile);
      if (Path.basename(relativePath) === relativePath) {
        text.push(relativePath);
      } else if (text.lastIndexOf(`#base=${Path.dirname(relativePath)}`) === -1) {
        text.push(`#base=${Path.dirname(relativePath)}`);
        text.push(Path.basename(relativePath));
      } else {
        text.push(Path.basename(relativePath));
      }
    });
    const destFile = Path.resolve(clientlibFolder, `${kind}.txt`);
    let txtContent = text.join('\n');
    if (typeof (baseTxtFile) === 'string' && FSE.existsSync(baseTxtFile)) {
      const txFileContext = FSE.readFileSync(baseTxtFile);
      txtContent = `${txFileContext}\n${text.join('\n')}`;
    }
    this.copiedFiles.push(destFile);
    return FSE.outputFile(destFile, txtContent).catch(this.handleError);
  }

  compareFileFunc(src, dest) {
    const file1 = FSE.existsSync(src);
    const file2 = FSE.existsSync(dest);
    if (file1 === true && file2 === false) {
      return true;
    } else if (file1 === false) {
      return false;
    }
    const stats1 = FSE.statSync(src);
    const stats2 = FSE.statSync(dest);
    if (stats1.isDirectory()) {
      return 'dir';
    } else if (stats1.mtimeMs !== stats2.mtimeMs) {
      this.logger.verbose(`copying file: ${Path.relative(this.options.context, src)} to ${Path.relative(this.options.context, dest)}`);
      return true;
    } else if (stats1.size !== stats2.size) {
      this.logger.verbose(`copying file:: ${Path.relative(this.options.context, src)} to ${Path.relative(this.options.context, dest)}`);
      return true;
    }
    this.logger.verbose(`skipping file: ${Path.relative(this.options.context, src)}`);
    return false;
  }

  isWatchEnabled() {
    return process.argv.indexOf('--watch') !== -1;
  }
}
