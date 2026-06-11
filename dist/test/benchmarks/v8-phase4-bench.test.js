"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const repeated_pattern_goals_1 = require("../../scripts/v8-bench/repeated-pattern-goals");
const run_repeated_pattern_1 = require("../../scripts/v8-bench/run-repeated-pattern");
describe('v8 phase-4 bench: repeated-pattern shape', () => {
    it('declares 3 goals with the right repeated counts', () => {
        (0, repeated_pattern_goals_1.assertRepeatedPatternGoalsShape)();
        assert_1.strict.equal(repeated_pattern_goals_1.REPEATED_PATTERN_GOALS.length, 3);
        assert_1.strict.deepEqual(repeated_pattern_goals_1.REPEATED_PATTERN_GOALS.map((g) => g.repeatedCount).sort(), [3, 4, 6]);
    });
});
describe('v8 phase-4 bench: memoization saves verifier calls (§7 exit (b))', () => {
    it('memoized run saves strictly more verifier calls than baseline on every goal', async function () {
        this.timeout(15000);
        for (const goal of repeated_pattern_goals_1.REPEATED_PATTERN_GOALS) {
            const baseline = await (0, run_repeated_pattern_1.runRepeatedGoal)(goal, {
                mode: 'tournament',
                memoization: false,
                tournamentCandidates: 3,
            });
            const memoized = await (0, run_repeated_pattern_1.runRepeatedGoal)(goal, {
                mode: 'tournament',
                memoization: true,
                tournamentCandidates: 3,
            });
            assert_1.strict.equal(memoized.satisfied, goal.obligations.length, `${goal.id} memoized run satisfies all obligations`);
            assert_1.strict.ok(memoized.verifierCallsSavedByMemoization > baseline.verifierCallsSavedByMemoization, `${goal.id}: memoized saves (${memoized.verifierCallsSavedByMemoization}) must exceed baseline saves (${baseline.verifierCallsSavedByMemoization})`);
            assert_1.strict.ok(memoized.effectiveInput < baseline.effectiveInput, `${goal.id}: memoized effective-input (${memoized.effectiveInput.toFixed(0)}) must be strictly lower than baseline (${baseline.effectiveInput.toFixed(0)})`);
        }
    });
});
describe('v8 phase-4 bench: savings scale with the repetition count', () => {
    it('a 6-service contract saves more verifier calls than a 3-service one', async function () {
        this.timeout(15000);
        const small = repeated_pattern_goals_1.REPEATED_PATTERN_GOALS.find((g) => g.id === 'health-checks-3');
        const large = repeated_pattern_goals_1.REPEATED_PATTERN_GOALS.find((g) => g.id === 'health-checks-6');
        assert_1.strict.ok(small && large);
        if (!small || !large)
            return;
        const smallRun = await (0, run_repeated_pattern_1.runRepeatedGoal)(small, {
            mode: 'tournament',
            memoization: true,
            tournamentCandidates: 3,
        });
        const largeRun = await (0, run_repeated_pattern_1.runRepeatedGoal)(large, {
            mode: 'tournament',
            memoization: true,
            tournamentCandidates: 3,
        });
        assert_1.strict.ok(largeRun.verifierCallsSavedByMemoization > smallRun.verifierCallsSavedByMemoization, `large savings (${largeRun.verifierCallsSavedByMemoization}) must exceed small (${smallRun.verifierCallsSavedByMemoization})`);
    });
});
