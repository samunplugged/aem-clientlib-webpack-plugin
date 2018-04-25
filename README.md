# aem-clientlib-webpack-plugin
a webpack plugin to create clientlib(s) 

<img src="https://travis-ci.org/samunplugged/aem-clientlib-webpack-plugin.svg?branch=master" />

## Install
You can install the AEM Clientlib Webpack plugin as a dependency using either NPM or Yarn.

### Install dependency with npm

```sh
npm install --save-dev aem-clientlib-webpack-plugin
```

### Install dependency with yarn

```sh
yarn add -D aem-clientlib-webpack-plugin
```

## Set-up configuration file
A config file is a JS file that exports an Object literal and specifies settings to be used by the plugin. Save the following file as: `clientlib.config.js`

### clientlib.config.js
```js
module.exports = {
  // context: this sets the base directory of your project from which all other paths are derived
  context: __dirname, 
  
  // watchPaths: an array of path you want to observe for change. 
  // Even without this option, the webpack plugin will run on successful builds. 
  // This option is here in case you want to sync files outside of your 'ui' code folder. 
  // This is relative to 'context' and if this is not specified all of 'context' 
  // will be watched which can cause multiple generation of clientlibs. 
  watchPaths: [
    // any changes to matching files will result in generation of client libs and if sync is enabled they will be synced
    {path: Path.resolve(__dirname, '../legacy-code/js'), match: "**"},
    // if the syncOnly option is set to true then clients won't be generated, but those files will be synced to AEM server
    {path: Path.resolve(__dirname, '../'), match: "**/jcr_root/apps/**/*.html", syncOnly: true}
  ]
  
  // logLevel: this sets the log level. You can specify 'info', 'verbose', or 'off'
  logLevel: 'info',
  
  // cleanBuilds: this clears the destination folders you specify for clientlibs
  cleanBuilds: true,
  
  // cleanBuildsOnce: true (default) clears the destination folders you run webpack for first time.
  cleanBuildsOnce: false,

  // libs: this is an array of objects. each object specify a 'clientlib' to be created
  libs: [
    {
      // name: name of the clientlib. a folder by this name will be created in destination folder.
      name: "weretail.all",
      // categoryName: specifiy of the clientlib to be used in content.xml (if this is not specified, then value of 'name' property would be used)
      categoryName: "weretail.all",
      // destination: specify where you want to generate the clientlib. a relative path is required.
      destination: "../weretail/ui.apps/src/main/content/jcr_root/etc/clientlibs",
      // assets: specifies folders you want in your clientlib. each asset 'kind' is created as a folder.
      assets: {
        // js: when assets object contains 'js', a js.txt will be created and its content will include all files with .js extension. glob patterns are supported.
        js: [
          "build/dist/templates/main.js",
          "build/dist/templates/main.js.map",
          // you can also pass objects like below:
          {
            src: "../legacy-code/js/", // you may want to copy code from outside of build system 
            excludeFromTxt: true, // you may want to exclude it from txt file (optional: by default all files will be included)
            dest:'../legacy-code' // here by using two dots we will ensure its copied at same level as js folder being created
          }
        ],
        // css: when assets object contains 'css', a js.txt will be created and its content will include all files with .css extension. glob patterns are supported.
        css: [
          "build/dist/css/main.css",
          "build/dist/css/**/*.css"
        ],
        // resources: the best practices is to place all your static assets in resources
        // src: specifies the files to copy 
        // dest: specifies the relative path where copied files will go. this is relative to the  name of your clientlib - in this case its 'resources'. by specifying ./ you are asking files from src/assets/** to be copied to resources/ 
        // base: if you specify a glob and don't specify the base, then all matching will be copied to dest folder and no heirarchy will be created. In order for tool to know how to figure out heirarchy specify the base option. In most cases it will be the part of 'src' before the magic ** - in this case src/assets
        resources: [
          {src: "src/assets/**", dest: "./", base:"src/assets"}
        ]
      }
      // baseTxtFile: if you want you can ask this tool to use an existing .txt file as base
      baseTxtFile: {
        js: path.resolve(__dirname, '../legacy-code/js.txt')
      }
    },
    {
      // name: name of the clientlib. a folder by this name will be created in destination folder.
      name: "weretail.rtl",
      // categoryName: specifiy of the clientlib to be used in content.xml (if this is not specified, then value of 'name' property would be used)
      categoryName: "weretail.all",
      // destination: specify where you want to generate the clientlib. a relative path is required.
      destination: "../weretail/ui.apps/src/main/content/jcr_root/etc/clientlibs",
      // dependencies: comma seperated list of dependencies for this clientlib. 
      // in this case we are generating a clientlib with just CSS and it depends on weretail.all we created earlier.
      dependencies: "weretail.all",
      assets: {
        css: [
          "build/dist/css/main.rtl.css"
        ]
      }
    }

  ],

  // beforeEach: is called for each lib before the lib's code is generated
  beforeEach: function(lib) {
    // return a promise. 
    // resolve the promise when you want tool to continue
    // or reject the promise when you want tool to skip generating clientlib
    return Promise.resolve(true);
  },

  // before: is called before the first clientlib is generated
  before: function() {
    return Promise.resolve(true);
    // return a promise. 
    // resolve the promise when you want tool to continue
    // or reject the promise when you want tool to skip generating clientlib
  }

  // generation of clientlibs depends on webpack writing the files
  // if you already writing to disk using write-file-webpack-plugin
  // then you can set build.force: false
  // this plugin will also write file to disk like the write-file-webpack-plugin
  // this basically means that during development, your build destination is updated
  build: {
    force: false
  }
}

```


### Set-up project to use this plugin
Import the dependency. Both ES6 and 1.4 syntax are given below for your benefit.

#### JavaScript 1.4 syntax
```js
var AEMClientlibWebpackPlugin = require('aem-clientlib-webpack-plugin').default;
```

#### ES6 syntax
```js
import * as AEMClientlibWebpackPlugin from 'aem-clientlib-webpack-plugin';
```


### Use the plugin
Finally, use the plugin. Simply add this in plugin section of your webpack config.

#### For both JavaScript 1.4 and ES6
```js
plugins: [
  new AEMClientlibWebpackPlugin(require('./clientlib.config.js'))
]
```

## Using during development

You can use this plugin in developement mode to auto-generate clientlibs while you develop. However, you must add write-file-webpack-plugin. This plugin ensure that the webpack-dev-server writes files to disk, so that it can be copied by this plugin. See: [write-file-webpack-plugin](https://github.com/gajus/write-file-webpack-plugin). Your webpack config would look like this:

```js
var AEMClientlibWebpackPlugin = require('aem-clientlib-webpack-plugin').default;
var WriteFileWebpackPlugin = require('write-file-webpack-plugin');
// ...
plugins: [
  // ...
  new AEMClientlibWebpackPlugin(require('./clientlib.config.js')),
  new WriteFileWebpackPlugin()
  // ...
]
// ...
```

# Enable sync with server during development
To enable sync during development, to enable sync with AEM server, this tool uses aemsync which uses Package Manager service of Adobe AEM server.

Update your clientlib config so it looks something like this:

```js
  // sync: can be function that returns an Object.
  sync: {
    // specify AEM server URLs
    targets: [
        'http://admin:admin@127.0.0.1:4502'
    ],
    pushInterval: 1000,
    onPushEnd: ((err, host, pusher) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(`Last sync to ${host} at ${(new Date()).toTimeString()}`);
    }),
    pushEntireClientlibOnFirstRun: true
  }
  
]
// ...
```



## TODO

1. Expand the settings you can specify in your clientlib.config.js
1. Split the project into two projects, so the core functionality can be used without Webpack
