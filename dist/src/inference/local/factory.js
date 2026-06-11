"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_BACKEND_NAMES = void 0;
exports.buildLocalBackend = buildLocalBackend;
exports.resolveLocalBackendName = resolveLocalBackendName;
exports.resolveLocalBaseUrl = resolveLocalBaseUrl;
const llama_cpp_1 = require("./backends/llama-cpp");
const ollama_1 = require("./backends/ollama");
const openai_compatible_1 = require("./backends/openai-compatible");
const vllm_1 = require("./backends/vllm");
const concurrency_gate_1 = require("./concurrency-gate");
/** Identifiers the factory accepts. */
exports.LOCAL_BACKEND_NAMES = [
    'openai-compatible',
    'ollama',
    'llama-cpp',
    'vllm',
];
/**
 * Construct a backend instance from a resolved configuration. The caller
 * (the extractor / session factory) is responsible for resolving the
 * configuration from flags, env vars, and the project config file.
 *
 * @throws when the backend name is unknown or when required options are
 *         missing for the selected backend.
 */
function buildLocalBackend(config) {
    if (!config.baseUrl) {
        throw new Error('local backend selected but baseUrl is empty; ' +
            'set LOCAL_LLM_BASE_URL or pass --local-base-url');
    }
    const raw = buildRawBackend(config);
    // `--local-max-concurrency` is documented as defaulting to 1. The
    // gate enforces that on the client side: backends like Ollama
    // serialize inference per loaded model anyway, so parallel calls
    // only burn each call's timeout budget waiting in the daemon
    // queue. A client-side semaphore lets each call's timer start
    // when it actually begins talking to the model.
    const limit = config.maxConcurrency ?? 1;
    if (limit < 1 || !Number.isFinite(limit))
        return raw;
    return new concurrency_gate_1.ConcurrencyLimitedBackend(raw, limit);
}
function buildRawBackend(config) {
    switch (config.backend) {
        case 'openai-compatible':
            return new openai_compatible_1.OpenAiCompatibleBackend(config);
        case 'ollama':
            return new ollama_1.OllamaBackend(config);
        case 'llama-cpp':
            return new llama_cpp_1.LlamaCppBackend(config);
        case 'vllm':
            return new vllm_1.VllmBackend(config);
        default:
            throw new Error(`unknown local backend "${config.backend}"; ` +
                `expected one of: ${exports.LOCAL_BACKEND_NAMES.join(', ')}`);
    }
}
/**
 * Resolve a backend name from the flag value, the LOCAL_LLM_BACKEND env
 * var, and a (no-)default. Returns the validated name.
 *
 * @throws when no source provides a valid backend name.
 */
function resolveLocalBackendName(flagValue) {
    const raw = flagValue ?? process.env.LOCAL_LLM_BACKEND ?? null;
    if (raw === null) {
        throw new Error('local provider selected but no backend specified; ' +
            `set LOCAL_LLM_BACKEND (${exports.LOCAL_BACKEND_NAMES.join(' | ')}) or pass --local-backend`);
    }
    if (!exports.LOCAL_BACKEND_NAMES.includes(raw)) {
        throw new Error(`invalid local backend "${raw}"; expected one of: ${exports.LOCAL_BACKEND_NAMES.join(', ')}`);
    }
    return raw;
}
/**
 * Resolve the local backend base URL from the flag, the env var, and a
 * (no-)default. Fail-loud when neither source provides a value.
 *
 * @throws when no base URL is available.
 */
function resolveLocalBaseUrl(flagValue) {
    const url = flagValue ?? process.env.LOCAL_LLM_BASE_URL ?? null;
    if (!url) {
        throw new Error('local provider selected but LOCAL_LLM_BASE_URL is not set; ' +
            'set the env var or pass --local-base-url <url>');
    }
    return url;
}
