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
const node_assert_1 = require("node:assert");
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const local_provider_flags_1 = require("../../src/cli/v8/local-provider-flags");
const argv_schema_1 = require("../../src/cli/v8/argv-schema");
const identity = (raw) => raw;
function parse(argv) {
    const { values } = (0, argv_schema_1.runParseArgs)(argv, local_provider_flags_1.LOCAL_PROVIDER_FLAG_SCHEMA);
    return (0, local_provider_flags_1.buildLocalProviderFlagValues)(values, identity);
}
describe('cli/v8/local-provider-flags', () => {
    it('LOCAL_PROVIDER_FLAG_SCHEMA covers the ten documented flags', () => {
        const keys = Object.keys(local_provider_flags_1.LOCAL_PROVIDER_FLAG_SCHEMA);
        node_assert_1.strict.equal(keys.length, 10);
        for (const k of [
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
        ]) {
            node_assert_1.strict.ok(keys.includes(k), `${k} should be in the schema`);
        }
    });
    it('--local-backend stores a valid backend name', () => {
        const v = parse(['--local-backend', 'ollama']);
        node_assert_1.strict.equal(v.backend, 'ollama');
    });
    it('--local-backend rejects an unknown backend name', () => {
        node_assert_1.strict.throws(() => parse(['--local-backend', 'mlc']), /invalid --local-backend "mlc"; expected one of: openai-compatible, ollama, llama-cpp, vllm/);
    });
    it('--local-base-url stores the raw URL', () => {
        const v = parse(['--local-base-url', 'http://example.local:11434/v1']);
        node_assert_1.strict.equal(v.baseUrl, 'http://example.local:11434/v1');
    });
    it('--local-model-extractor and --local-model-session are independent', () => {
        const v = parse([
            '--local-model-extractor', 'qwen2.5-coder:14b',
            '--local-model-session', 'qwen2.5-coder:32b',
        ]);
        node_assert_1.strict.equal(v.modelExtractor, 'qwen2.5-coder:14b');
        node_assert_1.strict.equal(v.modelSession, 'qwen2.5-coder:32b');
    });
    it('--local-persona-model-map accepts an inline JSON string', () => {
        const v = parse([
            '--local-persona-model-map',
            '{"architect":"qwen2.5-coder:32b","verifier":"qwen2.5-coder:14b"}',
        ]);
        node_assert_1.strict.deepEqual(v.personaModelMap, {
            architect: 'qwen2.5-coder:32b',
            verifier: 'qwen2.5-coder:14b',
        });
    });
    it('--local-persona-model-map reads a JSON file', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-flag-'));
        try {
            const p = path.join(tmp, 'map.json');
            fs.writeFileSync(p, '{"architect":"a","builder":"b"}');
            const v = parse(['--local-persona-model-map', p]);
            node_assert_1.strict.deepEqual(v.personaModelMap, { architect: 'a', builder: 'b' });
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
    it('--local-persona-model-map reads a YAML file', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-flag-'));
        try {
            const p = path.join(tmp, 'map.yaml');
            fs.writeFileSync(p, ['# comment', 'architect: qwen2.5-coder:32b', 'verifier: "qwen2.5-coder:14b"', ''].join('\n'));
            const v = parse(['--local-persona-model-map', p]);
            node_assert_1.strict.deepEqual(v.personaModelMap, {
                architect: 'qwen2.5-coder:32b',
                verifier: 'qwen2.5-coder:14b',
            });
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
    it('--local-persona-model-map rejects unsupported extensions', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-flag-'));
        try {
            const p = path.join(tmp, 'map.toml');
            fs.writeFileSync(p, 'whatever');
            node_assert_1.strict.throws(() => parse(['--local-persona-model-map', p]), /unsupported extension/);
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
    it('--local-persona-model-map rejects non-string values', () => {
        node_assert_1.strict.throws(() => parse(['--local-persona-model-map', '{"architect": 5}']), /must be a string/);
    });
    it('--local-grammar accepts every documented mode', () => {
        for (const m of local_provider_flags_1.LOCAL_GRAMMAR_MODES) {
            const v = parse(['--local-grammar', m]);
            node_assert_1.strict.equal(v.grammar, m);
        }
    });
    it('--local-grammar rejects unknown modes', () => {
        node_assert_1.strict.throws(() => parse(['--local-grammar', 'cfg']), /invalid --local-grammar "cfg"; expected one of: auto, gbnf, json-schema, outlines, none/);
    });
    it('--local-request-timeout-ms requires a positive integer', () => {
        const v = parse(['--local-request-timeout-ms', '60000']);
        node_assert_1.strict.equal(v.requestTimeoutMs, 60000);
        node_assert_1.strict.throws(() => parse(['--local-request-timeout-ms', '0']), /must be a positive integer/);
        node_assert_1.strict.throws(() => parse(['--local-request-timeout-ms', '-1']), /must be a positive integer/);
        node_assert_1.strict.throws(() => parse(['--local-request-timeout-ms', 'abc']), /must be a positive integer/);
    });
    it('--local-max-concurrency requires a positive integer', () => {
        const v = parse(['--local-max-concurrency', '4']);
        node_assert_1.strict.equal(v.maxConcurrency, 4);
        node_assert_1.strict.throws(() => parse(['--local-max-concurrency', '0']), /must be a positive integer/);
    });
    it('--local-api-key stores the raw value', () => {
        const v = parse(['--local-api-key', 'sk-local-abc']);
        node_assert_1.strict.equal(v.apiKey, 'sk-local-abc');
    });
    it('--local-seed requires a non-negative integer', () => {
        const v = parse(['--local-seed', '42']);
        node_assert_1.strict.equal(v.seed, 42);
        const z = parse(['--local-seed', '0']);
        node_assert_1.strict.equal(z.seed, 0);
        node_assert_1.strict.throws(() => parse(['--local-seed', '-1']), /must be a non-negative integer/);
    });
    it('a flag without a value raises a corrective error', () => {
        node_assert_1.strict.throws(() => parse(['--local-backend']), /--local-backend.*(requires a value|argument)/);
    });
});
