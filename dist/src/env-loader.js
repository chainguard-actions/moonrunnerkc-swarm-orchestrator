"use strict";
/**
 * Shared `.env` loader. Used by both the orchestrator CLI
 * (`src/cli.ts`) and standalone scripts that need the same env-search
 * order. Single source of truth so behaviour does not drift between
 * the two.
 *
 * Search order (first match for a given key wins):
 *   1. cwd (the target project directory)
 *   2. The orchestrator's own install directory (where cli.js lives)
 *   3. The user's home directory (~/.env) as a last-resort fallback
 *
 * Keys already present in `process.env` are *not* overwritten — the
 * shell's exported value beats any `.env` file.
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
exports.parseDotenvFile = parseDotenvFile;
exports.loadDotenv = loadDotenv;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parse a single `.env` file and set any variables not already in
 * `process.env`. Supports `KEY=value`, `KEY="value"`, `KEY='value'`,
 * and `export KEY=value`. Skips blank lines and comments.
 */
function parseDotenvFile(filePath) {
    if (!fs.existsSync(filePath))
        return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#'))
            continue;
        const stripped = line.startsWith('export ') ? line.slice(7) : line;
        const eqIndex = stripped.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = stripped.slice(0, eqIndex).trim();
        let value = stripped.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
/**
 * Load `.env` from cwd, the orchestrator install directory, and `~/.env`
 * in that priority. `orchestratorRoot` defaults to `dist/`-relative
 * resolution; callers running outside the compiled tree can override.
 */
function loadDotenv(orchestratorRoot) {
    const candidates = [path.resolve(process.cwd(), '.env')];
    // At runtime this module typically lives under `dist/src/`, so two
    // levels up reaches the project root where `.env` and `package.json`
    // live. Callers in non-standard layouts can pass an explicit root.
    const root = orchestratorRoot ?? path.resolve(__dirname, '..', '..');
    const orchestratorEnv = path.join(root, '.env');
    if (orchestratorEnv !== candidates[0]) {
        candidates.push(orchestratorEnv);
    }
    const homeEnv = path.join(process.env.HOME || process.env.USERPROFILE || '', '.env');
    if (homeEnv && !candidates.includes(homeEnv)) {
        candidates.push(homeEnv);
    }
    for (const envPath of candidates) {
        parseDotenvFile(envPath);
    }
}
