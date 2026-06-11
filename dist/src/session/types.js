"use strict";
// A "session" is a long-lived inference connection that shares a static
// project-context prefix across calls so prompt-cache reads dominate
// input cost.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_WRITE_MULTIPLIER = exports.CACHE_READ_MULTIPLIER = void 0;
exports.emptyUsage = emptyUsage;
exports.addUsage = addUsage;
exports.effectiveInputTokens = effectiveInputTokens;
exports.cacheHitRate = cacheHitRate;
function emptyUsage() {
    return {
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
    };
}
function addUsage(a, b) {
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
        cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
        outputTokens: a.outputTokens + b.outputTokens,
    };
}
// Anthropic-published prompt-cache pricing multipliers, applied to the
// model's standard input rate. Cache-read = 0.1×, cache-write = 1.25×.
// https://docs.claude.com/en/docs/build-with-claude/prompt-caching
exports.CACHE_READ_MULTIPLIER = 0.1;
exports.CACHE_WRITE_MULTIPLIER = 1.25;
// Input tokens normalized to standard-rate equivalents using the
// Anthropic cache multipliers.
function effectiveInputTokens(u) {
    return (u.inputTokens +
        u.cacheReadTokens * exports.CACHE_READ_MULTIPLIER +
        u.cacheCreationTokens * exports.CACHE_WRITE_MULTIPLIER);
}
function cacheHitRate(u) {
    const total = u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
    if (total === 0)
        return 0;
    return u.cacheReadTokens / total;
}
