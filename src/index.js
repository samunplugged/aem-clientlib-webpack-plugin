/* eslint no-console: 0 */
/* imports */
import _ from 'lodash';
import 'babel-core/register';
import 'babel-polyfill';
import Chalk from 'chalk';
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
import Syncer from './syncer';
import Builder from './builder';
/* imports end */

export default class AEMClientLibGeneratorPlugin {

  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.exitOnErrors = typeof (this.options.exitOnErrors) !== 'undefined' ? this.options.exitOnErrors : true;
    this.options.cleanBuildsOnce = typeof (this.options.cleanBuildsOnce) !== 'undefined' ? this.options.cleanBuildsOnce : true;
    this.options.cleanBuilds = typeof (this.options.cleanBuilds) !== 'undefined' ? this.options.cleanBuilds : false;
    this.setImmediatePromise = Util.promisify(setImmediate);
    this.options.logLevel = _options.logLevel ? _options.logLevel : 'info';
    this.options.onBuild = _options.onBuild ? _options.onBuild : _.noop;
    this.options.sync = typeof _options.sync === 'function' ? _options.sync() : _options.sync;
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

    if (this.options.sync) {
      this.syncer = new Syncer(this.options.sync.targets, this.options.sync.pushInterval || 1000, this.options.sync.onPushEnd || _.noop);
    }

    if (this.isWatchEnabled()) {
      _.forEach(this.options.watchPaths, (watch) => {
        this.createWatcher(watch.path, watch.match, watch.syncOnly);
      });
    }

    this.builder = new Builder(this.options);
  }

  apply(compiler) {

    compiler.plugin('emit', (compilation, callback) => {

      this.setUp();

      this.copiedFiles = [];

      this.logger.info('compiler is emitting files...');

      if (this.exitOnErrors && compilation.errors.length) {
        return;
      }
      this.builder.build(compilation, compiler);
      setTimeout(() => {
        this.generateClientLibs(callback);
      }, 1000);
    });
  }

  createWatcher(path, pattern, isSyncOnly) {
    const nw = Watch(path, {
      recursive: true,
      persistent: true,
    }, ((evt, name) => {
        if (this.syncer && evt === 'update') {
          if (typeof (pattern) === 'undefined' || MM([name], pattern).length > 0) {
            if (isSyncOnly) {
              this.syncer.enqueue(name);
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

    promise(this).then(() => {
      this.logger.info('generating clientlib...');
      if (this.options.cleanBuildsOnce && !this.state.cleaned) {
        this.state.cleaned = true;
        return this.cleanClientLibs().catch(this.handleError);
      } else if (this.options.cleanBuilds) {
        return this.cleanClientLibs().catch(this.handleError);
      }
      return this.setImmediatePromise();
    }).then(() => this.ensureClientLibFoldersExists())
      .then(() => this.copyFilesToLibs())
      .then(() => this.createClientLibConfig())
      .then(() => {
        this.logger.info('clientlib generated');
        if (this.syncer && this.copiedFiles.length > 0) {
          Syncer.uploadImmediately(this.copiedFiles, this.options.sync.targets, (err, host, syncer) => {
            console.log('new pending callback called');
            if (callback) {
              callback(err, host, syncer);
            }
            if (this.options.onBuild) {
              this.options.onBuild(this.options);
            }
            if (typeof this.options.sync.onPushEnd === 'function') {
              this.options.sync.onPushEnd();
            }
          }, this.options.logLevel);
          this.copiedFiles = [];
        } else if (callback) {
          callback();
          this.options.onBuild(this.options);
        }
        if (!this.isWatchEnabled()) {
          process.exit(0);
        }
        return true;
      })
      .catch(this.handleError);
  }

  cleanClientLibs(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      this.logger.verbose('cleaning directory:', Chalk.cyan(Path.relative(baseDir, dir)));
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

  ensureClientLibFoldersExists(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      this.logger.verbose('ensuring directory exists:', Chalk.cyan(Path.relative(baseDir, dir)));
      return FSE.ensureDir(dir).catch(this.handleError);
    }));
  }

  createClientLibConfig(libs = this.options.libs, baseDir = this.options.context) {
    const templateFn = this.templateEngine.compile();
    let syncEntireLib = false;
    if (typeof this.isFirstRun === 'undefined') {
      this.isFirstRun = true;
      if (this.options.sync && this.options.sync.pushEntireClientlibOnFirstRun) {
        syncEntireLib = true;
      }
    } else {
      this.isFirstRun = false;
    }
    return Promise.all(_.map(libs, (lib) => {
      const xmlStr = templateFn({
        allowProxy: lib.allowProxy ? 'true' : 'false',
        categoryName: typeof (lib.categoryName) === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : '',
        embed: lib.embed ? lib.embed : ''
      });
      const file = Path.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      let uploadPromiseFn = Promise.resolve.bind(Promise);
      const matchResult = this.fileMatchesContent(file, xmlStr);
      if (this.syncer && (syncEntireLib || !matchResult)) {
        uploadPromiseFn = Syncer.uploadImmediately;
        this.copiedFiles = [];
        this.logger.verbose('creating config:', Chalk.cyan(Path.relative(baseDir, file)));
      } else if (this.syncer && matchResult) {
        this.logger.verbose('no change to config:', Chalk.cyan(Path.relative(baseDir, file)));
        return uploadPromiseFn();
      }
      return promise(lib).then(() => FSE.outputFile(file, xmlStr).then(() => uploadPromiseFn(file, this.options.sync.targets, this.options.sync.onPushEnd, this.options.logLevel))).catch(this.handleError);
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
      this.logger.verbose('copying file.', Chalk.cyan(Path.relative(this.options.context, src)));
      return true;
    } else if (stats1.size !== stats2.size) {
      this.logger.verbose('copying file:', Chalk.cyan(Path.relative(this.options.context, src)));
      return true;
    }
    this.logger.verbose('skipping file', Chalk.cyan(Path.relative(this.options.context, src)));
    return false;
  }

  fileMatchesContent(filePath, content) {
    return FSE.existsSync(filePath) && FSE.readFileSync(filePath).toString() === content;
  }

  isWatchEnabled() {
    return process.argv.indexOf('--watch') !== -1;
  }
}

export class SyncerUtil extends Syncer {}
export class BuilderUtil extends Builder {}
