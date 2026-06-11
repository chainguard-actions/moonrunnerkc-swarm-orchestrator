"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const types_1 = require("../../src/session/types");
describe('session/types', () => {
    it('emptyUsage zeroes every field', () => {
        const u = (0, types_1.emptyUsage)();
        assert_1.strict.equal(u.inputTokens, 0);
        assert_1.strict.equal(u.cacheReadTokens, 0);
        assert_1.strict.equal(u.cacheCreationTokens, 0);
        assert_1.strict.equal(u.outputTokens, 0);
    });
    it('addUsage is component-wise', () => {
        const a = { inputTokens: 1, cacheReadTokens: 2, cacheCreationTokens: 3, outputTokens: 4 };
        const b = { inputTokens: 10, cacheReadTokens: 20, cacheCreationTokens: 30, outputTokens: 40 };
        const sum = (0, types_1.addUsage)(a, b);
        assert_1.strict.deepEqual(sum, {
            inputTokens: 11,
            cacheReadTokens: 22,
            cacheCreationTokens: 33,
            outputTokens: 44,
        });
    });
    it('effectiveInputTokens applies Anthropic multipliers', () => {
        const u = { inputTokens: 100, cacheReadTokens: 1000, cacheCreationTokens: 100, outputTokens: 0 };
        const expected = 100 + 1000 * types_1.CACHE_READ_MULTIPLIER + 100 * types_1.CACHE_WRITE_MULTIPLIER;
        assert_1.strict.equal((0, types_1.effectiveInputTokens)(u), expected);
        // Sanity-check the multipliers themselves: read 0.1x, write 1.25x.
        assert_1.strict.equal(types_1.CACHE_READ_MULTIPLIER, 0.1);
        assert_1.strict.equal(types_1.CACHE_WRITE_MULTIPLIER, 1.25);
    });
    it('effectiveInputTokens math beats v6 on a cache-heavy workload', () => {
        // v6 model: 8 calls, each pays 10K input fresh. Effective = 80K.
        const v6 = (0, types_1.effectiveInputTokens)({
            inputTokens: 80000,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 0,
        });
        // v8 model: 1 call writes 10K to cache; 7 subsequent calls each read 10K.
        const v8 = (0, types_1.effectiveInputTokens)({
            inputTokens: 0,
            cacheReadTokens: 70000,
            cacheCreationTokens: 10000,
            outputTokens: 0,
        });
        assert_1.strict.equal(v6, 80000);
        // 70000*0.1 + 10000*1.25 = 7000 + 12500 = 19500
        assert_1.strict.equal(v8, 19500);
        // Ratio: 19500/80000 = 0.24375 ⇒ ~75.6% reduction. Well past the 30%
        // floor §5 mandates for Phase 2.
        assert_1.strict.ok(v8 / v6 < 0.7);
    });
    it('cacheHitRate is reads / total_input_side', () => {
        assert_1.strict.equal((0, types_1.cacheHitRate)({ inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0, outputTokens: 0 }), 0.9);
        assert_1.strict.equal((0, types_1.cacheHitRate)({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0 }), 0);
    });
});
