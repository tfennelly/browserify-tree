A library for analysing [Browserify] generated JavaScript bundles.

If you're interested in something like this you might also be interested in [disc], which
is a more visual analysis. This lib is useful for helping you to analyse how the dependencies
are wired together. Also useful if you are writing [Browserify] transforms/plugins that are
manipulating the bundle.

# CLI Usage

Install globally if you want to use the CLI:

``
sudo npm install -g browserify-tree
``

```
CLI options:
   --unusedt     Unused in the entry module's dependency tree.
   --unuseda     Unused anywhere i.e. no dependants in entry module's tree, or among other unused.

   --filter      Unused module listing filter.
                 (see --unusedt and --unuseda)
                 e.g. --filter=/node_modules/parse-asn1

   --unuseddc    List dependencies of unused modules (what the unused module depends on).
                 (see --unusedt and --unuseda)
   --unuseddd    List dependants of unused modules (what depends on the unused module).
                 (see --unusedt and --unuseda)

   --notree      Don't output the entry module's dependency tree.
```

And `--help` for help (printing the above).

Basic example:

```
$ browserify-tree ./target/classes/org/jenkins/ui/jsmodules/blueocean-usain/jenkins-js-extension.js

The bundle entry module is:
	/Users/tfennelly/zap/blueocean-usain/target/jenkins-js-extension.jsx
------------------------------------------------
=--/target/jenkins-js-extension.jsx (49952)
=  |--/src/main/js/Usain.jsx (48047)
=  |  |--/node_modules/@jenkins-cd/blueocean-core-js/dist/js/index.js (42790)
=  |  |  |--/node_modules/@jenkins-cd/js-modules/js/index.js (42660)
=  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/ModuleSpec.js (8844)
=  |  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/Version.js (2965)
=  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/internal.js (23980)
=  |  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/ModuleSpec.js (0) (skipped - see earlier resolve)
=  |  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/promise.js (1874)
=  |  |  |  |--/node_modules/@jenkins-cd/js-modules/js/promise.js (0) (skipped - see earlier resolve)
=  |  |--/node_modules/react/react.js (84)
=  |  |  |--/node_modules/@jenkins-cd/js-modules/js/index.js (0) (skipped - see earlier resolve)
=  |--/node_modules/@jenkins-cd/js-modules/js/index.js (0) (skipped - see earlier resolve)

Sorted by source length/size:
=--/target/jenkins-js-extension.jsx (49952)
=--/src/main/js/Usain.jsx (48047)
=--/node_modules/@jenkins-cd/blueocean-core-js/dist/js/index.js (42790)
=--/node_modules/@jenkins-cd/js-modules/js/index.js (42660)
=--/node_modules/@jenkins-cd/js-modules/js/internal.js (23980)
=--/node_modules/@jenkins-cd/js-modules/js/ModuleSpec.js (8844)
=--/node_modules/@jenkins-cd/js-modules/js/Version.js (2965)
=--/node_modules/@jenkins-cd/js-modules/js/promise.js (1874)
=--/node_modules/react/react.js (84)
------------------------------------------------

--help for options
```

Example showing:

1. unused modules in a bundle (`--unusedt`) + and what depends on those modules (`--unuseddd`).
1. not displaying the entry module's dependency tree (`--notree`).
1. only showing (`--filter`) modules in `/node_modules/@jenkins-cd/`.

```
browserify-tree ./target/classes/org/jenkins/ui/jsmodules/blueocean-usain/jenkins-js-extension.js --unusedt --unuseddd --notree --filter=/node_modules/@jenkins-cd/

The bundle entry module is:
	/Users/tfennelly/zap/blueocean-usain/target/jenkins-js-extension.jsx

The following modules do not appear to be in use via the bundle entry module:

- /node_modules/@jenkins-cd/blueocean-core-js/dist/js/config.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/blueocean-core-js/dist/js/fetch.js

- /node_modules/@jenkins-cd/blueocean-core-js/dist/js/fetch.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/blueocean-core-js/dist/js/jwt.js

- /node_modules/@jenkins-cd/blueocean-core-js/dist/js/jwt.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/blueocean-core-js/dist/js/fetch.js

- /node_modules/@jenkins-cd/blueocean-core-js/dist/js/urlconfig.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/blueocean-core-js/dist/js/jwt.js

- /node_modules/@jenkins-cd/blueocean-core-js/dist/js/utils.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/blueocean-core-js/dist/js/fetch.js

- /node_modules/@jenkins-cd/js-modules/js/Version.js
    Dependants (depending on this module):
    - /node_modules/@jenkins-cd/js-modules/js/ModuleSpec.js

------------------------------------------------

--help for options
```


# API Usage

You can also use this package programmatically via its API.

To install:

```
npm install --save browserify-tree
```

Would probably use this in conjunction with the `browser-unpack` package.

## getUnusedModules

Get a list of bundle module IDs for bundle modules that are not in use  on the bundle entry module's dependency graph:

```javascript
const browserifyTree = require('browserify-tree');
const unusedModules = browserifyTree.getUnusedModules('./target/classes/org/jenkins/ui/jsmodules/blueocean-usain/jenkins-js-extension.js'); // or pass the already unpackaged bundle object

// Do something with unusedModules
```

## getUnloadableModules

Get a list of bundle module IDs for bundle modules that are not loadable for some reason e.g. they "require" unresolvable modules:

```javascript
const browserifyTree = require('browserify-tree');
const unloadableModules = browserifyTree.getUnloadableModules('./target/classes/org/jenkins/ui/jsmodules/blueocean-usain/jenkins-js-extension.js'); // or pass the already unpackaged bundle object

// Do something with unloadableModules e.g. stub them out of the bundle with an exception.
```

[Browserify]: http://browserify.org/
[disc]: https://github.com/hughsk/disc/