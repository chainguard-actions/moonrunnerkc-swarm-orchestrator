"use strict";
/**
 * @internal
 *
 * Synthetic in-memory `Session` implementation used by the project's own
 * integration tests and by the synthetic-mode benchmark. NOT a
 * user-facing provider: the three CLI-reachable providers are
 * `deterministic`, `local`, and `anthropic` (see `src/session/factory.ts`).
 *
 * Tests construct this class directly via `new StubSession({...})`. The
 * session factory deliberately does not accept a `stub` provider name;
 * if a future code path attempts to reach the stub through the factory,
 * the dedicated startup guard (see `assertStubNotInProductionPath`) will
 * surface the regression with a fail-loud error.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubSession = exports.estimateTokens = void 0;
const token_estimator_1 = require("./token-estimator");
Object.defineProperty(exports, "estimateTokens", { enumerable: true, get: function () { return token_estimator_1.estimateTokens; } });
const types_1 = require("./types");
/**
 * Deterministic in-memory session. Reports synthetic but consistent token
 * usage so the run-time pipeline can be exercised end-to-end without real
 * API access. Cache modeling: the static project context counts as a cache
 * write on the first call and a cache read on every subsequent call —
 * matching how Anthropic's prompt cache actually behaves on a hot prefix.
 *
 * Token estimates use the conventional "4 chars per token" heuristic. This
 * is approximate but sufficient for unit tests.
 */
class StubSession {
    cumulative = (0, types_1.emptyUsage)();
    callCount = 0;
    contextText;
    modelId;
    responder;
    streamChunkSize;
    constructor(options) {
        this.contextText = options.projectContext;
        this.modelId = options.model ?? 'stub-model';
        this.responder = options.responder ?? defaultResponder;
        this.streamChunkSize = options.streamChunkSize ?? 32;
    }
    projectContext() {
        return this.contextText;
    }
    totalUsage() {
        return { ...this.cumulative };
    }
    providerInfo() {
        return {
            provider: 'stub',
            model: this.modelId,
            backend: null,
            grammar: null,
            seed: null,
            usageEstimated: true,
        };
    }
    async complete(request) {
        const callIndex = this.callCount;
        this.callCount += 1;
        const text = this.responder(request, callIndex);
        const contextTokens = (0, token_estimator_1.estimateTokens)(this.contextText);
        const personaTokens = (0, token_estimator_1.estimateTokens)(request.personaSystemSuffix);
        const dynamicTokens = (0, token_estimator_1.estimateTokens)(request.userMessage);
        const outputTokens = (0, token_estimator_1.estimateTokens)(text);
        // Persona suffix is non-cached; project context is cached after the
        // first call. The non-cache portion always includes persona + dynamic.
        const nonCacheInput = personaTokens + dynamicTokens;
        const usage = callIndex === 0
            ? {
                inputTokens: nonCacheInput,
                cacheReadTokens: 0,
                cacheCreationTokens: contextTokens,
                outputTokens,
            }
            : {
                inputTokens: nonCacheInput,
                cacheReadTokens: contextTokens,
                cacheCreationTokens: 0,
                outputTokens,
            };
        this.cumulative = (0, types_1.addUsage)(this.cumulative, usage);
        return {
            text,
            usage,
            model: this.modelId,
            stopReason: 'end_turn',
        };
    }
    /**
     * Phase 6: simulated streaming. The stub computes the full responder
     * output up front and slices it into `streamChunkSize`-character
     * chunks, feeding the observer one chunk at a time. When the observer
     * returns `abort`, only the partial text observed up to that chunk
     * counts toward output usage; cache reads/writes for the prefix are
     * billed identically to `complete()`.
     */
    async stream(request, observer) {
        const callIndex = this.callCount;
        this.callCount += 1;
        const fullText = this.responder(request, callIndex);
        const contextTokens = (0, token_estimator_1.estimateTokens)(this.contextText);
        const personaTokens = (0, token_estimator_1.estimateTokens)(request.personaSystemSuffix);
        const dynamicTokens = (0, token_estimator_1.estimateTokens)(request.userMessage);
        const nonCacheInput = personaTokens + dynamicTokens;
        let partialText = '';
        let aborted = false;
        let abortReason = null;
        const chunkSize = Math.max(1, this.streamChunkSize);
        for (let i = 0; i < fullText.length; i += chunkSize) {
            const chunk = fullText.slice(i, i + chunkSize);
            partialText += chunk;
            const decision = observer({
                partialText,
                chunk,
                charsObserved: partialText.length,
            });
            if (decision.kind === 'abort') {
                aborted = true;
                abortReason = decision.reason;
                break;
            }
        }
        const finalText = aborted ? partialText : fullText;
        const outputTokens = (0, token_estimator_1.estimateTokens)(finalText);
        const usage = callIndex === 0
            ? {
                inputTokens: nonCacheInput,
                cacheReadTokens: 0,
                cacheCreationTokens: contextTokens,
                outputTokens,
            }
            : {
                inputTokens: nonCacheInput,
                cacheReadTokens: contextTokens,
                cacheCreationTokens: 0,
                outputTokens,
            };
        this.cumulative = (0, types_1.addUsage)(this.cumulative, usage);
        return {
            response: {
                text: finalText,
                usage,
                model: this.modelId,
                stopReason: aborted ? 'observer_abort' : 'end_turn',
            },
            aborted,
            abortReason,
        };
    }
}
exports.StubSession = StubSession;
function defaultResponder(request, callIndex) {
    return [
        `stub-response: persona=${request.personaId} call=${callIndex}`,
        `length=${request.userMessage.length}`,
    ].join(' ');
}
