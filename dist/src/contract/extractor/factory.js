"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTOR_PROVIDERS = void 0;
exports.buildExtractor = buildExtractor;
exports.resolveExtractorProvider = resolveExtractorProvider;
const anthropic_extractor_1 = require("./anthropic-extractor");
const deterministic_extractor_1 = require("./deterministic-extractor");
const local_extractor_1 = require("./local-extractor");
const factory_1 = require("../../inference/local/factory");
/** Validated provider names accepted by the factory. */
exports.EXTRACTOR_PROVIDERS = [
    'deterministic',
    'local',
    'anthropic',
];
/**
 * Resolve provider selection and construct the matching extractor. Each
 * branch reads its own configuration; misconfiguration is fail-loud with a
 * corrective hint.
 *
 * @throws when the deterministic provider is selected without any contract
 *         input form, or the Anthropic provider is selected without an API
 *         key, or an unsupported provider value is passed.
 */
function buildExtractor(flags) {
    if (flags.provider === 'deterministic') {
        return buildDeterministicExtractor(flags);
    }
    if (flags.provider === 'local') {
        return buildLocalExtractor(flags);
    }
    if (flags.provider === 'anthropic') {
        return buildAnthropicExtractor(flags);
    }
    throw new Error(`unknown extractor provider "${flags.provider}"; ` +
        `expected one of: ${exports.EXTRACTOR_PROVIDERS.join(', ')}`);
}
function buildDeterministicExtractor(flags) {
    if (flags.contractFile)
        return deterministic_extractor_1.DeterministicExtractor.fromFile(flags.contractFile);
    if (flags.contractModule)
        return deterministic_extractor_1.DeterministicExtractor.fromModule(flags.contractModule);
    if (flags.inlineContract)
        return deterministic_extractor_1.DeterministicExtractor.fromInline(flags.inlineContract);
    throw new Error('deterministic extractor selected but no contract input provided; ' +
        'pass --contract-file <path>, --contract-module <path>, or set provider.extractor with ' +
        'a contract: block in .swarm/config.yaml');
}
function buildLocalExtractor(flags) {
    const backendName = (0, factory_1.resolveLocalBackendName)(flags.localBackend ?? null);
    const baseUrl = (0, factory_1.resolveLocalBaseUrl)(flags.localBaseUrl ?? null);
    const model = flags.localModel ?? process.env.LOCAL_LLM_MODEL_EXTRACTOR ?? null;
    if (!model) {
        throw new Error('local extractor selected but no model id provided; ' +
            'set LOCAL_LLM_MODEL_EXTRACTOR or pass --local-model-extractor');
    }
    const backendOpts = {
        backend: backendName,
        baseUrl,
        apiKey: flags.localApiKey ?? process.env.LOCAL_LLM_API_KEY ?? null,
    };
    if (flags.localRequestTimeoutMs !== null && flags.localRequestTimeoutMs !== undefined) {
        backendOpts.requestTimeoutMs = flags.localRequestTimeoutMs;
    }
    if (flags.localMaxConcurrency !== null && flags.localMaxConcurrency !== undefined) {
        backendOpts.maxConcurrency = flags.localMaxConcurrency;
    }
    const backend = (0, factory_1.buildLocalBackend)(backendOpts);
    const opts = { backend, model };
    if (flags.localGrammar)
        opts.grammar = flags.localGrammar;
    if (flags.localSeed !== null && flags.localSeed !== undefined)
        opts.seed = flags.localSeed;
    if (flags.temperature !== null && flags.temperature !== undefined) {
        opts.temperature = flags.temperature;
    }
    return new local_extractor_1.LocalExtractor(opts);
}
function buildAnthropicExtractor(flags) {
    const apiKey = flags.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('anthropic extractor selected but ANTHROPIC_API_KEY is not set; ' +
            'pass --api-key, set the env var, or switch to --extractor deterministic');
    }
    const opts = { apiKey };
    if (flags.model !== null && flags.model !== undefined)
        opts.model = flags.model;
    if (flags.temperature !== null && flags.temperature !== undefined) {
        opts.temperature = flags.temperature;
    }
    return new anthropic_extractor_1.AnthropicExtractor(opts);
}
/**
 * Resolve the extractor provider name from the CLI flag (when set), the
 * `EXTRACTOR_PROVIDER` env var (when set), and the default (`deterministic`).
 * Returns the resolved name; the caller validates membership in
 * {@link EXTRACTOR_PROVIDERS}.
 */
function resolveExtractorProvider(flagValue) {
    const raw = flagValue ?? process.env.EXTRACTOR_PROVIDER ?? 'deterministic';
    if (!exports.EXTRACTOR_PROVIDERS.includes(raw)) {
        throw new Error(`invalid extractor provider "${raw}"; expected one of: ${exports.EXTRACTOR_PROVIDERS.join(', ')}`);
    }
    return raw;
}
