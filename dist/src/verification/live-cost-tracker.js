"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveCostTracker = exports.COST_CAP_ABORT_REASON = void 0;
const types_1 = require("../session/types");
const token_estimator_1 = require("../session/token-estimator");
exports.COST_CAP_ABORT_REASON = 'cost-cap exceeded';
// One instance per run. Observers built by `observerForStream()` route
// into the same accounting state so concurrent tournament candidates
// each contribute their in-flight output to a single ceiling. The
// ceiling is denominated in output tokens — every provider's session
// contract reports tokens uniformly, so the gate is provider-agnostic.
class LiveCostTracker {
    budgetTokens;
    committed = (0, types_1.emptyUsage)();
    inFlight = new Map();
    nextStreamId = 0;
    lastAbort = null;
    constructor(opts) {
        this.budgetTokens = opts.budgetTokens;
        if (opts.baseline)
            this.committed = { ...opts.baseline };
    }
    hasBudget() { return this.budgetTokens !== null; }
    budget() { return this.budgetTokens; }
    committedTokens() { return this.committed.outputTokens; }
    projectedTokens() {
        let proj = this.committed.outputTokens;
        for (const tokens of this.inFlight.values())
            proj += tokens;
        return proj;
    }
    isOverBudget() {
        return this.budgetTokens !== null && this.projectedTokens() >= this.budgetTokens;
    }
    isCancelled() { return this.isOverBudget(); }
    lastAbortInfo() {
        return this.lastAbort ? { ...this.lastAbort } : null;
    }
    commitUsage(usage) {
        this.committed = (0, types_1.addUsage)(this.committed, usage);
    }
    observerForStream(inner) {
        const id = this.nextStreamId++;
        this.inFlight.set(id, 0);
        const observer = (event) => {
            const tokens = (0, token_estimator_1.estimateTokens)(event.partialText);
            this.inFlight.set(id, tokens);
            if (this.budgetTokens !== null) {
                const projected = this.projectedTokens();
                if (projected >= this.budgetTokens) {
                    this.lastAbort = {
                        budgetTokens: this.budgetTokens,
                        projectedTokens: projected,
                        committedTokens: this.committed.outputTokens,
                        inFlightTokens: tokens,
                        ts: new Date().toISOString(),
                    };
                    return { kind: 'abort', reason: exports.COST_CAP_ABORT_REASON };
                }
            }
            return inner ? inner(event) : { kind: 'continue' };
        };
        const finalize = (usage) => {
            this.inFlight.delete(id);
            if (usage)
                this.commitUsage(usage);
        };
        return { observer, finalize };
    }
    snapshot() {
        return {
            committedTokens: this.committed.outputTokens,
            projectedTokens: this.projectedTokens(),
            budgetTokens: this.budgetTokens,
        };
    }
}
exports.LiveCostTracker = LiveCostTracker;
