#!/usr/bin/env node

const browserifyTree = require('./index.js');
const util = require('./util');

if (process.argv.length < 3) {
    util.error('No bundle file path specified.');
} else {
    const cmdArgs = process.argv.slice(2);
    let bundlePath;
    const config = {};

    cmdArgs.forEach((cmdArg) => {
        if (util.startsWith(cmdArg, '--')) {
            // It's a config arg.
            const configTokens = cmdArg.substring(2).split('=');
            const configName = configTokens.shift();

            if (configTokens.length === 0) {
                config[configName] = true;
            } else {
                config[configName] = configTokens.join('=');
            }
        } else {
            // It's the bundle path.
            bundlePath = cmdArg;
        }
    });

    if (!config.help) {
        if (!bundlePath) {
            util.error('No bundle file path specified.');
        } else {
            browserifyTree.drawTree(bundlePath, config);
        }

        console.log('');
        console.log('--help for options');
        console.log('');
    } else {
        console.log('');
        console.log('CLI options:');
        console.log('   --unusedt     Unused in the entry module\'s dependency tree.');
        console.log('   --unuseda     Unused anywhere i.e. no dependants in entry module\'s tree, or among other unused.');
        console.log('');
        console.log('   --filter      Unused module listing filter.');
        console.log('                 (see --unusedt and --unuseda)');
        console.log('                 e.g. --filter=/node_modules/parse-asn1');
        console.log('');
        console.log('   --unuseddc    List dependencies of unused modules (what the unused module depends on).');
        console.log('                 (see --unusedt and --unuseda)');
        console.log('   --unuseddd    List dependants of unused modules (what depends on the unused module).');
        console.log('                 (see --unusedt and --unuseda)');
        console.log('');
        console.log('   --depth       The depth to which dependencies are resolved (default 3).');
        console.log('                 Be careful changing this !!');
        console.log('');
        console.log("   --notree      Don't output the entry module's dependency tree.");
        console.log('');
    }
}
