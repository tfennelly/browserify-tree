A library for analysing [Browserify] generated JavaScript bundles.

If you're interested in something like this you might also be interested in [disc], which
is a more visual analysis. This lib is useful for helping you to analyse how the dependencies
are wired together. Also useful if you are writing [Browserify] transforms/plugins that are
manipulating the bundle. 

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

   --depth       The depth to which dependencies are resolved (default 3).
                 Be careful changing this !!
                 e.g. --depth=6

   --notree      Don't output the entry module's dependency tree.
```

[Browserify]: http://browserify.org/
[disc]: https://github.com/hughsk/disc/