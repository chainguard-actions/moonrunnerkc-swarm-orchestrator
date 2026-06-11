"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const streaming_goals_1 = require("../../scripts/v8-bench/streaming-goals");
const run_streaming_1 = require("../../scripts/v8-bench/run-streaming");
describe('v8 Phase 6 streaming-verification benchmark gate', function () {
    this.timeout(30_000);
    it('declares >=4 goals with at least 3 doomed variants (shape gate)', () => {
        (0, streaming_goals_1.assertStreamingGoalsShape)();
        assert_1.strict.ok(streaming_goals_1.STREAMING_GOALS.length >= 4);
        const doomed = streaming_goals_1.STREAMING_GOALS.filter((g) => g.doomed).length;
        assert_1.strict.ok(doomed >= 3, `expected >=3 doomed goals, got ${doomed}`);
    });
    it('every doomed goal aborts mid-generation under streaming (§9 (a))', async () => {
        for (const g of streaming_goals_1.STREAMING_GOALS.filter((g) => g.doomed)) {
            const r = await (0, run_streaming_1.runStreamingGoal)(g, { streaming: true });
            assert_1.strict.ok(r.streamingAbortedCandidates > 0, `${g.id}: expected streaming abort, got streamingAbortedCandidates=${r.streamingAbortedCandidates}`);
            assert_1.strict.ok(r.candidateStreamAbortedCount > 0, `${g.id}: expected at least one candidate-stream-aborted ledger entry`);
        }
    });
    it('streaming output tokens strictly lower than non-streaming baseline on doomed goals (§9 (b))', async () => {
        for (const g of streaming_goals_1.STREAMING_GOALS.filter((g) => g.doomed)) {
            const baseline = await (0, run_streaming_1.runStreamingGoal)(g, { streaming: false });
            const streaming = await (0, run_streaming_1.runStreamingGoal)(g, { streaming: true });
            assert_1.strict.ok(streaming.totalUsage.outputTokens < baseline.totalUsage.outputTokens, `${g.id}: expected streaming output (${streaming.totalUsage.outputTokens}) < baseline (${baseline.totalUsage.outputTokens})`);
        }
    });
    it('clean goals never produce a false abort', async () => {
        for (const g of streaming_goals_1.STREAMING_GOALS.filter((g) => !g.doomed)) {
            const r = await (0, run_streaming_1.runStreamingGoal)(g, { streaming: true });
            assert_1.strict.equal(r.streamingAbortedCandidates, 0, `${g.id}: streaming flagged a clean goal as doomed`);
        }
    });
    it('savings scale with response length on doomed goals', async () => {
        const small = streaming_goals_1.STREAMING_GOALS.find((g) => g.id === 'doomed-small');
        const large = streaming_goals_1.STREAMING_GOALS.find((g) => g.id === 'doomed-large');
        assert_1.strict.ok(small && large);
        if (!small || !large)
            return;
        const smallBase = await (0, run_streaming_1.runStreamingGoal)(small, { streaming: false });
        const smallStream = await (0, run_streaming_1.runStreamingGoal)(small, { streaming: true });
        const largeBase = await (0, run_streaming_1.runStreamingGoal)(large, { streaming: false });
        const largeStream = await (0, run_streaming_1.runStreamingGoal)(large, { streaming: true });
        const smallSaved = smallBase.totalUsage.outputTokens - smallStream.totalUsage.outputTokens;
        const largeSaved = largeBase.totalUsage.outputTokens - largeStream.totalUsage.outputTokens;
        assert_1.strict.ok(largeSaved > smallSaved, `expected larger response to save more tokens: large=${largeSaved} small=${smallSaved}`);
    });
});
