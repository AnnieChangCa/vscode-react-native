// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
"use strict";

var child_process = require("child_process");
var fs = require("fs");
var gutil = require("gulp-util");
var path = require("path");
var PluginError = gutil.PluginError;
var through = require("through2");

/**
 * Pretty logger using gutil.log
 * @param {string} pluginName Name of the pluginName
 * @param {Object} file A gulp file to report on
 * @param {string} message The error message to display
 */
var logError = function(pluginName, file, message) {
    var sourcePath = path.relative(__dirname, file.path).replace("../","");
    gutil.log("[" + gutil.colors.cyan(pluginName) + "] " + gutil.colors.red("error") + " " + sourcePath + ": " + message);
};

/**
 * Plugin to verify the Microsoft copyright notice is present
 */
var checkCopyright = function() {
    var pluginName = "check-copyright";
    var hadErrors = false;
    var copyrightNotice = "// Copyright (c) Microsoft Corporation. All rights reserved.\n// Licensed under the MIT license. See LICENSE file in the project root for details.";

    return through.obj(function(file, encoding, callback) {
        if (file.isBuffer()) {
            var fileContents = file.contents.toString(encoding);
            fileContents = fileContents.replace("\r\n", "\n");
            fileContents = fileContents.replace("\"use strict\";\n", "");

            if (fileContents.indexOf(copyrightNotice) !== 0) {
                logError(pluginName, file, "missing copyright notice");
                hadErrors = true;
            }
        }

        callback(null, file);
    },
    function(callback) {
        if (hadErrors) {
            return this.emit("error", new PluginError(pluginName, "Failed copyright check"));
        }
        callback();
    });
};

/**
 * Helper function to check if a file exists case sensitive
 * @param {string} filePath The path to check
 * @returns {boolean} If the path exists case sensitive
 */
var existsCaseSensitive = function(filePath) {
    if (fs.existsSync(filePath)) {
        var fileName = path.basename(filePath);
        return fs.readdirSync(path.dirname(filePath)).indexOf(fileName) !== -1;
    }

    return false;
};

/**
 * Plugin to verify if import statements use correct casing
 */
var checkImports = function() {
    var pluginName = "check-imports";
    var hadErrors = false;
    var re = /(?:\s|^)(?:[^\n:]*).*from ["'](\.[^"']*)["'];/;

    return through.obj(function(file, encoding, callback) {
        if (file.isBuffer()) {
            var fileContents = file.contents.toString(encoding);
            var importStatements = fileContents.match(new RegExp(re.source, "g")) || [];
            var workingDirectory = path.dirname(file.path);

            importStatements.forEach(function(importStatement) {

                var modulePath = re.exec(importStatement);
                if (modulePath && modulePath[1]) {

                    // Module app-center-node-client and it's submodules are relative and doesn't use *.ts files but *.d.ts instead
                    // so no need to check them
                    if (modulePath[1].startsWith("../lib/app-center-node-client")) {
                        return;
                    }
                    var moduleFilePath = path.resolve(workingDirectory, modulePath[1] + ".ts");

                    if (!existsCaseSensitive(moduleFilePath)) {
                        logError(pluginName, file, "unresolved import: \"" + modulePath[1] + "\"");
                        hadErrors = true;
                    }
                }
            });
        }

        callback(null, file);
    },
    function(callback) {
        if (hadErrors) {
            return this.emit("error", new PluginError(pluginName, "Failed import casing check"));
        }
        callback();
    });
};

var executeCommand = function(command, args, callback, opts) {
    var proc = child_process.spawn(command + (process.platform === "win32" ? ".cmd" : ""), args, opts);
    var errorSignaled = false;

    proc.stdout.on("data", function(data) {
        console.log("" + data);
    });

    proc.stderr.on("data", function(data) {
        console.error("" + data);
    });

    proc.on("error", function(error) {
        if (!errorSignaled) {
            callback("An error occurred. " + error);
            errorSignaled = true;
        }
    });

    proc.on("exit", function(code) {
        if (code === 0) {
            callback();
        } else if (!errorSignaled) {
            callback("Error code: " + code);
            errorSignaled = true;
        }
    });
};

module.exports = {
    checkCopyright: checkCopyright,
    checkImports: checkImports,
    executeCommand: executeCommand
}