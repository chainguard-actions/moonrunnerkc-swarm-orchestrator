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
const provider_config_1 = require("../../src/config/provider-config");
/**
 * End-to-end exercise of the documented precedence chain for the
 * `LOCAL_LLM_BASE_URL` configuration source:
 *
 *     CLI flag > env var > `.swarm/config.yaml provider.local.base_url` > default
 *
 * Each step in this test sets the value via one source and verifies the
 * resolver returns it; subsequent steps shadow it with a higher-priority
 * source and the resolver picks the higher one. This proves the chain
 * works without relying on any handler-level integration code.
 */
describe('cli/v8 — precedence chain: --local-base-url / LOCAL_LLM_BASE_URL / config', () => {
    let root;
    const originalBaseUrl = process.env['LOCAL_LLM_BASE_URL'];
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'precedence-'));
        delete process.env['LOCAL_LLM_BASE_URL'];
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        if (originalBaseUrl === undefined) {
            delete process.env['LOCAL_LLM_BASE_URL'];
        }
        else {
            process.env['LOCAL_LLM_BASE_URL'] = originalBaseUrl;
        }
    });
    function writeConfigBaseUrl(value) {
        const dir = path.join(root, '.swarm');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'config.yaml'), ['provider:', '  local:', `    base_url: ${value}`, ''].join('\n'));
    }
    it('uses the default (null → factory fallback) when no source supplies a value', () => {
        const config = (0, provider_config_1.loadProviderConfig)(root);
        const resolved = (0, local_provider_flags_1.resolveEffectiveLocalProvider)((0, local_provider_flags_1.emptyLocalProviderFlagValues)(), config.local);
        node_assert_1.strict.equal(resolved.baseUrl, null);
    });
    it('config wins over the default', () => {
        writeConfigBaseUrl('http://config.local:1111/v1');
        const config = (0, provider_config_1.loadProviderConfig)(root);
        const resolved = (0, local_provider_flags_1.resolveEffectiveLocalProvider)((0, local_provider_flags_1.emptyLocalProviderFlagValues)(), config.local);
        node_assert_1.strict.equal(resolved.baseUrl, 'http://config.local:1111/v1');
    });
    it('env var wins over the config file', () => {
        writeConfigBaseUrl('http://config.local:1111/v1');
        process.env['LOCAL_LLM_BASE_URL'] = 'http://env.local:2222/v1';
        const config = (0, provider_config_1.loadProviderConfig)(root);
        const resolved = (0, local_provider_flags_1.resolveEffectiveLocalProvider)((0, local_provider_flags_1.emptyLocalProviderFlagValues)(), config.local);
        node_assert_1.strict.equal(resolved.baseUrl, 'http://env.local:2222/v1');
    });
    it('flag wins over both env var and config file', () => {
        writeConfigBaseUrl('http://config.local:1111/v1');
        process.env['LOCAL_LLM_BASE_URL'] = 'http://env.local:2222/v1';
        const flag = (0, local_provider_flags_1.emptyLocalProviderFlagValues)();
        flag.baseUrl = 'http://flag.local:3333/v1';
        const config = (0, provider_config_1.loadProviderConfig)(root);
        const resolved = (0, local_provider_flags_1.resolveEffectiveLocalProvider)(flag, config.local);
        node_assert_1.strict.equal(resolved.baseUrl, 'http://flag.local:3333/v1');
    });
    it('preserves env-var precedence over config when only env and config are set', () => {
        writeConfigBaseUrl('http://config.local:1111/v1');
        process.env['LOCAL_LLM_BASE_URL'] = 'http://env.local:2222/v1';
        const config = (0, provider_config_1.loadProviderConfig)(root);
        const resolved = (0, local_provider_flags_1.resolveEffectiveLocalProvider)((0, local_provider_flags_1.emptyLocalProviderFlagValues)(), config.local);
        node_assert_1.strict.equal(resolved.baseUrl, 'http://env.local:2222/v1');
    });
});
