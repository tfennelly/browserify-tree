#!/usr/bin/env node

const browserifyTree = require('./index.js');

if (process.argv.length !== 3) {
    console.error('Error: No bundle file path specified.');
    process.exit(1);
} else {
    browserifyTree.drawTree(process.argv[2])
}
