"use strict";
/**
 * Backend abstraction for the local-inference provider. Four backends ship
 * in tree: openai-compatible, ollama, llama-cpp, vllm. Adding a fifth backend
 * is one new file under `backends/` that exports a {@link LocalBackend} value
 * keyed in the factory.
 *
 * The interface is intentionally small. Each backend implements four
 * methods: a non-streaming chat completion, a streaming variant, a grammar
 * capability report, and a usage-reporting hint. The local extractor and
 * local session compose against this interface — they do not import any
 * specific backend module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MAX_CONCURRENCY = exports.DEFAULT_REQUEST_TIMEOUT_MS = void 0;
exports.emptyBackendUsage = emptyBackendUsage;
/** Zero-initialized backend usage record. */
function emptyBackendUsage() {
    return {
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
    };
}
/** Default per-request timeout in ms. */
exports.DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
/** Default max concurrency. */
exports.DEFAULT_MAX_CONCURRENCY = 1;
