"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attemptApplyAndVerify = attemptApplyAndVerify;
const diff_applier_1 = require("./diff-applier");
const diff_snapshot_1 = require("./diff-snapshot");
const rollback_1 = require("./rollback");
const unified_diff_1 = require("./unified-diff");
const whole_file_apply_1 = require("./whole-file-apply");
const run_verifier_1 = require("../verification/run-verifier");
const test_framework_misuse_1 = require("./test-framework-misuse");
async function attemptApplyAndVerify(args) {
    const { obligation, obligationIndex, responseText, repoRoot, ledger, runId, fileMustExistPaths, commandTimeoutMs, renderContext, trigger, } = args;
    // applyDetail surfaces *why* a persona's response did or didn't change
    // the workspace. Without this trace, a downstream verifier failure
    // ("predicate exited 1") gives no signal whether the persona emitted
    // an unapplyable diff, declared no-op, or simply produced prose.
    // applyOk is true when the applier produced its intended on-disk
    // outcome (file-emit landed, diff applied, or persona legitimately
    // declared no-op); false on parse/apply errors or unrecognized
    // responses. Single-mode uses applyOk to decide whether to prefix the
    // verifier detail with applyDetail in the composite failure message.
    let applyDetail;
    let applyOk = false;
    let applied = false;
    const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repoRoot, runId, obligation, obligationIndex, responseText);
    if (obligation.type === 'file-must-exist') {
        const r = (0, diff_applier_1.applyFileEmit)(repoRoot, obligation.path, responseText);
        applied = true;
        applyOk = true;
        applyDetail = r.detail;
    }
    else if (responseText.trim() === 'no-op' || responseText.trim() === '"no-op"') {
        applyDetail = 'no-op declared';
        applyOk = true;
    }
    else if ((0, whole_file_apply_1.looksLikeWholeFileResponse)(responseText)) {
        // Whole-file replacement path: persona emits one or more
        // `<<<FILE <path> ... FILE>>>` blocks with the full new contents.
        // protectedPaths is intentionally NOT passed: in the whole-file
        // flow the persona is shown the current file body via the
        // file-context injector and asked to write the FULL new contents
        // (additive, not stomping).
        try {
            const result = (0, whole_file_apply_1.applyWholeFileResponse)(repoRoot, responseText);
            if (result.applied) {
                applied = true;
                applyOk = true;
                applyDetail = result.detail;
            }
            else {
                applyDetail = `whole-file write did not apply: ${result.detail}`;
            }
        }
        catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            applyDetail = `whole-file parse/apply error: ${message}`;
            applied = true;
        }
    }
    else if ((0, unified_diff_1.looksLikeUnifiedDiff)(responseText)) {
        try {
            const result = (0, unified_diff_1.applyUnifiedDiff)(repoRoot, responseText, {
                protectedPaths: fileMustExistPaths,
            });
            if (result.applied) {
                applied = true;
                applyOk = true;
                applyDetail = result.detail;
            }
            else {
                applyDetail = `unified diff did not apply: ${result.detail}`;
            }
        }
        catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            applyDetail = `unified diff parse/apply error: ${message}`;
            // A throw mid-application means an earlier hunk may have already
            // landed on disk before the failing hunk's context mismatch was
            // detected. Treat as "may have mutated" — fires the rollback
            // below, which is idempotent (no-op if pre==current).
            applied = true;
        }
    }
    else {
        applyDetail =
            'persona response is neither a unified diff nor "no-op" — ' +
                'workspace left unchanged. Response head: ' +
                responseText.trim().slice(0, 120).replace(/\s+/g, ' ');
    }
    if (pre) {
        const files = (0, diff_snapshot_1.computePostApplyShas)(repoRoot, pre);
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex,
            files,
        });
    }
    const verifyOpts = { repoRoot };
    if (commandTimeoutMs !== undefined)
        verifyOpts.commandTimeoutMs = commandTimeoutMs;
    let verifyResult = (0, run_verifier_1.verifyObligation)(obligation, verifyOpts);
    // Defense-in-depth: a test file written with the wrong framework's
    // API passes file-must-exist but breaks build/test downstream. Promote
    // that misalignment into a precise, persona-attributable failure here.
    if (verifyResult.satisfied &&
        obligation.type === 'file-must-exist' &&
        renderContext.testFramework &&
        (0, test_framework_misuse_1.isTestFilePath)(obligation.path)) {
        const misuse = (0, test_framework_misuse_1.detectTestFrameworkMisuse)(repoRoot, obligation.path, renderContext.testFramework);
        if (misuse)
            verifyResult = { satisfied: false, detail: misuse };
    }
    const shouldRollback = !verifyResult.satisfied && pre !== null && (trigger === 'per-obligation-falsification'
        ? true
        : applied && obligation.type !== 'file-must-exist');
    if (shouldRollback) {
        const rb = await (0, rollback_1.rollbackObligation)(obligationIndex, ledger, repoRoot, runId, trigger);
        ledger.append({
            type: 'obligation-rolled-back',
            obligationIndex,
            trigger,
            success: rb.success,
            restoredFiles: rb.restoredFiles,
            detail: rb.success
                ? trigger === 'per-obligation-failed-apply'
                    ? `rolled back ${rb.restoredFiles.length} file(s) after failed apply (workspace restored to pre-attempt state)`
                    : `rolled back ${rb.restoredFiles.length} file(s) after tournament winner failed verification`
                : `rollback failed: ${rb.failure?.detail ?? 'unknown'}`,
        });
        if (!rb.success && rb.failure?.kind !== 'no-snapshot-found') {
            throw new Error(`${trigger} rollback failed for obligation ${obligationIndex}: ${rb.failure?.detail ?? 'unknown'}`);
        }
    }
    return {
        satisfied: verifyResult.satisfied,
        applyDetail,
        verifyDetail: verifyResult.detail,
        applyOk,
        applied,
        pre,
    };
}
