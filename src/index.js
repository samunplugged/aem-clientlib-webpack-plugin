import * as _ from 'lodash';

import * as Glob from 'glob';
import * as FSE from 'fs-extra';
import * as FS from 'fs';
import * as Util from 'util';
import Path from 'path';
import Watch from 'node-watch';
import ClientlibTemplateEngine from './clientlib-template-engine';
import {
  LoggerFactory
} from './logger';
import 'babel-core/register';
import 'babel-polyfill';
import {
  Pusher
} from 'aemsync';

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

    const watchList = this.buildWatchList();

    this.logger.verbose('watching following folders:');
    this.logger.verbose(watchList);

    if (this.isWatchEnabled()) {
      const nw = Watch(watchList, {
        recursive: true,
        persistent: true,
      }, this.generateClientLibs.bind(this));

      process.on('SIGINT', nw.close);
    }

    if (this.options.sync) {
      this.pusher = new Pusher(this.options.sync.targets, this.options.sync.pushInterval, (err, host) => {
        if (err) {
          console.log('Error when pushing package', err);
        } else {
          console.log(`Package pushed to ${host}`);
        }
        if (this.options.sync.onPushEnd) {
          this.options.sync.onPushEnd(err, host, this.pusher);
        }
      });
      this.pusher.start();
    }
  }

  apply(compiler) {

    compiler.plugin('done', (stats) => {

      this.setUp();

      // Create a header string for the generated file:
      this.logger.verbose('compiler has emitted files...');

      if (this.exitOnErrors && stats.compilation.errors.length) {
        return;
      }

      this.generateClientLibs();
    });
  }

  generateClientLibs() {

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
          this.copiedFiles.forEach((file) => {
            this.pusher.enqueue(file);
          });
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
    const templateFn = this.templateEngine.compile();
    return Promise.all(_.map(libs, (lib) => {
      const xmlStr = templateFn({
        categoryName: typeof (lib.categoryName) === 'string' ? lib.categoryName : lib.name,
        dependencies: lib.dependencies ? lib.dependencies : '',
      });
      const file = Path.resolve(baseDir, lib.destination, lib.name, '.content.xml');
      this.logger.verbose(`creating file: ${file}`);
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      return promise(lib).then(() => FSE.outputFile(file, xmlStr).catch(this.handleError)).catch(this.handleError);
    })).catch(this.handleError);
  }

  copyFilesToLibs(libs = this.options.libs, baseDir = this.options.context) {
    this.copiedFiles = [];
    return Promise.all(_.map(libs, lib => this.copyAssetFilesToLib(lib, baseDir))).catch(this.handleError);
  }

  copyAssetFilesToLib(lib, baseDir = this.options.context) {
    const clientLibPath = Path.resolve(baseDir, lib.destination, lib.name);
    const promises = [];
    Object.keys(lib.assets).forEach((kind) => {
      const promise = this.options.beforeEach ? this.options.beforeEach : Util.promisify(setImmediate);
      promises.push(promise(lib).then(() => {
        const assets = this.buildAssetPaths(lib.assets[kind], kind, baseDir);
        assets.forEach((asset, i) => {
          const srcFile = Path.resolve(baseDir, assets[i].src);
          const destFolder = Path.resolve(clientLibPath, assets[i].dest);
          const destFile = Path.resolve(clientLibPath, assets[i].dest, Path.basename(srcFile));
          asset.destFile = destFile;
          FSE.ensureDirSync(destFolder);
          const compareResult = this.compareFileFunc(srcFile, destFile);
          if (compareResult === true || (compareResult === 'dir' && !FS.existsSync(destFile))) {
            FSE.copySync(srcFile, destFile, {
              preserveTimestamps: true
            });
            this.copiedFiles.push(destFile);
          }
        });
        if (['js', 'css'].indexOf(kind) > -1) {
          promises.push(this.createAssetTextFile(assets, kind, clientLibPath, (typeof (lib.baseTxtFile) === 'object') ? lib.baseTxtFile[kind] : null).catch(this.handleError));
        }
        return true;
      }));
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
    return process.argv.indexOf('--watch') != -1;
  }
}