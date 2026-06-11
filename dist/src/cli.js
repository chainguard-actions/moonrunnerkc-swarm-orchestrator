#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const flags_1 = require("./cli/flags");
const logger_1 = require("./logger");
const startupArgs = process.argv.slice(2);
const USER_FACING_COMMANDS = new Set(['run', 'init', 'audit']);
const firstNonFlag = startupArgs.find((a) => !a.startsWith('-'));
const isUserFacingCommand = firstNonFlag ? USER_FACING_COMMANDS.has(firstNonFlag) : false;
const isVerbose = startupArgs.includes('--verbose');
const isQuiet = startupArgs.includes('--quiet') || startupArgs.includes('-q');
(0, logger_1.configureLogger)({
    level: isQuiet ? 'warn' : (isVerbose ? 'debug' : 'info'),
    outputFormat: (0, flags_1.parseOutputFormat)(startupArgs),
    diagnosticsToStderr: isUserFacingCommand && !isVerbose,
});
if (isUserFacingCommand && !isVerbose) {
    (0, logger_1.setPrettyMode)(true);
}
const logger = (0, logger_1.getLogger)('cli');
const env_loader_1 = require("./env-loader");
(0, env_loader_1.loadDotenv)();
const index_1 = require("./cli/v8/index");
const run_wrapper_1 = require("./cli/v8/run-wrapper");
const run_handler_1 = require("./cli/v8/run-handler");
function showUsage() {
    process.stdout.write(`
Swarm Orchestrator - Falsification-gated Orchestration for AI Coding Agents

Usage:
  swarm compile <goal>          Compile a goal into a typed contract
  swarm run <contract>          Run a compiled contract through the v8 pipeline
  swarm run --goal "<text>"     Compile + run in one step
  swarm resume <run-id>         Resume a killed run from the ledger
  swarm stats <run-id>          Aggregate diagnostic counts from a run ledger
  swarm doctor                  Probe local prerequisites (API key, falsifiers, PMs)
  swarm init                    Scaffold contract.yaml + patches.jsonl
  swarm audit <pr|--diff-*>     Audit a PR for AI-agent cheat patterns (v10)
  swarm --help                  Show this help message

For per-subcommand flags, see \`swarm <command> --help\`.
`);
}
async function main() {
    const args = (0, flags_1.normalizeLeadingGlobalFlags)(process.argv.slice(2));
    if (args.length === 0) {
        showUsage();
        return;
    }
    const command = args[0];
    let exitCode = 0;
    try {
        switch (command) {
            case '--help':
            case '-h':
                showUsage();
                break;
            case 'run': {
                // `run --goal "<text>"` goes through the compile-then-run wrapper;
                // a positional contract path goes straight to the run handler.
                if (args.includes('--goal')) {
                    exitCode = await (0, run_wrapper_1.handleRunV8)(args.slice(1));
                }
                else {
                    exitCode = await (0, run_handler_1.handleRun)(args.slice(1));
                }
                break;
            }
            case 'compile':
            case 'resume':
            case 'stats':
            case 'doctor':
            case 'init':
            case 'audit':
                // Top-level aliases for the v8 pipeline. `swarm <cmd>` is the
                // documented form; `swarm v8 <cmd>` remains supported for users
                // pinned to the explicit prefix.
                exitCode = await (0, index_1.handleV8Command)(args);
                break;
            case 'v8':
                exitCode = await (0, index_1.handleV8Command)(args.slice(1));
                break;
            default:
                logger.error(`Unknown command: ${command}\n`);
                showUsage();
                exitCode = 1;
        }
    }
    catch (error) {
        logger.error('Fatal error:', error instanceof Error ? error.message : String(error));
        exitCode = 1;
    }
    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}
if (require.main === module) {
    main();
}
