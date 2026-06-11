"use strict";
/**
 * Sequential falsification dispatcher.
 *
 * Phase 1 keeps the dispatcher minimal: one adapter at a time, in
 * registration order, no scheduling, no bandit. The `--falsifiers off`
 * feature flag short-circuits the dispatcher entirely so production runs
 * can disable falsification without removing adapter code from the tree.
 *
 * The dispatcher does not own time budgets, retries, or cost caps —
 * those flow in via `DispatcherOptions`. Future phases extend this
 * function additively (Phase 5 introduces bandit selection by replacing
 * the in-loop registry traversal); the public signature stays stable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchFalsifiers = dispatchFalsifiers;
/**
 * Run every registered adapter that handles `obligation.type` against the
 * obligation, sequentially. Returns immediately with `disabled: true` when
 * `options.falsifiers === 'off'`.
 */
async function dispatchFalsifiers(obligation, registry, options) {
    if (options.falsifiers === 'off') {
        return { disabled: true, calls: [] };
    }
    const adapters = registry.forObligation(obligation.type);
    const calls = [];
    let decision;
    let ordered = adapters;
    if (options.scheduler && adapters.length > 0) {
        decision = options.scheduler.order(adapters);
        const byName = new Map(adapters.map((a) => [a.name, a]));
        ordered = decision.order
            .map((n) => byName.get(n))
            .filter((a) => a !== undefined);
    }
    for (const adapter of ordered) {
        const cancel = options.shouldCancel?.() ?? null;
        if (cancel !== null) {
            const out = { disabled: false, calls, cancelled: cancel };
            if (decision)
                out.dispatchDecision = decision;
            return out;
        }
        const startMs = Date.now();
        const outcome = await adapter.falsify({
            patchSha: options.patchSha,
            obligation,
            contextRefs: options.contextRefs,
            timeBudgetMs: options.timeBudgetMs,
            workspaceRoot: options.workspaceRoot,
        });
        calls.push({
            adapterName: adapter.name,
            result: outcome.result,
            cost: outcome.cost,
        });
        if (options.scheduler) {
            options.scheduler.recordOutcome(adapter.name, {
                successful: outcome.result.kind === 'counter-example-input',
                costUsd: outcome.cost.dollarsApiEquivalent,
                latencyMs: Date.now() - startMs,
            });
        }
    }
    const result = { disabled: false, calls };
    if (decision)
        result.dispatchDecision = decision;
    return result;
}
