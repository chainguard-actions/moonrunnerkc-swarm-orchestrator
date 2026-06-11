"use strict";
/**
 * Consolidated pipeline configuration — all feature flags that control
 * the population-manager run path in a single type so callers don't
 * need to thread a dozen individual booleans.
 *
 * C6: centralises flags that were previously scattered across RunFlags
 * and forwarded one-by-one to runPopulation().
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_NAMES = exports.PIPELINE_PRESETS = void 0;
exports.resolvePipelineConfig = resolvePipelineConfig;
exports.PIPELINE_PRESETS = {
    full: {
        deterministic: true,
        streaming: true,
        postMerge: true,
        preGeneration: true,
        falsifiers: 'on',
        falsifierScheduler: 'sequential',
        snapshotCleanup: '',
        forbiddenImports: [],
        tokenBudget: null,
        mode: 'single',
        candidates: null,
        maxObligations: null,
        commandTimeoutMs: null,
    },
    fast: {
        deterministic: true,
        streaming: false,
        postMerge: false,
        preGeneration: false,
        falsifiers: 'off',
        falsifierScheduler: 'sequential',
        snapshotCleanup: 'always',
        forbiddenImports: [],
        tokenBudget: null,
        mode: 'single',
        candidates: null,
        maxObligations: null,
        commandTimeoutMs: null,
    },
    minimal: {
        deterministic: false,
        streaming: false,
        postMerge: false,
        preGeneration: false,
        falsifiers: 'off',
        falsifierScheduler: 'sequential',
        snapshotCleanup: 'always',
        forbiddenImports: [],
        tokenBudget: null,
        mode: 'single',
        candidates: null,
        maxObligations: null,
        commandTimeoutMs: null,
    },
};
exports.PRESET_NAMES = Object.keys(exports.PIPELINE_PRESETS);
/**
 * Resolve a PipelineConfig from an optional preset name and optional
 * per-field overrides.  When `preset` is null/undefined the "full"
 * preset is used as the baseline.  Individual overrides always win.
 */
function resolvePipelineConfig(options) {
    const base = options.preset && exports.PIPELINE_PRESETS[options.preset]
        ? exports.PIPELINE_PRESETS[options.preset]
        : exports.PIPELINE_PRESETS['full'];
    if (!options.overrides)
        return { ...base };
    return { ...base, ...options.overrides };
}
