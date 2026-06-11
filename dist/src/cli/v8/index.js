"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleV8Command = handleV8Command;
const logger_1 = require("../../logger");
const audit_handler_1 = require("./audit-handler");
const compile_handler_1 = require("./compile-handler");
const doctor_handler_1 = require("./doctor-handler");
const init_handler_1 = require("./init-handler");
const resume_handler_1 = require("./resume-handler");
const run_handler_1 = require("./run-handler");
const stats_handler_1 = require("./stats-handler");
const logger = (0, logger_1.getLogger)('cli:v8');
/**
 * Top-level handler for `swarm v8 <subcommand> [args]`.
 *
 * Phase 1 ships `compile`. Phase 2 ships `run`. Phase 4 ships `resume`.
 *
 * @param argv arguments AFTER the literal `v8` token, i.e. the subcommand
 *   plus its flags.
 */
async function handleV8Command(argv) {
    const sub = argv[0];
    const rest = argv.slice(1);
    switch (sub) {
        case 'compile':
            return (0, compile_handler_1.handleCompile)(rest);
        case 'run':
            return (0, run_handler_1.handleRun)(rest);
        case 'resume':
            return (0, resume_handler_1.handleResume)(rest);
        case 'stats':
            return (0, stats_handler_1.handleStats)(rest);
        case 'init':
            return (0, init_handler_1.handleInit)(rest);
        case 'doctor':
            return (0, doctor_handler_1.handleDoctor)(rest);
        case 'audit':
            return (0, audit_handler_1.handleAudit)(rest);
        case undefined:
        case '--help':
        case '-h':
            printV8Usage();
            return sub === undefined ? 1 : 0;
        default:
            logger.error(`unknown v8 subcommand: ${sub}`);
            printV8Usage();
            return 1;
    }
}
function printV8Usage() {
    process.stderr.write([
        'usage: swarm v8 <subcommand> [args]',
        '',
        'subcommands:',
        '  compile <goal>   compile a natural-language goal into a contract',
        '  run <contract>   run a compiled contract',
        '  resume <run-id>  resume a partially-completed run',
        '  stats <run-id>   aggregate diagnostic counts from a run ledger',
        '  doctor           probe local prerequisites (API key, falsifiers, PMs)',
        '  init             scaffold contract.yaml + patches.jsonl',
        '  audit            audit a PR for AI-agent cheat patterns (v10)',
        '',
        'For per-subcommand flags, see `swarm v8 <subcommand> --help`.',
        '',
    ].join('\n'));
}
