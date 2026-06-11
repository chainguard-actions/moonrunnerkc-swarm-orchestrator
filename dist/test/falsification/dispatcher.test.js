"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const adapters_1 = require("../../src/falsification/adapters");
const dispatcher_1 = require("../../src/falsification/dispatcher");
/**
 * Tests for the sequential falsification dispatcher. The dispatcher's
 * job is small but load-bearing: honor `--falsifiers off`, walk the
 * registry in order, propagate adapter results without mutation.
 */
function counterExampleAdapter(name) {
    return {
        name,
        handles: ['property-must-hold'],
        async falsify(input) {
            return {
                result: {
                    kind: 'counter-example-input',
                    obligationType: input.obligation.type,
                    inputs: [
                        {
                            files: [{ relPath: `${name}.txt`, bytes: 'x' }],
                            reproducer: 'true',
                            reproducerOutput: '',
                            reproducerExitCode: 1,
                        },
                    ],
                },
                cost: {
                    adapterName: name,
                    obligationType: input.obligation.type,
                    wallClockMs: 1,
                    dollarsSpent: 0.001,
                    dollarsBilled: 0.001,
                    dollarsTokenEstimate: 0.001,
                    dollarsApiEquivalent: 0.001,
                    authMethod: 'api',
                    counterExamplesFound: 1,
                    falsePositives: 0,
                },
            };
        },
    };
}
const obligation = {
    type: 'property-must-hold',
    predicate: 'true',
    target: 'unit',
};
describe('dispatchFalsifiers', () => {
    it('returns disabled outcome when --falsifiers off', async () => {
        const registry = new adapters_1.AdapterRegistry();
        registry.register(counterExampleAdapter('a'));
        const outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, {
            falsifiers: 'off',
            timeBudgetMs: 1000,
            workspaceRoot: '/tmp/unused',
            contextRefs: [],
            patchSha: 'deadbeef',
        });
        assert_1.strict.equal(outcome.disabled, true);
        assert_1.strict.equal(outcome.calls.length, 0);
    });
    it('runs every matching adapter in registration order', async () => {
        const registry = new adapters_1.AdapterRegistry();
        registry.register(counterExampleAdapter('first'));
        registry.register(counterExampleAdapter('second'));
        const outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, {
            falsifiers: 'on',
            timeBudgetMs: 1000,
            workspaceRoot: '/tmp/unused',
            contextRefs: [],
            patchSha: 'deadbeef',
        });
        assert_1.strict.equal(outcome.disabled, false);
        assert_1.strict.equal(outcome.calls.length, 2);
        assert_1.strict.equal(outcome.calls[0]?.adapterName, 'first');
        assert_1.strict.equal(outcome.calls[1]?.adapterName, 'second');
    });
    it('skips adapters that do not handle the obligation type', async () => {
        const onlyTestObligation = {
            name: 'only-test',
            handles: ['test-must-pass'],
            async falsify() {
                throw new Error('should not be invoked for property-must-hold');
            },
        };
        const registry = new adapters_1.AdapterRegistry();
        registry.register(onlyTestObligation);
        registry.register(counterExampleAdapter('matches'));
        const outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, {
            falsifiers: 'on',
            timeBudgetMs: 1000,
            workspaceRoot: '/tmp/unused',
            contextRefs: [],
            patchSha: 'deadbeef',
        });
        assert_1.strict.equal(outcome.calls.length, 1);
        assert_1.strict.equal(outcome.calls[0]?.adapterName, 'matches');
    });
    it('with scheduler: orders adapters via scheduler and records the decision', async () => {
        const { FalsifierScheduler } = require('../../src/falsification/scheduler');
        const registry = new adapters_1.AdapterRegistry();
        registry.register(counterExampleAdapter('a'));
        registry.register(counterExampleAdapter('b'));
        const sched = new FalsifierScheduler({ kind: 'ucb1', statsPath: null });
        // Seed scheduler so 'b' has a clearly higher reward than 'a'.
        for (let i = 0; i < 5; i += 1)
            sched.recordOutcome('a', { successful: false, costUsd: 1, latencyMs: 100 });
        for (let i = 0; i < 5; i += 1)
            sched.recordOutcome('b', { successful: true, costUsd: 0.01, latencyMs: 100 });
        const outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, {
            falsifiers: 'on',
            timeBudgetMs: 1000,
            workspaceRoot: '/tmp/unused',
            contextRefs: [],
            patchSha: 'deadbeef',
            scheduler: sched,
        });
        assert_1.strict.equal(outcome.calls.length, 2);
        assert_1.strict.equal(outcome.calls[0]?.adapterName, 'b');
        assert_1.strict.equal(outcome.calls[1]?.adapterName, 'a');
        assert_1.strict.ok(outcome.dispatchDecision);
        assert_1.strict.equal(outcome.dispatchDecision?.kind, 'ucb1');
        assert_1.strict.deepEqual(outcome.dispatchDecision?.order, ['b', 'a']);
    });
    it('with shouldCancel: bails after current adapter when signal flips', async () => {
        const registry = new adapters_1.AdapterRegistry();
        registry.register(counterExampleAdapter('a'));
        registry.register(counterExampleAdapter('b'));
        let calls = 0;
        const outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, {
            falsifiers: 'on',
            timeBudgetMs: 1000,
            workspaceRoot: '/tmp/unused',
            contextRefs: [],
            patchSha: 'deadbeef',
            shouldCancel: () => {
                calls += 1;
                // Allow first adapter, cancel before second.
                return calls > 1 ? 'cost-cap exceeded' : null;
            },
        });
        assert_1.strict.equal(outcome.calls.length, 1);
        assert_1.strict.equal(outcome.cancelled, 'cost-cap exceeded');
    });
});
