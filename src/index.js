import * as _ from 'lodash';

import * as Glob from 'glob';
import * as FSE from 'fs-extra';
import * as util from 'util';
import Path from 'path';
import Watch from 'node-watch';
import ClientlibTemplateEngine from './clientlib-template-engine';
import {LoggerFactory} from './logger';

export default class AEMClientLibGeneratorPlugin {
  constructor(_options) {
    // Configure your plugin with options...
    this.options = _options;
    this.setImmediatePromise = util.promisify(setImmediate);
    this.logger = LoggerFactory.getInstance(_options.logLevel);
    // TODO: allow use of this.options.templatePath
    this.templateEngine = new ClientlibTemplateEngine(false, this.options.templateSettings);
  }

  apply(compiler) {

    compiler.plugin('done', (/*stats*/) => {
      // Create a header string for the generated file:
      this.logger.verbose('\ncompiler has emitted files...\n');

      const watchList = this.buildWatchList();

      this.logger.verbose('\nwatching following folders:\n');
      this.logger.verbose(watchList);

      const nw = Watch(watchList, {
        recursive: true,
        persistent: true,
      }, _.debounce(this.generateClientLibs.bind(this), 1000));

      process.on('SIGINT', nw.close);

      return this.generateClientLibs().catch(() => this.handleError());


    });
  }

  generateClientLibs() {
    return this.setImmediatePromise()
      .then(() => {
        this.logger.info('\ngenerating clientlib\n');
        if (this.options.cleanBuilds) {
          return this.cleanClientLibs().catch(() => this.handleError());
        }
        return this.setImmediatePromise();
      })
      .then(() => this.createBlankClientLibFolders())
      .then(() => this.createClientLibConfig())
      .then(() => this.copyFilesToLibs())
      .catch(() => this.handleError());
  }

  buildWatchList() {
    if (this.options.watchDir) {
      let files = [];
      if (typeof (this.options.watchDir) === 'string') {
        files = files.concat(Glob.sync(this.options.watchDir, { cwd: this.options.context }));
      } else {
        _.forEach(this.options.watchDir, (dir) => {
          files = files.concat(Glob.sync(dir, { cwd: this.options.context }));
        });
      }
      return files;
    }
    return this.options.context;

  }

  cleanClientLibs(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      return FSE.remove(dir).catch(() => this.handleError());
    })).catch(() => this.handleError());
  }

  handleError(err) {
    throw new Error(err);
  }

  createBlankClientLibFolders(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, (lib) => {
      const dir = Path.resolve(baseDir, lib.destination, lib.name);
      this.logger.verbose(`Creating directory: ${dir}`);
      return FSE.ensureDir(dir).catch(() => this.handleError());
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
      this.logger.verbose(`Creating directory: ${file}`);
      return FSE.outputFile(file, xmlStr).catch(() => this.handleError());
    })).catch(() => this.handleError());
  }

  copyFilesToLibs(libs = this.options.libs, baseDir = this.options.context) {
    return Promise.all(_.map(libs, lib => this.copyAssetFilesToLib(lib, baseDir))).catch(() => this.handleError());
  }

  copyAssetFilesToLib(lib, baseDir = this.options.context) {
    const clientLibPath = Path.resolve(baseDir, lib.destination, lib.name);
    const promises = [];
    Object.keys(lib.assets).forEach((kind) => {
      const assets = this.buildAssetPaths(lib.assets[kind], kind, baseDir);
      assets.forEach((asset, i) => {
        const srcFile = Path.resolve(baseDir, assets[i].src);
        const destFolder = Path.resolve(clientLibPath, assets[i].dest);
        const destFile = Path.resolve(clientLibPath, assets[i].dest, Path.basename(srcFile));
        asset.destFile = destFile;
        this.logger.verbose(`Copying asset: ${srcFile} to ${destFile}`);
        promises.push(FSE.ensureDir(destFolder).then(() => FSE.copyFile(srcFile, destFile).catch(() => this.handleError())));
      });
      if (['js', 'css'].indexOf(kind) > -1) {
        this.createAssetTextFile(assets, kind, clientLibPath);
      }
    });
    return Promise.all(promises).catch(() => this.handleError());
  }

  buildAssetPaths(sourceFiles, kind, baseDir) {
    let paths = [];
    sourceFiles.forEach((sourceFile, i) => {
      const flattenedPaths = this.flattenAssetPathPatterns(sourceFiles[i], kind, baseDir);
      this.logger.verbose(`flattened paths:${flattenedPaths}`);
      paths = paths.concat(flattenedPaths);
    });
    return paths;
  }

  flattenAssetPathPatterns(pattern, kind, baseDir) {
    return _.map(Glob.sync(pattern.src ? pattern.src : pattern, { cwd: baseDir }), src => ({ src, dest: (typeof pattern === 'object' && pattern.dest) ? kind + Path.sep + pattern.dest : kind }));
  }

  createAssetTextFile(assets, kind, clientlibFolder) {
    const text = [`#base=${kind}`];
    assets = _.sortBy(assets, ['destFile']);
    assets.forEach((asset) => {
      if (!Path.extname(asset.destFile).endsWith(kind)) {
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
    return FSE.outputFile(destFile, text.join('\n')).catch(() => this.handleError());
  }
}
