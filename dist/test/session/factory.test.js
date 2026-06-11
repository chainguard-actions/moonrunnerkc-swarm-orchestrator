"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const factory_1 = require("../../src/session/factory");
const deterministic_session_1 = require("../../src/session/deterministic-session");
const anthropic_session_1 = require("../../src/session/anthropic-session");
describe('session — factory', () => {
    describe('resolveSessionProvider', () => {
        const originalEnv = process.env.SESSION_PROVIDER;
        afterEach(() => {
            if (originalEnv === undefined)
                delete process.env.SESSION_PROVIDER;
            else
                process.env.SESSION_PROVIDER = originalEnv;
        });
        it('defaults to deterministic', () => {
            delete process.env.SESSION_PROVIDER;
            node_assert_1.strict.equal((0, factory_1.resolveSessionProvider)(null), 'deterministic');
        });
        it('honors SESSION_PROVIDER when the flag is null', () => {
            process.env.SESSION_PROVIDER = 'anthropic';
            node_assert_1.strict.equal((0, factory_1.resolveSessionProvider)(null), 'anthropic');
        });
        it('prefers the flag over the env var', () => {
            process.env.SESSION_PROVIDER = 'anthropic';
            node_assert_1.strict.equal((0, factory_1.resolveSessionProvider)('local'), 'local');
        });
        it('rejects an unknown provider', () => {
            node_assert_1.strict.throws(() => (0, factory_1.resolveSessionProvider)('grpc'), /expected one of/);
        });
        it('rejects the legacy stub provider name', () => {
            delete process.env.SESSION_PROVIDER;
            node_assert_1.strict.throws(() => (0, factory_1.resolveSessionProvider)('stub'), /invalid session provider "stub"/);
        });
    });
    describe('buildSession', () => {
        it('returns DeterministicSession when a patch source is supplied', () => {
            const s = (0, factory_1.buildSession)({
                provider: 'deterministic',
                projectContext: 'ctx',
                preloadedPatches: [{ patch: 'no-op' }],
            });
            node_assert_1.strict.ok(s instanceof deterministic_session_1.DeterministicSession);
        });
        it('fails loud when deterministic is selected without any patch source', () => {
            node_assert_1.strict.throws(() => (0, factory_1.buildSession)({ provider: 'deterministic', projectContext: 'ctx' }), /no patch source provided/);
        });
        it('fails loud when anthropic is selected without an API key', () => {
            const original = process.env.ANTHROPIC_API_KEY;
            delete process.env.ANTHROPIC_API_KEY;
            try {
                node_assert_1.strict.throws(() => (0, factory_1.buildSession)({ provider: 'anthropic', projectContext: 'ctx' }), /ANTHROPIC_API_KEY is not set/);
            }
            finally {
                if (original !== undefined)
                    process.env.ANTHROPIC_API_KEY = original;
            }
        });
        it('returns AnthropicSession when an API key is provided', () => {
            const s = (0, factory_1.buildSession)({
                provider: 'anthropic',
                projectContext: 'ctx',
                apiKey: 'sk-test',
            });
            node_assert_1.strict.ok(s instanceof anthropic_session_1.AnthropicSession);
        });
        describe('local provider misconfiguration (DoD 2: no silent fallback)', () => {
            const origBaseUrl = process.env.LOCAL_LLM_BASE_URL;
            const origBackend = process.env.LOCAL_LLM_BACKEND;
            const origModel = process.env.LOCAL_LLM_MODEL_SESSION;
            beforeEach(() => {
                delete process.env.LOCAL_LLM_BASE_URL;
                delete process.env.LOCAL_LLM_BACKEND;
                delete process.env.LOCAL_LLM_MODEL_SESSION;
            });
            afterEach(() => {
                if (origBaseUrl !== undefined)
                    process.env.LOCAL_LLM_BASE_URL = origBaseUrl;
                if (origBackend !== undefined)
                    process.env.LOCAL_LLM_BACKEND = origBackend;
                if (origModel !== undefined)
                    process.env.LOCAL_LLM_MODEL_SESSION = origModel;
            });
            it('fails loud when local is selected without a backend name', () => {
                node_assert_1.strict.throws(() => (0, factory_1.buildSession)({
                    provider: 'local',
                    projectContext: 'ctx',
                    localBaseUrl: 'http://localhost:11434/v1',
                    localModel: 'qwen2.5-coder:32b',
                }), /no backend specified/);
            });
            it('fails loud when local is selected without a base URL', () => {
                node_assert_1.strict.throws(() => (0, factory_1.buildSession)({
                    provider: 'local',
                    projectContext: 'ctx',
                    localBackend: 'ollama',
                    localModel: 'qwen2.5-coder:32b',
                }), /LOCAL_LLM_BASE_URL is not set/);
            });
            it('fails loud when local is selected without a model id', () => {
                node_assert_1.strict.throws(() => (0, factory_1.buildSession)({
                    provider: 'local',
                    projectContext: 'ctx',
                    localBackend: 'ollama',
                    localBaseUrl: 'http://localhost:11434/v1',
                }), /no model id provided/);
            });
        });
    });
});
