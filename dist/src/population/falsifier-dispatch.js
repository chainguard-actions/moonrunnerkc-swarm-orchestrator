"use strict";
/**
 * Falsifier dispatch for a single obligation.
 *
 * Extracted from manager.ts so the manager's main loop stays focused on
 * scheduling while falsification details (adapter dispatch, dispatcher
 * error capture, counter-example recording) live in their own module.
 * Adapter throws are caught and recorded as failed dispatch entries:
 * an adapter going sideways must not crash the run, the producer's
 * verifier has already approved the patch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchFalsifiersForObligation = dispatchFalsifiersForObligation;
const dispatcher_1 = require("../falsification/dispatcher");
const live_cost_tracker_1 = require("../verification/live-cost-tracker");
const logger_1 = require("../logger");
const _log = (0, logger_1.getLogger)('population.falsifier-dispatch');
async function dispatchFalsifiersForObligation(obligationIndex, obligation, adapterRegistry, ledger, repoRoot, falsifiers, timeBudgetMs, scheduler, costTracker) {
    if (falsifiers === 'off' || adapterRegistry === undefined) {
        return { counterExample: false, detail: '' };
    }
    if (adapterRegistry.forObligation(obligation.type).length === 0) {
        return { counterExample: false, detail: '' };
    }
    let outcome;
    try {
        const dispatchOpts = {
            falsifiers,
            timeBudgetMs,
            workspaceRoot: repoRoot,
            contextRefs: [],
            patchSha: '',
        };
        if (scheduler)
            dispatchOpts.scheduler = scheduler;
        if (costTracker) {
            dispatchOpts.shouldCancel = () => costTracker.isCancelled() ? live_cost_tracker_1.COST_CAP_ABORT_REASON : null;
        }
        outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, adapterRegistry, dispatchOpts);
        if (scheduler)
            scheduler.flush();
        if (outcome.dispatchDecision) {
            ledger.append({
                type: 'falsifier-dispatch-decision',
                obligationIndex,
                obligationType: obligation.type,
                kind: outcome.dispatchDecision.kind,
                order: outcome.dispatchDecision.order.slice(),
                scores: outcome.dispatchDecision.scores.map((s) => ({
                    adapter: s.adapter,
                    score: Number.isFinite(s.score) ? s.score : null,
                })),
            });
        }
    }
    catch (err) {
        ledger.append({
            type: 'falsification-call',
            obligationIndex,
            obligationType: obligation.type,
            adapterName: '<dispatcher>',
            resultKind: 'dispatcher-error',
            counterExamplesFound: 0,
            wallClockMs: 0,
            dollarsBilled: 0,
            dollarsApiEquivalent: 0,
            detail: `falsifier dispatch threw: ${err.message.slice(0, 800)}`,
        });
        return { counterExample: false, detail: '' };
    }
    if (outcome.disabled)
        return { counterExample: false, detail: '' };
    let firstCounterExampleDetail = null;
    for (const call of outcome.calls) {
        let detail;
        if (call.result.kind === 'counter-example-input') {
            const inputs = call.result.inputs;
            const repro = inputs[0]?.reproducer ?? '<no reproducer>';
            detail =
                `${call.adapterName} found ${inputs.length} counter-example(s); ` +
                    `first reproducer: ${repro.slice(0, 200)}`;
            if (firstCounterExampleDetail === null)
                firstCounterExampleDetail = detail;
        }
        else if (call.result.kind === 'no-falsification-found') {
            detail = `${call.adapterName} found no falsification (${call.result.reason}, ${call.result.attempts} attempts)`;
        }
        else if (call.result.kind === 'regression-fixture') {
            detail = `${call.adapterName} produced regression fixture at ${call.result.fixturePath}`;
            if (firstCounterExampleDetail === null)
                firstCounterExampleDetail = detail;
        }
        else {
            detail = `${call.adapterName} produced property-violation trace (${call.result.steps.length} steps)`;
            if (firstCounterExampleDetail === null)
                firstCounterExampleDetail = detail;
        }
        ledger.append({
            type: 'falsification-call',
            obligationIndex,
            obligationType: obligation.type,
            adapterName: call.adapterName,
            resultKind: call.result.kind,
            counterExamplesFound: call.cost.counterExamplesFound,
            wallClockMs: call.cost.wallClockMs,
            dollarsBilled: call.cost.dollarsBilled,
            dollarsApiEquivalent: call.cost.dollarsApiEquivalent,
            detail,
        });
    }
    if (firstCounterExampleDetail !== null) {
        return { counterExample: true, detail: firstCounterExampleDetail };
    }
    return { counterExample: false, detail: '' };
}
