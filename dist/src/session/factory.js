"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_PROVIDERS = void 0;
exports.buildSession = buildSession;
exports.resolveSessionProvider = resolveSessionProvider;
const anthropic_session_1 = require("./anthropic-session");
const deterministic_session_1 = require("./deterministic-session");
const local_session_1 = require("./local-session");
const factory_1 = require("../inference/local/factory");
/** Validated provider names accepted by the factory. */
exports.SESSION_PROVIDERS = [
    'deterministic',
    'local',
    'anthropic',
];
/**
 * Resolve provider selection and construct the matching session. Each
 * branch reads its own configuration; misconfiguration is fail-loud with a
 * corrective hint.
 *
 * @throws when the deterministic provider has no patch source, when the
 *         Anthropic provider has no API key, or when an unsupported
 *         provider name is supplied.
 */
function buildSession(flags) {
    if (flags.provider === 'deterministic') {
        return buildDeterministicSession(flags);
    }
    if (flags.provider === 'local') {
        return buildLocalSession(flags);
    }
    if (flags.provider === 'anthropic') {
        return buildAnthropicSession(flags);
    }
    throw new Error(`unknown session provider "${flags.provider}"; ` +
        `expected one of: ${exports.SESSION_PROVIDERS.join(', ')}`);
}
function buildDeterministicSession(flags) {
    const source = resolveSource(flags);
    const opts = {
        projectContext: flags.projectContext,
        source,
    };
    if (flags.preloadedPatches !== undefined)
        opts.preloaded = flags.preloadedPatches;
    if (flags.externalPatchesTimeoutMs !== null && flags.externalPatchesTimeoutMs !== undefined) {
        opts.externalPatchesTimeoutMs = flags.externalPatchesTimeoutMs;
    }
    return new deterministic_session_1.DeterministicSession(opts);
}
function resolveSource(flags) {
    if (flags.externalPatchesDir)
        return { kind: 'dir', path: flags.externalPatchesDir };
    if (flags.externalPatchesQueue)
        return { kind: 'queue', path: flags.externalPatchesQueue };
    if (flags.externalPatchesStdin || flags.preloadedPatches !== undefined) {
        return { kind: 'stdin' };
    }
    throw new Error('deterministic session selected but no patch source provided; ' +
        'pass --external-patches-dir <path>, --external-patches-queue <path>, or ' +
        '--external-patches-stdin (set EXTERNAL_PATCHES_DIR / EXTERNAL_PATCHES_QUEUE to ' +
        'configure via the environment)');
}
function buildLocalSession(flags) {
    const backendName = (0, factory_1.resolveLocalBackendName)(flags.localBackend ?? null);
    const baseUrl = (0, factory_1.resolveLocalBaseUrl)(flags.localBaseUrl ?? null);
    const model = flags.localModel ?? process.env.LOCAL_LLM_MODEL_SESSION ?? null;
    if (!model) {
        throw new Error('local session selected but no model id provided; ' +
            'set LOCAL_LLM_MODEL_SESSION or pass --local-model-session');
    }
    const backend = (0, factory_1.buildLocalBackend)({
        backend: backendName,
        baseUrl,
        apiKey: flags.localApiKey ?? process.env.LOCAL_LLM_API_KEY ?? null,
    });
    const opts = {
        projectContext: flags.projectContext,
        backend,
        model,
    };
    if (flags.localPersonaModelMap)
        opts.personaModelMap = flags.localPersonaModelMap;
    if (flags.localGrammar)
        opts.grammar = flags.localGrammar;
    if (flags.localSeed !== null && flags.localSeed !== undefined)
        opts.seed = flags.localSeed;
    return new local_session_1.LocalSession(opts);
}
function buildAnthropicSession(flags) {
    const apiKey = flags.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('anthropic session selected but ANTHROPIC_API_KEY is not set; ' +
            'pass --api-key, set the env var, or switch to --session deterministic');
    }
    const opts = {
        apiKey,
        projectContext: flags.projectContext,
    };
    if (flags.model !== null && flags.model !== undefined)
        opts.model = flags.model;
    return new anthropic_session_1.AnthropicSession(opts);
}
/**
 * Resolve the session provider name from the CLI flag, the
 * `SESSION_PROVIDER` env var, and the default (`deterministic`). Returns
 * the resolved name; the caller validates membership in
 * {@link SESSION_PROVIDERS}.
 */
function resolveSessionProvider(flagValue) {
    const raw = flagValue ?? process.env.SESSION_PROVIDER ?? 'deterministic';
    if (!exports.SESSION_PROVIDERS.includes(raw)) {
        throw new Error(`invalid session provider "${raw}"; expected one of: ${exports.SESSION_PROVIDERS.join(', ')}`);
    }
    return raw;
}
