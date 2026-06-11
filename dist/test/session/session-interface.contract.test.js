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
const anthropic_session_1 = require("../../src/session/anthropic-session");
const deterministic_session_1 = require("../../src/session/deterministic-session");
const local_session_1 = require("../../src/session/local-session");
const factory_1 = require("../../src/inference/local/factory");
function withTempQueue(envelopes) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-contract-'));
    const queuePath = path.join(tmp, 'queue.jsonl');
    fs.writeFileSync(queuePath, envelopes.map((e) => JSON.stringify(e)).join('\n') + (envelopes.length > 0 ? '\n' : ''));
    return {
        cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
        build: () => new deterministic_session_1.DeterministicSession({
            projectContext: 'CTX',
            source: { kind: 'queue', path: queuePath },
            externalPatchesTimeoutMs: 100,
        }),
        expectedProvider: 'deterministic',
    };
}
class FakeAnthropicClient {
    text;
    constructor(text) {
        this.text = text;
    }
    messages = {
        create: async () => ({
            content: [{ type: 'text', text: this.text }],
            usage: {
                input_tokens: 5,
                output_tokens: 1,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 10,
            },
            model: 'claude-fake',
            stop_reason: 'end_turn',
        }),
        // Simulated streaming: walk over a 2-char chunked iteration so the
        // observer is invoked multiple times. Supports observer abort via
        // `stream.controller.abort()` semantics with an external flag.
        stream: () => {
            const chunks = [];
            for (let i = 0; i < this.text.length; i += 2)
                chunks.push(this.text.slice(i, i + 2));
            let aborted = false;
            const text = this.text;
            return {
                controller: {
                    abort: () => {
                        aborted = true;
                    },
                },
                async *[Symbol.asyncIterator]() {
                    for (const c of chunks) {
                        if (aborted)
                            return;
                        yield {
                            type: 'content_block_delta',
                            delta: { type: 'text_delta', text: c },
                        };
                    }
                },
                finalMessage: async () => ({
                    content: [{ type: 'text', text }],
                    usage: {
                        input_tokens: 5,
                        output_tokens: 1,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 10,
                    },
                    model: 'claude-fake',
                    stop_reason: aborted ? null : 'end_turn',
                }),
            };
        },
    };
}
class FakeLocalBackend {
    name;
    text;
    grammars;
    constructor(name, text, grammars) {
        this.name = name;
        this.text = text;
        this.grammars = grammars;
    }
    async chat(_request) {
        return {
            text: this.text,
            usage: {
                inputTokens: 4,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: this.text.length,
            },
            usageEstimated: false,
        };
    }
    async stream(_request, observer) {
        let partial = '';
        let aborted = false;
        for (let i = 0; i < this.text.length; i += 2) {
            const chunk = this.text.slice(i, i + 2);
            partial += chunk;
            const keepGoing = observer({ chunk, partialText: partial });
            if (!keepGoing) {
                aborted = true;
                break;
            }
        }
        return {
            text: partial,
            usage: {
                inputTokens: 4,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: partial.length,
            },
            usageEstimated: false,
            aborted,
        };
    }
    supportsGrammar() {
        return this.grammars;
    }
}
const FAKE_PATCH = [
    '--- /dev/null',
    '+++ b/src/added.ts',
    '@@ -0,0 +1,1 @@',
    '+export const x = 1;',
    '',
].join('\n');
const PROVIDERS = [];
PROVIDERS.push({
    name: 'deterministic',
    build: () => {
        const ctx = withTempQueue([{ patch: FAKE_PATCH, source: 'test' }]);
        return { session: ctx.build(), expectedProvider: 'deterministic' };
    },
});
for (const backendName of factory_1.LOCAL_BACKEND_NAMES) {
    PROVIDERS.push({
        name: `local-${backendName}`,
        build: () => {
            const fake = new FakeLocalBackend(backendName, FAKE_PATCH, backendName === 'llama-cpp' ? ['gbnf'] : ['json-schema']);
            const session = new local_session_1.LocalSession({
                projectContext: 'CTX',
                backend: fake,
                model: 'fake-model',
                grammar: 'none',
                seed: 0,
            });
            return { session, expectedProvider: 'local' };
        },
    });
}
PROVIDERS.push({
    name: 'anthropic',
    build: () => {
        const session = new anthropic_session_1.AnthropicSession({
            apiKey: 'k',
            projectContext: 'CTX',
            client: new FakeAnthropicClient(FAKE_PATCH),
        });
        return { session, expectedProvider: 'anthropic' };
    },
});
const STUB_REQUEST = {
    personaId: 'architect',
    personaSystemSuffix: 'SUFFIX',
    sampling: { temperature: 0.0, maxTokens: 64 },
    userMessage: 'apply this fixture patch',
};
for (const provider of PROVIDERS) {
    describe(`Session interface contract: ${provider.name}`, () => {
        it('complete() returns a non-empty SessionResponse with the documented shape', async () => {
            const { session } = provider.build();
            const out = await session.complete(STUB_REQUEST);
            node_assert_1.strict.equal(typeof out.text, 'string');
            node_assert_1.strict.ok(out.text.length > 0, `complete() must not return empty text`);
            node_assert_1.strict.equal(typeof out.model, 'string');
            node_assert_1.strict.ok(out.usage);
            node_assert_1.strict.equal(typeof out.usage.inputTokens, 'number');
            node_assert_1.strict.equal(typeof out.usage.cacheReadTokens, 'number');
            node_assert_1.strict.equal(typeof out.usage.cacheCreationTokens, 'number');
            node_assert_1.strict.equal(typeof out.usage.outputTokens, 'number');
        });
        it('stream() emits chunks in order and ends with the final text observable', async () => {
            const { session } = provider.build();
            const events = [];
            const result = await session.stream(STUB_REQUEST, (event) => {
                events.push(event);
                return { kind: 'continue' };
            });
            node_assert_1.strict.ok(events.length > 0, 'stream() must invoke the observer at least once');
            // Chunks accumulate monotonically into partialText.
            for (let i = 1; i < events.length; i += 1) {
                node_assert_1.strict.ok((events[i]?.charsObserved ?? 0) >= (events[i - 1]?.charsObserved ?? 0), 'charsObserved must not decrease');
            }
            node_assert_1.strict.equal(result.aborted, false);
            node_assert_1.strict.equal(typeof result.response.text, 'string');
            node_assert_1.strict.ok(result.response.text.length > 0);
        });
        it('projectContext() returns the prefix the session caches', () => {
            const { session } = provider.build();
            const ctx = session.projectContext();
            node_assert_1.strict.equal(typeof ctx, 'string');
            node_assert_1.strict.ok(ctx.length > 0);
        });
        it('totalUsage() returns a typed SessionUsage with finite numeric fields even when zero', () => {
            const { session } = provider.build();
            const usage = session.totalUsage();
            node_assert_1.strict.equal(typeof usage.inputTokens, 'number');
            node_assert_1.strict.equal(typeof usage.cacheReadTokens, 'number');
            node_assert_1.strict.equal(typeof usage.cacheCreationTokens, 'number');
            node_assert_1.strict.equal(typeof usage.outputTokens, 'number');
            for (const v of Object.values(usage)) {
                node_assert_1.strict.ok(Number.isFinite(v), 'totalUsage fields must be finite numbers');
            }
        });
        it('a mid-stream abort terminates emission and reports aborted=true', async () => {
            const { session } = provider.build();
            let sawAbort = false;
            const result = await session.stream(STUB_REQUEST, (event) => {
                // Abort on the second observed chunk so we exercise both
                // "continue" and "abort" paths.
                if (event.charsObserved >= 1 && !sawAbort) {
                    sawAbort = true;
                    return { kind: 'abort', reason: 'contract-test' };
                }
                return { kind: 'continue' };
            });
            node_assert_1.strict.equal(result.aborted, true);
            node_assert_1.strict.equal(result.abortReason, 'contract-test');
        });
        it('providerInfo() reports a non-empty provider identifier that matches the expected name', () => {
            const { session, expectedProvider } = provider.build();
            const info = session.providerInfo();
            node_assert_1.strict.equal(info.provider, expectedProvider);
            node_assert_1.strict.equal(typeof info.usageEstimated, 'boolean');
        });
    });
}
