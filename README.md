# aem-clientlib-webpack-plugin
a webpack plugin to create clientlib(s) 

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
  // watchDir: this specified the path of folder to watch. In most projects this will be your build directory. This is relative to 'context' and if this is not specified all of 'context' will be watched which can cause multiple generation of clientlibs. you can use glob pattern and can also use array of paths/patterns
  watchDir: 'build',
  // logLevel: this sets the log level. You can specify 'info', 'verbose', or 'off'
  logLevel: 'info',
  // cleanBuilds: this clears the destination folders you specify for clientlibs
  cleanBuilds: true,
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
            src: "js/legacy-code", // you may want to copy code outside of build system 
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
        // dest: specifies the folder where copied files will go. this is relative to resources folder. 
        resources: [
          {src: "src/assets/fonts/**", dest: "fonts/"},
          {src: "src/assets/images/**", dest: "images/"}
        ]
      }
      // baseTxtFile: if you want you can ask this tool to use an existing .txt file as base
      baseTxtFile: {
        js: path.resolve(__dirname, 'src/legacy/mcd-us/js.txt')
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

  ]


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

# Enable sync with server
To enable sync during development, you also need to include [aem-sync-webpack-plugin](https://github.com/lukaszblasz/aem-sync-webpack-plugin) and [write-file-webpack-plugin](https://github.com/gajus/write-file-webpack-plugin). 

Update your project's webpack config so it looks something like this:

```js
var AEMClientlibWebpackPlugin = require('aem-clientlib-webpack-plugin').default;
var WriteFileWebpackPlugin = require('write-file-webpack-plugin');
var AemSyncPlugin = require('aem-sync-webpack-plugin');
// ...
plugins: [
  // ...
  new AEMClientlibWebpackPlugin(require('./clientlib.config.js')),
  new WriteFileWebpackPlugin(),
  new AemSyncPlugin({
    targets: [
        'http://admin:admin@localhost:4502'
    ],
    watchDir: path.resolve(__dirname, '../'), // this is currently pointing to parent folder. you just need to point it to project's root folder. my project's root is outside of my UI source code folder
    exclude: '**/ui-source/**', // ignoring UI source code. you may instead choose to ignore node_modules by specifying '**/node_modules/**'
    pushInterval: 1000
  })
  // ...
]
// ...
```



## TODO

1. Expand the settings you can specify in your clientlib.config.js
1. Split the project into two projects, so the core functionality can be used without Webpack
