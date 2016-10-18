const fs = require('fs');
const unpack = require('browser-unpack');

let packEntries;

exports.drawTree = function(bundlePath) {
    if (!fs.existsSync(bundlePath)) {
        error(`No such file '${bundlePath}'`);
    }

    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    packEntries  = unpack(bundleContent);

    const entryModule = findEntryModule();
    const tree = new Node(entryModule);

    tree.draw();
};

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
        this.depth = depth;
        this.dependants = [];
        this._resolveDeps();
    }

    draw() {
        console.log(' '.repeat(this.depth * 2) + `- ` + this.moduleId);
        for (let i = 0; i < this.dependants.length; i++) {
            this.dependants[i].draw();
        }
    }

    _resolveDeps() {
        for (let dep in this.packEntry.deps) {
            if (this.packEntry.deps.hasOwnProperty(dep)) {
                const depModuleId = this.packEntry.deps[dep];
                const depModule = findModuleById(depModuleId);
                if (depModule) {
                    const depModuleNode = new Node(depModule, this.depth + 1);
                    this.dependants.push(depModuleNode);
                } else {
                    console.warn(`*** No module having Id '${depModuleId}' found in bundle.`);
                }
            }
        }
    }
}