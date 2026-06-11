"use strict";
/**
 * Implementation of `swarm v8 init` (and `swarm init`).
 *
 * Scaffolds a starter `contract.yaml` and `patches.jsonl` in the
 * target directory, using language-appropriate build/test obligations.
 *
 * Flags:
 *   --language <lang>   node (default) | python | go | rust
 *   --force             overwrite existing files (default: skip)
 *   --cwd <path>        target directory (default: process.cwd())
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInit = handleInit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
const argv_schema_1 = require("./argv-schema");
const tournament_1 = require("../../population/tournament");
const logger = (0, logger_1.getLogger)('cli:v8:init');
/** Language-specific contract templates. */
const CONTRACT_TEMPLATES = {
    node: [
        { type: 'build-must-pass', command: 'npm run build' },
        { type: 'test-must-pass', command: 'npm test' },
    ],
    python: [
        { type: 'build-must-pass', command: 'python -m compileall .' },
        { type: 'test-must-pass', command: 'pytest' },
    ],
    go: [
        { type: 'build-must-pass', command: 'go build ./...' },
        { type: 'test-must-pass', command: 'go test ./...' },
    ],
    rust: [
        { type: 'build-must-pass', command: 'cargo build' },
        { type: 'test-must-pass', command: 'cargo test' },
    ],
};
const VALID_LANGUAGES = Object.keys(CONTRACT_TEMPLATES);
const PATCH_ENVELOPE_LINE = '{"patch":"no-op","source":"swarm-init"}';
function renderContractYaml(obligations) {
    const lines = ['obligations:'];
    for (const o of obligations) {
        lines.push(`  - type: ${o.type}`);
        lines.push(`    command: ${o.command}`);
    }
    return lines.join('\n') + '\n';
}
// Each obligation triggers a tournament that dispatches up to
// `candidatesPerRound * roundCap` session requests in parallel (per
// DEFAULT_TOURNAMENT_CONFIG). The deterministic session needs one
// envelope per dispatch, so scaffold that worst-case count per
// obligation. Otherwise the README quick-start ("swarm init && swarm
// run --goal ...") trips the 30s queue-exhausted timeout the moment
// round 1 fires more candidates than scaffolded envelopes.
function envelopesPerObligation(obligationType) {
    const cfg = tournament_1.DEFAULT_TOURNAMENT_CONFIG[obligationType];
    if (!cfg)
        return 1;
    return Math.max(1, cfg.candidatesPerRound * Math.min(cfg.roundCap, 3));
}
function renderPatchesJsonl(obligations) {
    const lines = [];
    for (const o of obligations) {
        const count = envelopesPerObligation(o.type);
        for (let i = 0; i < count; i += 1)
            lines.push(PATCH_ENVELOPE_LINE);
    }
    return lines.join('\n') + '\n';
}
const INIT_SCHEMA = {
    language: { type: 'string' },
    force: { type: 'boolean' },
    cwd: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
};
function parseFlags(argv) {
    const { values } = (0, argv_schema_1.runParseArgs)(argv, INIT_SCHEMA);
    const helpRequested = (0, argv_schema_1.readBoolean)(values, 'help');
    if (helpRequested) {
        process.stderr.write([
            'usage: swarm init [flags]',
            '',
            'flags:',
            '  --language <lang>  obligation language: node (default) | python | go | rust',
            '  --force            overwrite existing contract.yaml / patches.jsonl',
            '  --cwd <path>       target directory (default: process.cwd())',
            '  --help, -h         show this message',
            '',
        ].join('\n'));
    }
    const rawLang = (0, argv_schema_1.readString)(values, 'language');
    const language = rawLang !== undefined
        ? requireValidLanguage(rawLang)
        : 'node';
    const cwd = (0, argv_schema_1.readString)(values, 'cwd');
    return {
        language,
        force: (0, argv_schema_1.readBoolean)(values, 'force'),
        cwd: cwd !== undefined ? path.resolve(cwd) : process.cwd(),
        helpRequested,
    };
}
function requireValidLanguage(raw) {
    if (!VALID_LANGUAGES.includes(raw)) {
        throw new Error(`invalid --language value "${raw}"; expected ${VALID_LANGUAGES.join(' | ')}`);
    }
    return raw;
}
/** Top-level dispatcher for the `init` subcommand. */
async function handleInit(argv) {
    const flags = parseFlags(argv);
    if (flags.helpRequested)
        return 0;
    const contractPath = path.join(flags.cwd, 'contract.yaml');
    const patchesPath = path.join(flags.cwd, 'patches.jsonl');
    const contractExists = fs.existsSync(contractPath);
    const patchesExists = fs.existsSync(patchesPath);
    if ((contractExists || patchesExists) && !flags.force) {
        const existing = [];
        if (contractExists)
            existing.push('contract.yaml');
        if (patchesExists)
            existing.push('patches.jsonl');
        logger.info(`skipping init; ${existing.join(', ')} already exist. Use --force to overwrite.`);
        return 0;
    }
    const obligations = CONTRACT_TEMPLATES[flags.language];
    if (obligations === undefined) {
        // Should not happen after validation, but satisfies the type checker.
        logger.error(`unsupported language: ${flags.language}`);
        return 1;
    }
    // Ensure target directory exists.
    if (!fs.existsSync(flags.cwd)) {
        fs.mkdirSync(flags.cwd, { recursive: true });
    }
    fs.writeFileSync(contractPath, renderContractYaml(obligations), 'utf8');
    fs.writeFileSync(patchesPath, renderPatchesJsonl(obligations), 'utf8');
    logger.info(`created ${contractPath}`);
    logger.info(`created ${patchesPath}`);
    return 0;
}
