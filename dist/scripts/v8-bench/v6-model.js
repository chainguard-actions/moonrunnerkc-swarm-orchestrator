"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_V6_MODEL = void 0;
exports.modelV6Usage = modelV6Usage;
exports.modelV6EffectiveInputTokens = modelV6EffectiveInputTokens;
const types_1 = require("../../src/session/types");
exports.DEFAULT_V6_MODEL = {
    bootstrapTokens: 40_000,
    dynamicTokens: 3_000,
    outputTokens: 3_000,
    retryFactor: 0.9,
};
/** Compute the v6 SessionUsage equivalent for a contract. */
function modelV6Usage(obligations, model = exports.DEFAULT_V6_MODEL) {
    const n = obligations.length;
    // Primary attempts: n CLI invocations.
    const primaryInput = n * (model.bootstrapTokens + model.dynamicTokens);
    const primaryOutput = n * model.outputTokens;
    // Retry cycles: n × retryFactor extra attempts, each paying bootstrap again.
    const retryInput = n * model.retryFactor * (model.bootstrapTokens + model.dynamicTokens);
    const retryOutput = n * model.retryFactor * model.outputTokens;
    return {
        inputTokens: primaryInput + retryInput,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: primaryOutput + retryOutput,
    };
}
/**
 * Effective input tokens for a v6-modeled contract. Equivalent to
 * `effectiveInputTokens(modelV6Usage(...))` since v6 has no cache and the
 * cache multipliers are no-ops on it. Exposed as its own function so the
 * benchmark report can show the math without re-deriving usage.
 */
function modelV6EffectiveInputTokens(obligations, model = exports.DEFAULT_V6_MODEL) {
    return (0, types_1.effectiveInputTokens)(modelV6Usage(obligations, model));
}
