const fs = require('fs');
const unpack = require('browser-unpack');
const util = require('./js/util');

let bundlePackEntries;
let tree;
let config;

exports.drawTree = function(bundlePath, userConfig) {
    if (!fs.existsSync(bundlePath)) {
        util.error(`No such file '${bundlePath}'`);
    }

    config = Object.assign({
        depth: 3
    }, userConfig);

    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    bundlePackEntries  = unpack(bundleContent);

    const entryModule = findEntryPack();

    if (typeof entryModule.id === 'number') {
        util.error('This bundle was generated with path IDs. Please regenerate with "fullPaths". See Browserify documentation.');
    }

    console.log(`\nThe bundle entry module is:\n\t${entryModule.id}`);

    tree = new TreeNode(entryModule).resolveDeps();

    if (!config.notree) {
        console.log('------------------------------------------------');
        tree.draw();
        console.log('------------------------------------------------');
    }

    var hasUnused = (tree.getTreeModuleIds().length < bundlePackEntries.length);
    if (hasUnused) {
        const twoWayPackEntryList = new TwoWayPackEntryList(bundlePackEntries);

        if (config.unusedt) {
            twoWayPackEntryList.listUnusedPacksInDepTree(tree.getTreeModuleIds());
            console.log('------------------------------------------------');
        }
        if (config.unuseda) {
            twoWayPackEntryList.listUnusedPacksAnywhere();
            console.log('------------------------------------------------');
        }
    }
};

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

        const treeModuleIds = this.getTreeModuleIds();
        if (treeModuleIds.indexOf(this.moduleId) === -1) {
            treeModuleIds.push(this.moduleId);
        }

        this.dependencies = undefined;
        this.depth = this.calcDepth();
    }

    draw(depth = 0) {
        this.outputModuleId(depth);
        if (this.dependencies) {
            for (let i = 0; i < this.dependencies.length; i++) {
                this.dependencies[i].draw(depth + 1);
            }
        }
    }

    outputModuleId(depth = this.depth) {
        let trimmedModuleId = trimModuleId(this.moduleId);
        const isAlreadyOnTree = (this.dependencies === undefined);
        console.log('=' + '  |'.repeat(depth)
            + `--${trimmedModuleId} (${this.packEntry.source.length})${(isAlreadyOnTree?' (circular)':'')}`);
    }

    drawPathFromOldest() {
        const stack = [];
        let parentNode = this.parentNode;

        stack.push(this);
        while(parentNode) {
            stack.push(parentNode);
            parentNode = parentNode.parentNode;
        }

        let indent = 0;
        let nodeToDraw = stack.shift();
        while(nodeToDraw) {
            let trimmedModuleId = trimModuleId(nodeToDraw.moduleId);
            console.log('  |'.repeat(indent) + `--${trimmedModuleId}`);
            nodeToDraw = stack.shift();
            indent++;
        }
    }

    resolveDeps(toDepth = config.depth) {
        this.dependencies = [];

        if (toDepth) {
            if (this.depth >= toDepth) {
                // Don't resolve any deeper...
                return this;
            }
        }

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

    getTreeModuleIds() {
        const treeRootNode = this.getRootNode();
        if (treeRootNode.treeModuleIds === undefined) {
            treeRootNode.treeModuleIds = []
        }
        return treeRootNode.treeModuleIds;
    }

    getRootNode() {
        if (!this.parentNode) {
            return this;
        }
        return this.parentNode.getRootNode();
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

    calcDepth() {
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

    constructor(bundlePackEntries) {
        this.list = [];
        this.bundlePackEntries = bundlePackEntries;

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

    listUnusedPacksInDepTree(treeModuleIds) {
        console.log('\nThe following modules do not appear to be in use via the bundle entry module:\n');
        this.bundlePackEntries.forEach((packEntry) => {
            if (treeModuleIds.indexOf(packEntry.id) === -1) {
                this.printPackDetails(packEntry);
            }
        });
    }

    listUnusedPacksAnywhere() {
        console.log('\nThe following modules do not appear to be in use anywhere i.e. no dependants:\n');

        // Run through twoWayPackEntryList and print those that
        // have zero dependants...
        this.forEach((twoWayPackEntry) => {
            if (twoWayPackEntry.dependants.length === 0) {
                this.printPackDetails(twoWayPackEntry.packEntry);
            }
        });
    }

    printPackDetails(packEntry) {
        let trimmedModuleId = trimModuleId(packEntry.id);
        if (!config.filter || util.startsWith(trimmedModuleId, config.filter)) {
            if (config.unuseddc) {
                new TreeNode(packEntry).resolveDeps().draw();
            } else {
                console.log(`- ${trimmedModuleId}`);
            }
            if (config.unuseddd) {
                const twoWayPackEntry = this.findByPackId(packEntry.id);
                console.log(`    Dependants (depending on this module):`);
                twoWayPackEntry.dependants.forEach((dependant) => {
                    console.log(`    - ${trimModuleId(dependant)}`);
                });
            }
            if (config.unuseddc || config.unuseddd) {
                console.log('');
            }
        }
    }
}