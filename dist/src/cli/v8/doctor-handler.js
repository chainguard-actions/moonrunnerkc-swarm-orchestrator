"use strict";
/**
 * Implementation of `swarm v8 doctor`.
 *
 * Probes the local environment for everything `swarm run` will touch:
 *   - ANTHROPIC_API_KEY is loadable from the env-loader's precedence chain
 *   - Falsifier adapter CLIs (codex, copilot, claude) respond to --version
 *   - At least one package manager (npm/yarn/pnpm) is on PATH
 *   - cwd is inside a writable directory (git repo when --require-git)
 *
 * Exit codes:
 *   0 — every probe passed
 *   9 — at least one probe failed (a `swarm run` will likely produce
 *       misleading output without intervention)
 *
 * The doctor never invokes the Anthropic API or any falsifier; it only
 * checks for prerequisites. Runs in well under a second on a normal
 * developer machine.
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
exports.handleDoctor = handleDoctor;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
const argv_schema_1 = require("./argv-schema");
const logger = (0, logger_1.getLogger)('cli:v8:doctor');
/** Top-level dispatcher for the `doctor` subcommand. */
async function handleDoctor(argv) {
    const flags = parseFlags(argv);
    if (flags.helpRequested)
        return 0;
    const results = [];
    results.push(probeApiKey());
    results.push(probeCommandOnPath('codex', false, 'falsifier (optional; only required for property-must-hold adversarial search)'));
    results.push(probeCommandOnPath('copilot', false, 'falsifier (optional)'));
    results.push(probeCommandOnPath('claude', false, 'falsifier (optional)'));
    results.push(probeAtLeastOnePackageManager());
    results.push(probeCwd(flags.cwd, flags.requireGit));
    let exitCode = 0;
    for (const r of results) {
        const mark = r.ok ? '✓' : '✗';
        const line = `${mark} ${r.name}: ${r.detail}`;
        if (r.ok) {
            logger.info(line);
        }
        else if (r.required) {
            logger.error(line);
            exitCode = 9;
        }
        else {
            logger.warn(line);
        }
    }
    if (exitCode === 0) {
        logger.info('doctor: all required probes passed.');
    }
    else {
        logger.error('doctor: one or more required probes failed; see ✗ entries above.');
    }
    return exitCode;
}
const DOCTOR_SCHEMA = {
    cwd: { type: 'string' },
    'require-git': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
};
function parseFlags(argv) {
    const { values } = (0, argv_schema_1.runParseArgs)(argv, DOCTOR_SCHEMA);
    const helpRequested = (0, argv_schema_1.readBoolean)(values, 'help');
    if (helpRequested) {
        process.stderr.write([
            'usage: swarm v8 doctor [flags]',
            '',
            'flags:',
            '  --cwd <path>      directory to inspect (default: process.cwd())',
            '  --require-git     fail if cwd is not inside a writable git repo',
            '  --help, -h        show this message',
            '',
        ].join('\n'));
    }
    const cwd = (0, argv_schema_1.readString)(values, 'cwd');
    return {
        cwd: cwd !== undefined ? path.resolve(cwd) : process.cwd(),
        requireGit: (0, argv_schema_1.readBoolean)(values, 'require-git'),
        helpRequested,
    };
}
function probeApiKey() {
    const v = process.env.ANTHROPIC_API_KEY;
    if (typeof v === 'string' && v.length >= 20) {
        return {
            name: 'ANTHROPIC_API_KEY',
            ok: true,
            detail: 'loaded from env (length=' + v.length + ')',
            required: true,
        };
    }
    return {
        name: 'ANTHROPIC_API_KEY',
        ok: false,
        detail: 'not loaded; set it in your shell, in the target repo\'s .env, in the orchestrator install .env, or in ~/.env',
        required: true,
    };
}
function probeCommandOnPath(command, required, role) {
    const result = (0, child_process_1.spawnSync)(command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    if (result.error && result.error.code === 'ENOENT') {
        return {
            name: `binary "${command}"`,
            ok: false,
            detail: `not on PATH — ${role}`,
            required,
        };
    }
    if (result.status === 0) {
        const v = (result.stdout?.toString() ?? '').trim().split('\n')[0] ?? '';
        return {
            name: `binary "${command}"`,
            ok: true,
            detail: v.length > 0 ? `available (${v})` : 'available',
            required,
        };
    }
    return {
        name: `binary "${command}"`,
        ok: false,
        detail: `present but \`${command} --version\` exited ${result.status ?? 'null'}; ${role}`,
        required,
    };
}
function probeAtLeastOnePackageManager() {
    const candidates = ['npm', 'yarn', 'pnpm'];
    const present = [];
    for (const c of candidates) {
        const r = (0, child_process_1.spawnSync)(c, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
        if (!r.error && r.status === 0)
            present.push(c);
    }
    if (present.length === 0) {
        return {
            name: 'package manager',
            ok: false,
            detail: 'no npm/yarn/pnpm on PATH; swarm needs at least one to run testCommand and buildCommand',
            required: true,
        };
    }
    return {
        name: 'package manager',
        ok: true,
        detail: `available on PATH: ${present.join(', ')}`,
        required: true,
    };
}
function probeCwd(cwd, requireGit) {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        return {
            name: 'working directory',
            ok: false,
            detail: `${cwd} does not exist or is not a directory`,
            required: true,
        };
    }
    // Writable?
    try {
        fs.accessSync(cwd, fs.constants.W_OK);
    }
    catch {
        return {
            name: 'working directory',
            ok: false,
            detail: `${cwd} is not writable; swarm needs to create .swarm/{contracts,ledger,snapshots}/`,
            required: true,
        };
    }
    if (requireGit) {
        const r = (0, child_process_1.spawnSync)('git', ['rev-parse', '--show-toplevel'], {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000,
        });
        if (r.status !== 0) {
            return {
                name: 'working directory',
                ok: false,
                detail: `${cwd} is not inside a git repo (required by --require-git)`,
                required: true,
            };
        }
    }
    return {
        name: 'working directory',
        ok: true,
        detail: `${cwd} is writable`,
        required: true,
    };
}
