"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const goals_1 = require("../../scripts/v8-bench/goals");
const run_goal_1 = require("../../scripts/v8-bench/run-goal");
const tricky_goals_1 = require("../../scripts/v8-bench/tricky-goals");
const run_tricky_goal_1 = require("../../scripts/v8-bench/run-tricky-goal");
const aggregate_1 = require("../../scripts/v8-bench/aggregate");
describe('v8 phase-3 bench: tricky-suite shape', () => {
    it('tricky suite passes its shape assertion', () => {
        (0, tricky_goals_1.assertTrickyGoalsShape)();
        assert_1.strict.equal(tricky_goals_1.TRICKY_BENCH_GOALS.length >= 3, true);
    });
});
describe('v8 phase-3 bench: tournament accuracy lift on tricky obligations', () => {
    it('tournament mode satisfies at least as many obligations as single mode on every tricky goal', async function () {
        this.timeout(30_000);
        const rows = [];
        for (const goal of tricky_goals_1.TRICKY_BENCH_GOALS) {
            const single = await (0, run_tricky_goal_1.runTrickyGoal)(goal, { mode: 'single' });
            const tournament = await (0, run_tricky_goal_1.runTrickyGoal)(goal, {
                mode: 'tournament',
                tournamentCandidates: 3,
            });
            const costMultiplier = single.v8EffectiveInput === 0
                ? 0
                : tournament.v8EffectiveInput / single.v8EffectiveInput;
            rows.push({
                goalId: goal.id,
                size: goal.size,
                obligationCount: goal.obligations.length,
                single,
                tournament,
                costMultiplier,
            });
        }
        const summary = (0, aggregate_1.summarizeModeComparison)(rows);
        // §6 (a) hard gate: tournament must not regress and must improve at
        // least one tricky goal strictly.
        assert_1.strict.equal(summary.noPassRateRegression, true, `tournament pass rate ${summary.tournamentPassRate} < single ${summary.singlePassRate}`);
        const strictImprovements = rows.filter((r) => r.tournament.satisfied > r.single.satisfied);
        assert_1.strict.ok(strictImprovements.length >= 1, 'expected at least one tricky goal where tournament strictly improves on single');
    });
});
describe('v8 phase-3 bench: tournament cost reporting on easy suite', () => {
    it('reports a measurable single-vs-tournament cost ratio across the easy suite', async function () {
        this.timeout(60_000);
        const rows = [];
        for (const goal of goals_1.BENCH_GOALS) {
            const single = await (0, run_goal_1.runBenchGoal)(goal, { mode: 'single' });
            const tournament = await (0, run_goal_1.runBenchGoal)(goal, {
                mode: 'tournament',
                tournamentCandidates: 3,
            });
            const costMultiplier = single.v8EffectiveInput === 0
                ? 0
                : tournament.v8EffectiveInput / single.v8EffectiveInput;
            rows.push({
                goalId: goal.id,
                size: goal.size,
                obligationCount: goal.obligations.length,
                single,
                tournament,
                costMultiplier,
            });
        }
        const summary = (0, aggregate_1.summarizeModeComparison)(rows);
        // No accuracy regression on the easy suite (both modes should pass).
        assert_1.strict.equal(summary.singlePassRate, 1.0);
        assert_1.strict.equal(summary.tournamentPassRate, 1.0);
        // Cost ratio is informational; expect tournament > single but bounded.
        assert_1.strict.ok(summary.costMultiplier > 1.0, 'tournament adds cost vs single');
        assert_1.strict.ok(summary.costMultiplier < 5.0, 'tournament cost ratio is bounded < 5×');
    });
});
