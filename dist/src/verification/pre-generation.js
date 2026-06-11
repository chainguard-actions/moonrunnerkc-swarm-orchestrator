"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preVerifyObligations = preVerifyObligations;
const run_verifier_1 = require("./run-verifier");
// Obligation types whose verification result depends on the integrated
// state of the workspace. Pre-verifying these while another synthesis
// obligation is still pending is unsound — the pending obligation can
// flip the global-state verifier's outcome, producing vacuous
// "pre-verified" entries that post-merge then has to revoke (May 2026
// eval failure: `node --test` exited 0 against an empty repo for a
// contract that required a test file be added).
//
// Local-state obligation types (file-must-exist,
// function-must-have-signature, import-graph-must-satisfy) are pure
// functions of files already on disk, so pending obligations can't
// invalidate them.
const GLOBAL_STATE_OBLIGATION_TYPES = new Set([
    'build-must-pass',
    'test-must-pass',
    'property-must-hold',
    'coverage-must-exceed',
    'performance-must-not-regress',
]);
// Soundness rule: a global-state obligation is only pre-verified when
// **no other** non-excluded local-state obligation remains pending. The
// partition below scans obligations once into local-state and
// global-state buckets; pass 1 evaluates local-state unconditionally,
// pass 2 evaluates global-state only when every local-state index is
// satisfied (by pass 1 or the manager's pre-passes).
function preVerifyObligations(options) {
    const skip = options.skipIndexes ?? new Set();
    const checks = [];
    const satisfied = new Set();
    const localIndexes = [];
    const globalIndexes = [];
    for (let i = 0; i < options.obligations.length; i += 1) {
        const o = options.obligations[i];
        if (!o)
            continue;
        if (skip.has(i))
            continue;
        if (GLOBAL_STATE_OBLIGATION_TYPES.has(o.type))
            globalIndexes.push(i);
        else
            localIndexes.push(i);
    }
    const runCheck = (i) => {
        const o = options.obligations[i];
        if (!o)
            return;
        const result = (0, run_verifier_1.verifyObligation)(o, options.verifyOptions);
        checks.push({
            obligationIndex: i,
            obligation: o,
            satisfied: result.satisfied,
            detail: result.detail,
        });
        if (result.satisfied)
            satisfied.add(i);
    };
    for (const i of localIndexes)
        runCheck(i);
    // If any local-state obligation is still pending after pass 1, the
    // global-state verifier's outcome is not stable; defer.
    const allLocalSatisfied = localIndexes.every((i) => satisfied.has(i));
    if (allLocalSatisfied) {
        for (const i of globalIndexes)
            runCheck(i);
    }
    return { checks, satisfiedIndexes: satisfied };
}
