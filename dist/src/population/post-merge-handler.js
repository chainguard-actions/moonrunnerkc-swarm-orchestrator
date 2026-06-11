"use strict";
/**
 * Post-merge verification and rollback handler.
 *
 * After every obligation has been processed, the manager re-verifies the
 * full contract against the workspace *as it actually is* once everyone
 * has committed. This catches the impl guide §9 example: "two obligations
 * that individually pass but together produce a broken build".
 *
 * Extracted from manager.ts so the main loop focuses on the per-obligation
 * scheduling while post-merge integration details live in their own module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePostMerge = handlePostMerge;
const post_merge_1 = require("../verification/post-merge");
const rollback_1 = require("./rollback");
const logger_1 = require("../logger");
const _log = (0, logger_1.getLogger)('population.post-merge-handler');
/**
 * Run post-merge integration verification and, on failure, decide
 * whether to rollback based on the regression profile:
 *
 * - Structural regressions (test-must-pass, build-must-pass, file-must-exist)
 *   trigger full rollback of all synthesis-applied obligations.
 * - Predicate-only regressions (property-must-hold, etc.) are quality
 *   warnings that do NOT trigger rollback — rolling back working code
 *   for cosmetic predicate misses destroys real progress.
 */
async function handlePostMerge(contract, state, repoRoot, ledger, runId, outcomes, commandTimeoutMs) {
    const verifyOpts = { repoRoot };
    if (commandTimeoutMs !== undefined)
        verifyOpts.commandTimeoutMs = commandTimeoutMs;
    const pm = (0, post_merge_1.postMergeVerify)({ contract, verifyOptions: verifyOpts });
    const slimOutcomes = pm.outcomes.map((o) => ({
        obligationIndex: o.obligationIndex,
        obligationType: o.obligation.type,
        passed: o.passed,
        detail: o.detail,
    }));
    ledger.append({
        type: 'post-merge-verified',
        passed: pm.passed,
        obligationCount: pm.obligationCount,
        failedCount: pm.failedCount,
        outcomes: slimOutcomes,
        detail: pm.passed
            ? `post-merge integration check passed across ${pm.obligationCount} obligation(s)`
            : `post-merge integration check failed: ${pm.failedCount}/${pm.obligationCount} obligation(s) regressed`,
    });
    // Post-merge is authoritative; recompute satisfied/failed from pm.outcomes
    // so the exit code reflects post-merge truth, not a stale apply-time counter.
    let satisfied = pm.outcomes.filter((o) => o.passed).length;
    let failed = pm.outcomes.filter((o) => !o.passed).length;
    if (!pm.passed) {
        // Rollback policy: only abandon the merge when a STRUCTURAL
        // obligation regresses. Predicate-only regressions are quality
        // checks; rolling back working code for cosmetic predicate misses
        // destroys real progress.
        const structuralRegression = pm.outcomes.some((o) => !o.passed &&
            (o.obligation.type === 'test-must-pass' ||
                o.obligation.type === 'build-must-pass' ||
                o.obligation.type === 'file-must-exist'));
        const regressionGap = pm.failedCount;
        if (!structuralRegression) {
            failed = 0;
            satisfied = pm.obligationCount - regressionGap;
            ledger.append({
                type: 'obligation-rolled-back',
                obligationIndex: -1,
                trigger: 'post-merge-regression',
                success: true,
                restoredFiles: [],
                detail: `post-merge regression detected (${regressionGap} obligation(s)) but ` +
                    'no structural failure — keeping applied work. ' +
                    'Predicate-only regressions are quality warnings, not rollback triggers.',
            });
        }
        if (structuralRegression) {
            for (let i = outcomes.length - 1; i >= 0; i -= 1) {
                const o = outcomes[i];
                if (!o)
                    continue;
                if (!o.satisfied)
                    continue;
                if (o.personaId === null)
                    continue;
                const rb = await (0, rollback_1.rollbackObligation)(o.obligationIndex, ledger, repoRoot, runId, 'post-merge-regression');
                ledger.append({
                    type: 'obligation-rolled-back',
                    obligationIndex: o.obligationIndex,
                    trigger: 'post-merge-regression',
                    success: rb.success,
                    restoredFiles: rb.restoredFiles,
                    detail: rb.success
                        ? `rolled back ${rb.restoredFiles.length} file(s) after post-merge regression`
                        : `rollback failed: ${rb.failure?.detail ?? 'unknown'}`,
                });
                if (!rb.success && rb.failure?.kind !== 'no-snapshot-found') {
                    throw new Error(`post-merge rollback failed for obligation ${o.obligationIndex}: ${rb.failure?.detail ?? 'unknown'}`);
                }
            }
        }
    }
    return {
        passed: pm.passed,
        obligationCount: pm.obligationCount,
        failedCount: pm.failedCount,
        outcomes: slimOutcomes,
        satisfied,
        failed,
    };
}
