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
const provider_config_1 = require("../../src/config/provider-config");
function makeRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'provider-config-'));
}
function writeConfig(root, body) {
    const dir = path.join(root, '.swarm');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.yaml'), body);
}
describe('config/provider-config', () => {
    it('returns an empty config when the file does not exist', () => {
        const root = makeRoot();
        try {
            const cfg = (0, provider_config_1.loadProviderConfig)(root);
            node_assert_1.strict.equal(cfg.extractor, null);
            node_assert_1.strict.equal(cfg.session, null);
            node_assert_1.strict.equal(cfg.local.backend, null);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('returns an empty config when the file has no provider block', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'rule_packs:\n  - standard\n');
            const cfg = (0, provider_config_1.loadProviderConfig)(root);
            node_assert_1.strict.equal(cfg.extractor, null);
            node_assert_1.strict.equal(cfg.session, null);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('parses a complete provider block', () => {
        const root = makeRoot();
        try {
            writeConfig(root, [
                'provider:',
                '  extractor: deterministic',
                '  session: local',
                '  local:',
                '    backend: ollama',
                '    base_url: http://localhost:11434/v1',
                '    model_extractor: qwen2.5-coder:14b',
                '    model_session: qwen2.5-coder:32b',
                '    grammar: auto',
                '    request_timeout_ms: 90000',
                '    max_concurrency: 2',
                '    seed: 0',
                '    persona_model_map:',
                '      architect: qwen2.5-coder:32b',
                '      verifier: qwen2.5-coder:14b',
                '',
            ].join('\n'));
            const cfg = (0, provider_config_1.loadProviderConfig)(root);
            node_assert_1.strict.equal(cfg.extractor, 'deterministic');
            node_assert_1.strict.equal(cfg.session, 'local');
            node_assert_1.strict.equal(cfg.local.backend, 'ollama');
            node_assert_1.strict.equal(cfg.local.baseUrl, 'http://localhost:11434/v1');
            node_assert_1.strict.equal(cfg.local.modelExtractor, 'qwen2.5-coder:14b');
            node_assert_1.strict.equal(cfg.local.modelSession, 'qwen2.5-coder:32b');
            node_assert_1.strict.equal(cfg.local.grammar, 'auto');
            node_assert_1.strict.equal(cfg.local.requestTimeoutMs, 90000);
            node_assert_1.strict.equal(cfg.local.maxConcurrency, 2);
            node_assert_1.strict.equal(cfg.local.seed, 0);
            node_assert_1.strict.deepEqual(cfg.local.personaModelMap, {
                architect: 'qwen2.5-coder:32b',
                verifier: 'qwen2.5-coder:14b',
            });
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('honors a single field when set in isolation', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider:\n  extractor: deterministic\n');
            const cfg = (0, provider_config_1.loadProviderConfig)(root);
            node_assert_1.strict.equal(cfg.extractor, 'deterministic');
            node_assert_1.strict.equal(cfg.session, null);
            node_assert_1.strict.equal(cfg.local.backend, null);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('fails loud on an unknown provider key', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider:\n  extractor: deterministic\n  bogus: x\n');
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /unknown key "provider.bogus"/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('fails loud on an unknown local key', () => {
        const root = makeRoot();
        try {
            writeConfig(root, ['provider:', '  local:', '    backend: ollama', '    bogus_key: x', ''].join('\n'));
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /unknown key "provider.local.bogus_key"/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects an invalid extractor value', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider:\n  extractor: grpc\n');
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /provider\.extractor.*not one of/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects an invalid local.backend value', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider:\n  local:\n    backend: mlc\n');
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /provider\.local\.backend.*one of/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects a non-mapping provider block', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider: deterministic\n');
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /`provider` must be a mapping/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects malformed YAML', () => {
        const root = makeRoot();
        try {
            writeConfig(root, 'provider:\n  extractor: [unbalanced\n');
            node_assert_1.strict.throws(() => (0, provider_config_1.loadProviderConfig)(root), /not valid YAML/);
        }
        finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
