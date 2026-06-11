"use strict";
// Public entry point for the falsification adapter subsystem.
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeCodeProfile = exports.codexProfile = exports.copilotProfile = exports.CliFalsifier = exports.AdapterRegistry = void 0;
exports.defaultAdapterRegistry = defaultAdapterRegistry;
const registry_1 = require("./registry");
const cli_falsifier_1 = require("./cli-falsifier");
const copilot_1 = require("./profiles/copilot");
const codex_1 = require("./profiles/codex");
const claude_code_1 = require("./profiles/claude-code");
var registry_2 = require("./registry");
Object.defineProperty(exports, "AdapterRegistry", { enumerable: true, get: function () { return registry_2.AdapterRegistry; } });
var cli_falsifier_2 = require("./cli-falsifier");
Object.defineProperty(exports, "CliFalsifier", { enumerable: true, get: function () { return cli_falsifier_2.CliFalsifier; } });
var copilot_2 = require("./profiles/copilot");
Object.defineProperty(exports, "copilotProfile", { enumerable: true, get: function () { return copilot_2.copilotProfile; } });
var codex_2 = require("./profiles/codex");
Object.defineProperty(exports, "codexProfile", { enumerable: true, get: function () { return codex_2.codexProfile; } });
var claude_code_2 = require("./profiles/claude-code");
Object.defineProperty(exports, "claudeCodeProfile", { enumerable: true, get: function () { return claude_code_2.claudeCodeProfile; } });
/** Build a registry pre-populated with the built-in falsifier adapters. */
function defaultAdapterRegistry(options = {}) {
    const registry = new registry_1.AdapterRegistry();
    registry.register(new cli_falsifier_1.CliFalsifier(codex_1.codexProfile));
    if ((options.includeCopilot ?? true) === true)
        registry.register(new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile));
    if (options.includeClaudeCode === true)
        registry.register(new cli_falsifier_1.CliFalsifier(claude_code_1.claudeCodeProfile));
    return registry;
}
