"use strict";
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
exports.LOCAL_PROVIDER_FLAG_SCHEMA = exports.LOCAL_PROVIDER_FLAG_TOKENS = exports.LOCAL_GRAMMAR_MODES = void 0;
exports.emptyLocalProviderFlagValues = emptyLocalProviderFlagValues;
exports.buildLocalProviderFlagValues = buildLocalProviderFlagValues;
exports.resolveEffectiveLocalProvider = resolveEffectiveLocalProvider;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const factory_1 = require("../../inference/local/factory");
const local_provider_types_1 = require("./local-provider-types");
Object.defineProperty(exports, "LOCAL_GRAMMAR_MODES", { enumerable: true, get: function () { return local_provider_types_1.LOCAL_GRAMMAR_MODES; } });
const argv_schema_1 = require("./argv-schema");
/**
 * `--local-*` flag tokens, derived from the schema keys. Exported for
 * pass-through-style argv walkers (e.g. benchmarks/provider-bench) that
 * need to recognize the local-provider family without invoking parseArgs
 * themselves. Schema is the source of truth; this constant is a view.
 */
exports.LOCAL_PROVIDER_FLAG_TOKENS = Object.freeze([
    'local-backend',
    'local-base-url',
    'local-model-extractor',
    'local-model-session',
    'local-persona-model-map',
    'local-grammar',
    'local-request-timeout-ms',
    'local-max-concurrency',
    'local-api-key',
    'local-seed',
].map((k) => `--${k}`));
/** parseArgs schema records for every `--local-*` flag. */
exports.LOCAL_PROVIDER_FLAG_SCHEMA = {
    'local-backend': { type: 'string' },
    'local-base-url': { type: 'string' },
    'local-model-extractor': { type: 'string' },
    'local-model-session': { type: 'string' },
    'local-persona-model-map': { type: 'string' },
    'local-grammar': { type: 'string' },
    'local-request-timeout-ms': { type: 'string' },
    'local-max-concurrency': { type: 'string' },
    'local-api-key': { type: 'string' },
    'local-seed': { type: 'string' },
};
/** Construct a struct with every field unset. */
function emptyLocalProviderFlagValues() {
    return {
        backend: null,
        baseUrl: null,
        modelExtractor: null,
        modelSession: null,
        personaModelMap: null,
        grammar: null,
        requestTimeoutMs: null,
        maxConcurrency: null,
        apiKey: null,
        seed: null,
    };
}
/**
 * Translate the parseArgs `values` object into a typed
 * `LocalProviderFlagValues`. Throws on enum-invalid or range-invalid
 * input with the same message shape pre-3b emitted.
 *
 * `resolveModulePath` lets `--local-persona-model-map` resolve relative
 * paths against the handler-specific `repoRoot`.
 */
function buildLocalProviderFlagValues(values, resolveModulePath) {
    const out = emptyLocalProviderFlagValues();
    const backend = stringOrNull(values, 'local-backend');
    if (backend !== null) {
        if (!factory_1.LOCAL_BACKEND_NAMES.includes(backend)) {
            throw new Error(`invalid --local-backend "${backend}"; expected one of: ${factory_1.LOCAL_BACKEND_NAMES.join(', ')}`);
        }
        out.backend = backend;
    }
    out.baseUrl = stringOrNull(values, 'local-base-url');
    out.modelExtractor = stringOrNull(values, 'local-model-extractor');
    out.modelSession = stringOrNull(values, 'local-model-session');
    const map = stringOrNull(values, 'local-persona-model-map');
    if (map !== null)
        out.personaModelMap = parsePersonaModelMap(map, resolveModulePath);
    const grammar = stringOrNull(values, 'local-grammar');
    if (grammar !== null) {
        if (!local_provider_types_1.LOCAL_GRAMMAR_MODES.includes(grammar)) {
            throw new Error(`invalid --local-grammar "${grammar}"; expected one of: ${local_provider_types_1.LOCAL_GRAMMAR_MODES.join(', ')}`);
        }
        out.grammar = grammar;
    }
    const reqTimeout = stringOrNull(values, 'local-request-timeout-ms');
    if (reqTimeout !== null)
        out.requestTimeoutMs = (0, argv_schema_1.requirePositiveInt)(reqTimeout, '--local-request-timeout-ms');
    const maxConc = stringOrNull(values, 'local-max-concurrency');
    if (maxConc !== null)
        out.maxConcurrency = (0, argv_schema_1.requirePositiveInt)(maxConc, '--local-max-concurrency');
    out.apiKey = stringOrNull(values, 'local-api-key');
    const seed = stringOrNull(values, 'local-seed');
    if (seed !== null)
        out.seed = (0, argv_schema_1.requireNonNegativeInt)(seed, '--local-seed');
    return out;
}
function stringOrNull(values, key) {
    const v = values[key];
    return typeof v === 'string' ? v : null;
}
/**
 * Apply the precedence chain `flag > env > config > default` to the
 * local-provider fields. Returns a new `LocalProviderFlagValues` with
 * each field set to the highest-priority non-null value among the three
 * sources (or null if every source is unset; factory defaults take over).
 *
 * The env-var names match the existing factory's lookup keys.
 */
function resolveEffectiveLocalProvider(fromFlag, fromConfig, env = process.env) {
    return {
        backend: fromFlag.backend ??
            (env['LOCAL_LLM_BACKEND'] && factory_1.LOCAL_BACKEND_NAMES.includes(env['LOCAL_LLM_BACKEND'])
                ? env['LOCAL_LLM_BACKEND']
                : null) ??
            fromConfig.backend ??
            null,
        baseUrl: fromFlag.baseUrl ?? env['LOCAL_LLM_BASE_URL'] ?? fromConfig.baseUrl ?? null,
        modelExtractor: fromFlag.modelExtractor ??
            env['LOCAL_LLM_MODEL_EXTRACTOR'] ??
            fromConfig.modelExtractor ??
            null,
        modelSession: fromFlag.modelSession ??
            env['LOCAL_LLM_MODEL_SESSION'] ??
            fromConfig.modelSession ??
            null,
        personaModelMap: fromFlag.personaModelMap ?? fromConfig.personaModelMap ?? null,
        grammar: fromFlag.grammar ??
            (env['LOCAL_LLM_GRAMMAR'] && local_provider_types_1.LOCAL_GRAMMAR_MODES.includes(env['LOCAL_LLM_GRAMMAR'])
                ? env['LOCAL_LLM_GRAMMAR']
                : null) ??
            fromConfig.grammar ??
            null,
        requestTimeoutMs: fromFlag.requestTimeoutMs ??
            readNumberEnv(env['LOCAL_LLM_REQUEST_TIMEOUT_MS']) ??
            fromConfig.requestTimeoutMs ??
            null,
        maxConcurrency: fromFlag.maxConcurrency ??
            readNumberEnv(env['LOCAL_LLM_MAX_CONCURRENCY']) ??
            fromConfig.maxConcurrency ??
            null,
        apiKey: fromFlag.apiKey ?? env['LOCAL_LLM_API_KEY'] ?? null,
        seed: fromFlag.seed ?? readNumberEnv(env['LOCAL_LLM_SEED']) ?? fromConfig.seed ?? null,
    };
}
function readNumberEnv(raw) {
    if (raw === undefined)
        return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
}
/**
 * Parse the value of `--local-persona-model-map`. Three accepted forms:
 *
 *   1. An inline JSON string: `'{"architect":"qwen2.5-coder:32b"}'`
 *   2. A path to a `.json` file containing such a map.
 *   3. A path to a `.yaml` / `.yml` file containing such a map.
 *
 * Returns a frozen `Record<string, string>`.
 */
function parsePersonaModelMap(raw, resolveModulePath) {
    const trimmed = raw.trim();
    let parsed;
    if (trimmed.startsWith('{')) {
        try {
            parsed = JSON.parse(trimmed);
        }
        catch (err) {
            throw new Error(`invalid --local-persona-model-map JSON: ${err.message}`, { cause: err });
        }
    }
    else {
        const resolved = resolveModulePath(raw);
        let body;
        try {
            body = fs.readFileSync(resolved, 'utf8');
        }
        catch (err) {
            throw new Error(`--local-persona-model-map file "${resolved}" not readable: ${err.message}`, { cause: err });
        }
        const ext = path.extname(resolved).toLowerCase();
        if (ext === '.json') {
            try {
                parsed = JSON.parse(body);
            }
            catch (err) {
                throw new Error(`--local-persona-model-map file "${resolved}" is not valid JSON: ${err.message}`, { cause: err });
            }
        }
        else if (ext === '.yaml' || ext === '.yml') {
            parsed = parseYamlFlatMap(body, resolved);
        }
        else {
            throw new Error(`--local-persona-model-map: unsupported extension "${ext}" on "${resolved}"; expected .json, .yaml, or .yml`);
        }
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('--local-persona-model-map must parse to a JSON/YAML object with string keys and string values');
    }
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') {
            throw new Error(`--local-persona-model-map["${k}"] must be a string; got ${typeof v}`);
        }
        out[k] = v;
    }
    return Object.freeze(out);
}
// Minimal YAML flat-map parser: `key: value` per line, `#` comments,
// blank lines. Anything more elaborate is rejected with a corrective
// error; the wider YAML grammar isn't needed for this one tiny use case.
function parseYamlFlatMap(body, sourcePath) {
    const out = {};
    const lines = body.split(/\r?\n/);
    for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
        const raw = lines[lineNo] ?? '';
        const noComment = raw.replace(/(^|\s)#.*$/, '$1');
        const trimmed = noComment.trim();
        if (trimmed.length === 0)
            continue;
        const colon = trimmed.indexOf(':');
        if (colon <= 0) {
            throw new Error(`--local-persona-model-map: ${sourcePath}:${lineNo + 1}: ` +
                'expected `key: value` on each non-blank line');
        }
        const key = trimmed.slice(0, colon).trim();
        let value = trimmed.slice(colon + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key.length === 0 || value.length === 0) {
            throw new Error(`--local-persona-model-map: ${sourcePath}:${lineNo + 1}: ` +
                'key and value must each be non-empty');
        }
        out[key] = value;
    }
    return out;
}
