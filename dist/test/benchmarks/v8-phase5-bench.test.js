"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const deterministic_goals_1 = require("../../scripts/v8-bench/deterministic-goals");
const run_deterministic_1 = require("../../scripts/v8-bench/run-deterministic");
describe('v8 phase-5 bench: deterministic-goal shape', () => {
    it('declares ≥3 goals with consistent expectedDeterministic counts', () => {
        (0, deterministic_goals_1.assertDeterministicGoalsShape)();
        assert_1.strict.ok(deterministic_goals_1.DETERMINISTIC_GOALS.length >= 3);
    });
});
describe('v8 phase-5 bench: §8 (a) — tagged obligations satisfied with zero LLM tokens', () => {
    it('every goal: tagged-count == deterministic-satisfied count and ledger has no candidates for those obligations', async function () {
        this.timeout(20000);
        for (const goal of deterministic_goals_1.DETERMINISTIC_GOALS) {
            const det = await (0, run_deterministic_1.runDeterministicGoal)(goal, {
                mode: 'single',
                deterministic: true,
            });
            assert_1.strict.equal(det.deterministicObligations, goal.expectedDeterministic, `${goal.id}: deterministic-satisfied=${det.deterministicObligations} but expected=${goal.expectedDeterministic}`);
            assert_1.strict.equal(det.failed, 0, `${goal.id} failed obligations`);
        }
    });
});
describe('v8 phase-5 bench: §8 (b) — deterministic configuration costs less', () => {
    it('deterministic effective input is strictly lower than baseline on every dominated goal', async function () {
        this.timeout(20000);
        for (const goal of deterministic_goals_1.DETERMINISTIC_GOALS) {
            if (goal.expectedDeterministic === 0)
                continue;
            const baseline = await (0, run_deterministic_1.runDeterministicGoal)(goal, {
                mode: 'single',
                deterministic: false,
            });
            const det = await (0, run_deterministic_1.runDeterministicGoal)(goal, {
                mode: 'single',
                deterministic: true,
            });
            assert_1.strict.ok(det.effectiveInput < baseline.effectiveInput, `${goal.id}: det effective-input (${det.effectiveInput.toFixed(0)}) must be strictly lower than baseline (${baseline.effectiveInput.toFixed(0)})`);
            assert_1.strict.ok(det.candidateRecordedCount < baseline.candidateRecordedCount, `${goal.id}: det candidate count (${det.candidateRecordedCount}) must be strictly lower than baseline (${baseline.candidateRecordedCount})`);
        }
    });
});
describe('v8 phase-5 bench: savings scale with the deterministic share', () => {
    it('a 5-boilerplate goal saves more candidates than a 3-boilerplate goal', async function () {
        this.timeout(20000);
        const small = deterministic_goals_1.DETERMINISTIC_GOALS.find((g) => g.id === 'boilerplate-3');
        const large = deterministic_goals_1.DETERMINISTIC_GOALS.find((g) => g.id === 'boilerplate-5');
        assert_1.strict.ok(small && large);
        if (!small || !large)
            return;
        const smallBase = await (0, run_deterministic_1.runDeterministicGoal)(small, { mode: 'single', deterministic: false });
        const smallDet = await (0, run_deterministic_1.runDeterministicGoal)(small, { mode: 'single', deterministic: true });
        const largeBase = await (0, run_deterministic_1.runDeterministicGoal)(large, { mode: 'single', deterministic: false });
        const largeDet = await (0, run_deterministic_1.runDeterministicGoal)(large, { mode: 'single', deterministic: true });
        const smallAvoided = smallBase.candidateRecordedCount - smallDet.candidateRecordedCount;
        const largeAvoided = largeBase.candidateRecordedCount - largeDet.candidateRecordedCount;
        assert_1.strict.ok(largeAvoided > smallAvoided, `expected larger goal to avoid more candidates: small=${smallAvoided}, large=${largeAvoided}`);
    });
});
