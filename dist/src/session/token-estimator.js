"use strict";
/**
 * Token-count estimator shared by the streaming verifier's live cost
 * tracker, the stub session's synthetic billing path, and the
 * synthetic-mode benchmark.
 *
 * Anthropic's published rule of thumb: ~4 characters per token for
 * English source text. Off by 10-20% on real prose; tight enough for
 * cost-tracking math where the multiplier on both sides of a comparison
 * is the same, and the absolute count is not load-bearing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
/**
 * Estimate the token count of a string using the four-chars-per-token
 * heuristic. Returns 0 for the empty string and at least 1 for any
 * non-empty input.
 */
function estimateTokens(text) {
    if (text.length === 0)
        return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}
