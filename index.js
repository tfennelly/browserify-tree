const fs = require('fs');
const unpack = require('browser-unpack');
const util = require('./js/util');

let options;

exports.drawTree = function(bundlePath, userConfig) {
    const bundlePackEntries  = unpackBundle(bundlePath);

    options = Object.assign({
        depth: 2
    }, userConfig);

    const entryModule = findEntryPack(bundlePackEntries);

    if (typeof entryModule.id === 'number') {
        util.error('This bundle was generated with path IDs. Please regenerate with "fullPaths". See Browserify documentation.');
    }

    console.log(`\nThe bundle entry module is:\n\t${entryModule.id}`);

    const tree = new TreeNode(entryModule, {bundlePackEntries: bundlePackEntries}).resolveDeps();

    if (!options.notree) {
        console.log('------------------------------------------------');
        tree.draw();
        console.log('------------------------------------------------');
    }

    var hasUnused = (tree.getTreeModuleIds().length < bundlePackEntries.length);
    if (hasUnused) {
        const twoWayPackEntryList = new TwoWayPackEntryList(bundlePackEntries);

        if (options.unusedt) {
            twoWayPackEntryList.listUnusedPacksInDepTree(tree.getTreeModuleIds());
            console.log('------------------------------------------------');
        }
        if (options.unuseda) {
            twoWayPackEntryList.listUnusedPacksAnywhere();
            console.log('------------------------------------------------');
        }
    }
};

exports.getUnusedModules = function(bundle) {
    // Yeah not the nicest thing having
    // this as a global. Might fix it later ;)
    options = {
        depth: 2
    };

    const bundlePackEntries  = unpackBundle(bundle);
    const entryModule = findEntryPack(bundlePackEntries);

    if (typeof entryModule.id === 'number') {
        util.error('This bundle was generated with path IDs. Please regenerate with "fullPaths". See Browserify documentation.');
    }

    const tree = new TreeNode(entryModule, {bundlePackEntries: bundlePackEntries}).resolveDeps();
    const twoWayPackEntryList = new TwoWayPackEntryList(bundlePackEntries);
    const unusedPackEntries = twoWayPackEntryList.findUnusedPacksEntries(tree.getTreeModuleIds());
    const unusedModuleIds = [];

    unusedPackEntries.forEach((packEntry) => {
        unusedModuleIds.push(packEntry.id);
    });

    return unusedModuleIds;
};

function unpackBundle(bundle) {
    if (typeof bundle !== 'string') {
        // Assume it is already unpacked...
        return bundle;
    }

    if (!fs.existsSync(bundle)) {
        util.error(`No such file '${bundle}'`);
    }

    const bundleContent = fs.readFileSync(bundle, "utf-8");

    return unpack(bundleContent);
}

function findEntryPack(bundlePackEntries) {
    return findPackEntries(bundlePackEntries, (packEntry) => packEntry.entry);
}

function findPackById(id, bundlePackEntries) {
    return findPackEntries(bundlePackEntries, (packEntry) => packEntry.id === id);
}

function findPackEntries(bundlePackEntries, filterFunc) {
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

    constructor(packEntry, constructionConfig = {}) {
        this.packEntry = packEntry;
        this.parentNode = constructionConfig.parentNode;
        this.bundlePackEntries = constructionConfig.bundlePackEntries;
        this.moduleId = packEntry.id;

        if (!this.parentNode && !this.bundlePackEntries) {
            util.error('Invalid TreeNode construction. Must supply either "parentNode" or "bundlePackEntries" in config object.');
        }

        const treeModuleIds = this.getTreeModuleIds();
        if (treeModuleIds.indexOf(this.moduleId) === -1) {
            treeModuleIds.push(this.moduleId);
        }

        this.dependencies = undefined;
        this.depth = this.calcDepth();
        this.node_modulesDepth = this.calcDepth(true);
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

    resolveDeps(toDepth = options.depth) {
        this.dependencies = [];

        if (toDepth) {
            if (this.node_modulesDepth >= toDepth) {
                // Don't resolve any deeper...
                return this;
            }
        }

        for (let dep in this.packEntry.deps) {
            if (this.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = this.packEntry.deps[dep];
                const self = this;
                const depModule = findPackById(depModuleId, self.getBundlePackEntries());
                if (depModule) {
                    const depModuleNode = new TreeNode(depModule, {parentNode: self});
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

    getBundlePackEntries() {
        const treeRootNode = this.getRootNode();
        return treeRootNode.bundlePackEntries;
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

    calcDepth(inNodeModules) {
        let depth = 0;
        let parentNode = this;

        while(parentNode) {
            if (inNodeModules && parentNode.moduleId.indexOf('/node_modules/') === -1) {
                // parenNode is not referring to a module that's inside /node_modules/
                // i.e. must be referring to a src module. Supplying of the inNodeModules
                // arg tells us not to include src modules in the depth calc i.e. we just
                // want to know how deep is the external dependency graph.
                break;
            }
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

        this.bundlePackEntries.forEach((packEntry) => {
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

    findUnusedPacksEntries(treeModuleIds) {
        const packEntries = [];
        this.bundlePackEntries.forEach((packEntry) => {
            if (treeModuleIds.indexOf(packEntry.id) === -1) {
                packEntries.push(packEntry);
            }
        });
        return packEntries;
    }

    listUnusedPacksInDepTree(treeModuleIds) {
        console.log('\nThe following modules do not appear to be in use via the bundle entry module:\n');
        const packEntries = this.findUnusedPacksEntries(treeModuleIds);
        packEntries.forEach((packEntry) => {
            this.printPackDetails(packEntry);
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
        if (!options.filter || util.startsWith(trimmedModuleId, options.filter)) {
            if (options.unuseddc) {
                const self = this;
                new TreeNode(packEntry, {bundlePackEntries: self.bundlePackEntries}).resolveDeps().draw();
            } else {
                console.log(`- ${trimmedModuleId}`);
            }
            if (options.unuseddd) {
                const twoWayPackEntry = this.findByPackId(packEntry.id);
                console.log(`    Dependants (depending on this module):`);
                twoWayPackEntry.dependants.forEach((dependant) => {
                    console.log(`    - ${trimModuleId(dependant)}`);
                });
            }
            if (options.unuseddc || options.unuseddd) {
                console.log('');
            }
        }
    }
}