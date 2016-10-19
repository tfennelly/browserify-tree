const fs = require('fs');
const unpack = require('browser-unpack');
const util = require('./util');

let bundlePackEntries;
const treeModuleIds = [];

const treeNodeCache = {};

exports.drawTree = function(bundlePath, config) {
    if (!fs.existsSync(bundlePath)) {
        util.error(`No such file '${bundlePath}'`);
    }

    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    bundlePackEntries  = unpack(bundleContent);

    const entryModule = findEntryPack();
    const tree = new TreeNode(entryModule).resolveDeps();

    console.log('------------------------------------------------');
    tree.draw();
    console.log('------------------------------------------------');

    var hasUnused = (treeModuleIds.length < bundlePackEntries.length);
    if (hasUnused) {
        const twoWayPackEntryList = new TwoWayPackEntryList();

        if (config.unusedt) {
            listUnusedPacksInDepTree(twoWayPackEntryList, config);
            console.log('------------------------------------------------');
        }
        if (config.unuseda) {
            listUnusedPacksAnywhere(twoWayPackEntryList, config);
            console.log('------------------------------------------------');
        }
    }
};

function listUnusedPacksInDepTree(twoWayPackEntryList, config) {
    console.log('The following modules do not appear to be in use on the above dependency tree:');
    bundlePackEntries.forEach((packEntry) => {
        if (treeModuleIds.indexOf(packEntry.id) === -1) {
            printPackDetails(packEntry, config, twoWayPackEntryList);
        }
    });
}

function listUnusedPacksAnywhere(twoWayPackEntryList, config) {
    console.log('The following modules do not appear to be in use anywhere i.e. no dependants:');

    // Run through twoWayPackEntryList and print those that
    // have zero dependants...
    twoWayPackEntryList.forEach((twoWayPackEntry) => {
        if (twoWayPackEntry.dependants.length === 0) {
            printPackDetails(twoWayPackEntry.packEntry, config, twoWayPackEntryList);
        }
    });
}

function printPackDetails(packEntry, config, twoWayPackEntryList) {
    let trimmedModuleId = trimModuleId(packEntry.id);
    if (!config.filter || util.startsWith(trimmedModuleId, config.filter)) {
        if (config.unuseddc) {
            new TreeNode(packEntry).resolveDeps().draw();
        } else {
            console.log(`- ${trimmedModuleId}`);
        }
        if (config.unuseddd) {
            const twoWayPackEntry = twoWayPackEntryList.findByPackId(packEntry.id);
            console.log(`- Dependants (depending on this module):`);
            twoWayPackEntry.dependants.forEach((dependant) => {
                console.log(`    - ${trimModuleId(dependant)}`);
            });
        }
        if (config.unuseddc || config.unuseddd) {
            console.log('');
        }
    }
}

function findEntryPack() {
    return findPackEntries((packEntry) => packEntry.entry);
}

function findPackById(id) {
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

function trimModuleId(moduleId) {
    return moduleId.replace(process.cwd(), '');
}

class TreeNode {

    constructor(packEntry, parentNode) {
        this.packEntry = packEntry;
        this.parentNode = parentNode;
        this.moduleId = packEntry.id;

        if (treeModuleIds.indexOf(this.moduleId) === -1) {
            treeModuleIds.push(this.moduleId);
        }

        this.dependencies = undefined;
    }

    draw(depth = 0) {
        let trimmedModuleId = this.moduleId.replace(process.cwd(), '');
        console.log('  |'.repeat(depth) + `--${trimmedModuleId} (${this.packEntry.source.length})`);
        if (this.dependencies) {
            for (let i = 0; i < this.dependencies.length; i++) {
                this.dependencies[i].draw(depth + 1);
            }
        }
    }

    resolveDeps(toDepth) {
        if (toDepth) {
            const thisNodeDepth = this.depth();
            if (toDepth >= thisNodeDepth) {
                // Don't resolve any deeper...
                return this;
            }
        }

        this.dependencies = [];

        if (this.packEntry.id === '/Users/tfennelly/projects/blueocean/blueocean-dashboard/node_modules/stream-browserify/node_modules/readable-stream/lib/_stream_writable.js') {
            console.log('#############################################')
        }
        console.log(this.packEntry.id)

        for (let dep in this.packEntry.deps) {
            if (this.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = this.packEntry.deps[dep];
                const depModule = findPackById(depModuleId);
                if (depModule) {
                    const depModuleNode = new TreeNode(depModule, this);
                    this.dependencies.push(depModuleNode);

                    // Do not add dependency nodes for the depModule if there's already
                    // a parent node for it i.e. make sure we do not get into a circular dep
                    // infinite loop...
                    if (!this.isParentNode(depModuleId)) {
                        // No, it's ok to add the dependency nodes....
                        depModuleNode.resolveDeps(toDepth);
                    }
                } else {
                    console.warn(`*** No module having Id '${depModuleId}' found in bundle.`);
                }
            }
        }

        return this;
    }

    isParentNode(moduleId) {
        if (this.parentNode) {
            if (this.parentNode.packEntry.id === moduleId) {
                return true;
            }
            return this.parentNode.isParentNode(moduleId);
        }
        return false;
    }

    depth() {
        let depth = 0;
        let parentNode = this.parentNode;

        while(parentNode) {
            depth++;
            parentNode = parentNode.parentNode;
        }

        return depth;
    }
}

class TwoWayPackEntry {

    constructor(packEntry) {
        this.packEntry = packEntry;
        this.dependencies = [];
        this.dependants = [];
    }

    addDependency(packEntryId) {
        if (this.dependencies.indexOf(packEntryId) === -1) {
            this.dependencies.push(packEntryId);
        }
    }

    addDependant(packEntryId) {
        if (this.dependants.indexOf(packEntryId) === -1) {
            this.dependants.push(packEntryId);
        }
    }
}

class TwoWayPackEntryList {

    constructor() {
        this.list = [];
        bundlePackEntries.forEach((packEntry) => {
            this.list.push(new TwoWayPackEntry(packEntry));
        });

        // Populate the dependencies and dependants...
        this.list.forEach((twoWayPackEntry) => {
            for (let dep in twoWayPackEntry.packEntry.deps) {
                if (twoWayPackEntry.packEntry.deps.hasOwnProperty(dep)) {
                    const depModuleId = twoWayPackEntry.packEntry.deps[dep];
                    const depModule2Way = this.findByPackId(depModuleId);
                    if (depModule2Way) {
                        twoWayPackEntry.addDependency(depModule2Way.packEntry.id);
                        depModule2Way.addDependant(twoWayPackEntry.packEntry.id);
                    } else {
                        console.warn(`*** No module having Id '${depModuleId}' found in bundle.`);
                    }
                }
            }
        });
    }

    findByPackId(packId) {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].packEntry.id === packId) {
                return this.list[i];
            }
        }
        return undefined;
    }

}