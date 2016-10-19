const fs = require('fs');
const unpack = require('browser-unpack');
const util = require('./util');

let bundlePackEntries;
const treeModuleIds = [];

exports.drawTree = function(bundlePath, config) {
    if (!fs.existsSync(bundlePath)) {
        util.error(`No such file '${bundlePath}'`);
    }

    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    bundlePackEntries  = unpack(bundleContent);

    const entryModule = findEntryModule();
    const tree = new Node(entryModule);

    console.log('------------------------------------------------');
    tree.draw();
    console.log('------------------------------------------------');

    var hasUnused = (treeModuleIds.length < bundlePackEntries.length);
    if (hasUnused) {
        if (config.unusedt) {
            listUnusedPacksInDepTree(config.filter);
            console.log('------------------------------------------------');
        }
        if (config.unuseda) {
            listUnusedPacksAnywhere(config.filter);
            console.log('------------------------------------------------');
        }
    }
};

function listUnusedPacksInDepTree(filter) {
    console.log('The following modules do not appear to be in use on the above dependency tree:');
    bundlePackEntries.forEach((packEntry) => {
        if (treeModuleIds.indexOf(packEntry.id) === -1) {
            let trimmedModuleId = packEntry.id.replace(process.cwd(), '');
            if (!filter || util.startsWith(trimmedModuleId, filter)) {
                console.log(`- ${trimmedModuleId}`);
            }
        }
    });
}

function listUnusedPacksAnywhere(filter) {
    console.log('The following modules do not appear to be in use anywhere i.e. no dependants:');

    const twoWayPackEntryList = [];

    bundlePackEntries.forEach((packEntry) => {
        twoWayPackEntryList.push(new TwoWayPackEntry(packEntry));
    });

    function findTwoWayPackEntry(packId) {
        for(let i = 0; i < twoWayPackEntryList.length; i++) {
            if (twoWayPackEntryList[i].packEntry.id === packId) {
                return twoWayPackEntryList[i];
            }
        }
        return undefined;
    }

    // Populate the dependants...
    twoWayPackEntryList.forEach((twoWayPackEntry) => {
        for (let dep in twoWayPackEntry.packEntry.deps) {
            if (twoWayPackEntry.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = twoWayPackEntry.packEntry.deps[dep];
                const depModule2Way = findTwoWayPackEntry(depModuleId);
                if (depModule2Way) {
                    depModule2Way.addDependant(twoWayPackEntry.packEntry.id);
                } else {
                    console.warn(`*** No module having Id '${depModuleId}' found in bundle.`);
                }
            }
        }
    });

    // Run through them again now and print those that
    // have zero dependants...
    twoWayPackEntryList.forEach((twoWayPackEntry) => {
        if (twoWayPackEntry.dependants.length === 0) {
            let trimmedModuleId = twoWayPackEntry.packEntry.id.replace(process.cwd(), '');
            if (!filter || util.startsWith(trimmedModuleId, filter)) {
                console.log(`- ${trimmedModuleId}`);
            }
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
    var resultSet = bundlePackEntries.filter(filterFunc);
    if (resultSet.length === 1) {
        return resultSet[0];
    } else if (resultSet.length > 1) {
        return resultSet;
    }
    return undefined;
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
        let trimmedModuleId = this.moduleId.replace(process.cwd(), '');
        console.log('  |'.repeat(this.depth) + `--${trimmedModuleId} (${this.packEntry.source.length})`);
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

class TwoWayPackEntry {

    constructor(packEntry) {
        this.packEntry = packEntry;
        this.dependants = [];
    }

    addDependant(packEntryId) {
        if (this.dependants.indexOf(packEntryId) === -1) {
            this.dependants.push(packEntryId);
        }
    }
}