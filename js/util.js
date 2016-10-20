
exports.error = function(message) {
    console.error('Error: ' + message);
    process.exit(1);
};

exports.startsWith = function(string, startToTestFor) {
    return (string.indexOf(startToTestFor) === 0);
};
