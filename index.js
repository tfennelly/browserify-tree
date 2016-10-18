const fs = require('fs');
const unpack = require('browser-unpack');

let packEntries;
const treeModuleIds = [];

exports.drawTree = function(bundlePath) {
    if (!fs.existsSync(bundlePath)) {
        error(`No such file '${bundlePath}'`);
    }

    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    packEntries  = unpack(bundleContent);

    const entryModule = findEntryModule();
    const tree = new Node(entryModule);

    console.log('------------------------------------------------');
    tree.draw();
    console.log('------------------------------------------------');
    if (treeModuleIds.length < packEntries.length) {
        listUnusedPacks();
        console.log('------------------------------------------------');
    }
};

function listUnusedPacks() {
    console.log('The following modules do not appear to be in use on the above dependency tree:');
    packEntries.forEach((packEntry) => {
        if (treeModuleIds.indexOf(packEntry.id) === -1) {
            console.log(`- ${packEntry.id}`);
        }
    });
}

function findEntryModule() {
    return findPackEntries((packEntry) => packEntry.entry);
}

function findModuleById(id) {
    return findPackEntries((packEntry) => packEntry.id === id);
}

function findPackEntries(filterFunc) {
    var resultSet = packEntries.filter(filterFunc);
    if (resultSet.length === 1) {
        return resultSet[0];
    } else if (resultSet.length > 1) {
        return resultSet;
    }
    return undefined;
}

function error(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

class Node {

    constructor(packEntry, depth = 0) {
        this.packEntry = packEntry;
        this.moduleId = packEntry.id;

        if (treeModuleIds.indexOf(this.moduleId) === -1) {
            treeModuleIds.push(this.moduleId);
        }

        this.depth = depth;
        this.dependencies = [];
        this._resolveDeps();
    }

    draw() {
        console.log('  |'.repeat(this.depth) + `--${this.moduleId} (${this.packEntry.source.length})`);
        for (let i = 0; i < this.dependencies.length; i++) {
            this.dependencies[i].draw();
        }
    }

    _resolveDeps() {
        for (let dep in this.packEntry.deps) {
            if (this.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = this.packEntry.deps[dep];
                const depModule = findModuleById(depModuleId);
                if (depModule) {
                    const depModuleNode = new Node(depModule, this.depth + 1);
                    this.dependencies.push(depModuleNode);
                } else {
                    console.warn(`*** No module having Id '${depModuleId}' found in bundle.`);
                }
            }
        }
    }
}