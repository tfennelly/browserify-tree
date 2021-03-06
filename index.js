const fs = require('fs');
const unpack = require('browser-unpack');
const util = require('./js/util');

let options;

exports.drawTree = function(bundlePath, userConfig) {
    const twoWayPackEntryList = unpackBundle(bundlePath);

    options = Object.assign({
    }, userConfig);

    console.log(`\nThe bundle entry module is:\n\t${twoWayPackEntryList.entryModule.id}`);

    const tree = twoWayPackEntryList.tree;

    if (!options.notree) {
        console.log('------------------------------------------------');
        tree.draw();
        console.log('');
        console.log('Sorted by source length/size:');
        tree.outputModulesBySrcLen();
        console.log('------------------------------------------------');
    }

    var hasUnused = (tree.getTreeNodes().length < twoWayPackEntryList.bundlePackEntries.length);
    if (hasUnused) {
        if (options.unusedt) {
            twoWayPackEntryList.listUnusedPacksInDepTree();
            console.log('------------------------------------------------');
        }
        if (options.unuseda) {
            twoWayPackEntryList.listUnusedPacksAnywhere();
            console.log('------------------------------------------------');
        }
    }
};

/**
 * Get a list of bundle module IDs for bundle modules that are not
 * in use  on the bundle entry module's dependency graph.
 * @param bundle The bundle file path, or the unpacked bundle.
 * @returns {Array}
 */
exports.getUnusedModules = function(bundle) {
    const twoWayPackEntryList = unpackBundle(bundle);
    const unusedPackEntries = twoWayPackEntryList.findUnusedPacksEntries();
    const unusedModuleIds = [];

    unusedPackEntries.forEach((packEntry) => {
        // And also need to make sure that the pack is not depended on via
        // a browserify dedupe entry. In this particular case, the pack ID might
        // not be listed in the deps for any packages, but could actually still be
        // depended on (be in use by) a dedupe pack entry.
        var dedupeReferencePackEntries = twoWayPackEntryList.findDedupeReferencePackEntries(packEntry.id);
        if (dedupeReferencePackEntries.length === 0) {
            unusedModuleIds.push(packEntry.id);
        }
    });

    return unusedModuleIds;
};

/**
 * Get a list of bundle module IDs for bundle modules that are not
 * loadable for some reason e.g. they "require" unresolvable modules.
 * @param bundle The bundle file path, or the unpacked bundle.
 * @returns {Array}
 */
exports.getUnloadableModules = function(bundle) {
    const twoWayPackEntryList = unpackBundle(bundle);
    const unloadableModuleIds = [];

    twoWayPackEntryList.tree.getTreeNodes().forEach((treeNode) => {
        // Add other reasons here as we evolve...
        if (treeNode.hasUnresolvableDeps) {
            unloadableModuleIds.push(treeNode.moduleId);
        }
    });

    return unloadableModuleIds;
};

function unpackBundle(bundle) {
    if (typeof bundle !== 'string') {
        // Assume it is already unpacked...
        return new TwoWayPackEntryList(bundle);
    }

    if (!fs.existsSync(bundle)) {
        util.error(`No such file '${bundle}'`);
    }

    const bundleContent = fs.readFileSync(bundle, "utf-8");

    return new TwoWayPackEntryList(unpack(bundleContent));
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
        this.srclen = 0;

        if (!this.parentNode && !this.bundlePackEntries) {
            util.error('Invalid TreeNode construction. Must supply either "parentNode" or "bundlePackEntries" in config object.');
        }

        if (this.getTreeNode(this.moduleId) === undefined) {
            this.getTreeNodes().push(this);
        }

        this.dependencies = undefined;
        this.depth = this.calcDepth();
    }

    calcSrcLen() {
        // Do not want to include the src length for a module more than once.
        // So, only calculate it if it's the "recorded" TreeNode instance of
        // the module, of which there's ever only one.
        if (!this.isRecordedTreeNode()) {
            return 0;
        }

        this.srclen = this.packEntry.source.length;
        if (this.dependencies) {
            this.dependencies.forEach((dependency) => {
                this.srclen += dependency.calcSrcLen();
            })
        }
        return this.srclen;
    }

    draw(depth = 0) {
        this.outputModuleId(depth);
        if (this.dependencies) {
            for (let i = 0; i < this.dependencies.length; i++) {
                this.dependencies[i].draw(depth + 1);
            }
        }
    }

    outputModulesBySrcLen() {
        const treeNodesBySize = this.getTreeNodes().slice().sort((a, b) => {
            return b.srclen - a.srclen;
        });
        treeNodesBySize.forEach((treeNode) => {
            treeNode.outputModuleId(0);
        })
    }

    outputModuleId(depth = this.depth) {
        let trimmedModuleId = trimModuleId(this.moduleId);
        const isAlreadyOnTree = (this.dependencies === undefined);
        console.log('=' + '  |'.repeat(depth)
            + `--${trimmedModuleId} (${this.srclen})${(isAlreadyOnTree?' (skipped - see earlier resolve)':'')}`);
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

    resolveDeps() {
        if (!this.isRecordedTreeNode()) {
            // Only one TreeNode instance is stored in the treeNode list for
            // each module. If "this" node is not the recorded node then
            // we skip resolving of deps etc (because it's already done - noise)
            // and we don't add the srclen because that srclen is already included
            // in the bundle.
            return this;
        }
        this.dependencies = [];

        for (let dep in this.packEntry.deps) {
            if (this.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = this.packEntry.deps[dep];
                const self = this;
                const depModule = findPackById(depModuleId, self.getBundlePackEntries());
                if (depModule) {
                    const depModuleNode = new TreeNode(depModule, {parentNode: self});
                    this.dependencies.push(depModuleNode);
                    depModuleNode.resolveDeps();
                } else {
                    this.hasUnresolvableDeps = true;
                }
            }
        }

        if (this.getRootNode() === this) {
            this.calcSrcLen();
        }

        return this;
    }

    getTreeNodes() {
        const treeRootNode = this.getRootNode();
        if (treeRootNode.treeNodes === undefined) {
            treeRootNode.treeNodes = [];
        }
        return treeRootNode.treeNodes;
    }

    getTreeNode(moduleId) {
        const treeNodes = this.getTreeNodes();
        for (let i = 0; i < treeNodes.length; i++) {
            if (treeNodes[i].moduleId === moduleId) {
                return treeNodes[i];
            }
        }
        return undefined;
    }

    isRecordedTreeNode() {
        // Only one TreeNode instance is stored/recorder in the treeNode list for
        // each module (by ID).
        return (this.getTreeNode(this.moduleId) === this);
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
        this.entryModule = findEntryPack(bundlePackEntries);

        if (typeof this.entryModule.id === 'number') {
            util.error('This bundle was generated with path IDs. Please regenerate with "full paths". See Browserify documentation. Use "--full-paths" if using @jenkins-cd/js-builder.');
        }

        this.tree = new TreeNode(this.entryModule, {bundlePackEntries: bundlePackEntries}).resolveDeps();

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

    findUnusedPacksEntries() {
        const packEntries = [];
        this.bundlePackEntries.forEach((packEntry) => {
            if (this.tree.getTreeNode(packEntry.id) === undefined) {
                packEntries.push(packEntry);
            }
        });
        return packEntries;
    }

    findDedupeReferencePackEntries(packId) {
        const packEntries = [];
        const dedupeSourceFrom = 'arguments[4]["' + packId + '"][0].apply(exports,arguments)';
        this.bundlePackEntries.forEach((packEntry) => {
            if (packEntry.source === dedupeSourceFrom) {
                packEntries.push(packEntry);
            }
        });
        return packEntries;
    }

    listUnusedPacksInDepTree() {
        console.log('\nThe following modules do not appear to be in use via the bundle entry module:\n');
        const packEntries = this.findUnusedPacksEntries();
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