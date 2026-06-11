"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTestFilePath = exports.renderDynamicMessage = void 0;
exports.attemptApplyAndVerify = attemptApplyAndVerify;
exports.runPopulation = runPopulation;
exports.listPersonaIds = listPersonaIds;
exports.sha256 = sha256;
exports.providerAttribution = providerAttribution;
const crypto = __importStar(require("crypto"));
const memoization_1 = require("../ledger/memoization");
const dispatcher_1 = require("../falsification/dispatcher");
const predicates_1 = require("../persona/predicates");
const types_1 = require("../session/types");
const post_merge_1 = require("../verification/post-merge");
const pre_generation_1 = require("../verification/pre-generation");
const run_verifier_1 = require("../verification/run-verifier");
const streaming_verifier_1 = require("../verification/streaming-verifier");
const diff_applier_1 = require("./diff-applier");
const diff_snapshot_1 = require("./diff-snapshot");
const rollback_1 = require("./rollback");
const unified_diff_1 = require("./unified-diff");
const whole_file_apply_1 = require("./whole-file-apply");
const state_1 = require("./state");
const snapshot_cleanup_1 = require("./snapshot-cleanup");
const live_cost_tracker_1 = require("../verification/live-cost-tracker");
const logger_1 = require("../logger");
const persona_message_1 = require("./persona-message");
const test_framework_misuse_1 = require("./test-framework-misuse");
const tournament_driver_1 = require("./tournament-driver");
const log = (0, logger_1.getLogger)('population.manager');
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
async function runPopulation(options) {
    const start = Date.now();
    const { contract, repoRoot, registry, session, ledger, commandTimeoutMs } = options;
    const runId = options.runId ?? ledger.run();
    const cap = options.maxObligations ?? contract.obligations.length;
    // Paths owned by file-must-exist obligations. Subsequent personas must
    // not stomp on the architect's body via their unified diffs.
    const fileMustExistPaths = new Set(contract.obligations
        .filter((o) => o.type === 'file-must-exist')
        .map((o) => o.path));
    const mode = options.mode ?? 'single';
    const builder = new state_1.PopulationStateBuilder(contract.obligations);
    const skip = options.skipObligationIndexes ?? new Set();
    const memoStore = options.memoStore;
    const wasmRuntime = options.wasmRuntime;
    const strategyTimeoutMs = options.strategyTimeoutMs;
    const streamingConfig = options.streaming;
    const streamingAssertions = streamingConfig
        ? (0, streaming_verifier_1.buildAssertions)(streamingConfig)
        : [];
    const usingStreaming = streamingAssertions.length > 0;
    // §8: never retry a failed WASM strategy — once rerouted to synthesis,
    // the deterministic floor is out of the picture for that index.
    const deterministicTried = new Set();
    ledger.append({
        type: 'run-started',
        contractId: contract.manifest.contractId,
        contractHash: contract.manifest.contractHash,
        obligationCount: contract.obligations.length,
        goal: contract.manifest.goal,
    });
    let memoizedObligations = 0;
    for (let i = 0; i < contract.obligations.length; i += 1) {
        if (!skip.has(i))
            continue;
        const o = contract.obligations[i];
        if (!o)
            continue;
        builder.setStatus(i, 'satisfied');
        ledger.append({
            type: 'obligation-memoized',
            obligationIndex: i,
            obligationType: o.type,
            obligationKey: (0, memoization_1.obligationKey)(o),
            source: 'prior-run',
            responseSha256: null,
            detail: `obligation index ${i} satisfied by prior run; skipping synthesis`,
        });
        memoizedObligations += 1;
    }
    const outcomes = [];
    let totalUsage = (0, types_1.emptyUsage)();
    let verifierCallsSavedByMemoization = 0;
    let deterministicObligations = 0;
    let deterministicReroutes = 0;
    let preVerifiedObligations = 0;
    let streamingAbortedCandidates = 0;
    let streamingCharsBeforeAbort = 0;
    let attempted = 0;
    if (wasmRuntime) {
        for (let i = 0; i < contract.obligations.length; i += 1) {
            if (skip.has(i))
                continue;
            const o = contract.obligations[i];
            if (!o || !o.deterministicStrategy)
                continue;
            if (!wasmRuntime.has(o.deterministicStrategy))
                continue;
            if (deterministicTried.has(i))
                continue;
            const detOutcome = await dispatchDeterministic({
                obligation: o,
                obligationIndex: i,
                runtime: wasmRuntime,
                repoRoot,
                commandTimeoutMs,
                strategyTimeoutMs,
                ledger,
            });
            deterministicTried.add(i);
            if (detOutcome.satisfied) {
                builder.setStatus(i, 'satisfied');
                deterministicObligations += 1;
                outcomes.push({
                    obligationIndex: i,
                    obligation: o,
                    personaId: null,
                    satisfied: true,
                    detail: detOutcome.detail,
                    tournament: null,
                });
            }
            else {
                deterministicReroutes += 1;
            }
        }
    }
    // Order matters: pre-generation runs build/test commands, costlier
    // than memoization or the deterministic floor — only the obligations
    // that survived both cheap paths reach this pass.
    if (options.preGeneration) {
        const alreadyExcluded = new Set(skip);
        for (const o of outcomes)
            alreadyExcluded.add(o.obligationIndex);
        const verifyOpts = { repoRoot };
        if (commandTimeoutMs !== undefined)
            verifyOpts.commandTimeoutMs = commandTimeoutMs;
        const preResult = (0, pre_generation_1.preVerifyObligations)({
            obligations: contract.obligations,
            skipIndexes: alreadyExcluded,
            verifyOptions: verifyOpts,
        });
        for (const idx of preResult.satisfiedIndexes) {
            const o = contract.obligations[idx];
            if (!o)
                continue;
            builder.setStatus(idx, 'satisfied');
            const check = preResult.checks.find((c) => c.obligationIndex === idx);
            const detail = check?.detail ?? 'pre-generation check satisfied';
            ledger.append({
                type: 'obligation-pre-verified',
                obligationIndex: idx,
                obligationType: o.type,
                detail,
            });
            outcomes.push({
                obligationIndex: idx,
                obligation: o,
                personaId: null,
                satisfied: true,
                detail: `pre-verified: ${detail}`,
                tournament: null,
            });
            preVerifiedObligations += 1;
        }
    }
    while (attempted < cap) {
        const selection = (0, predicates_1.selectPersonaForState)(registry, builder.view());
        if (!selection)
            break;
        attempted += 1;
        const { persona, obligationIndex } = selection;
        const obligation = contract.obligations[obligationIndex];
        if (!obligation)
            break;
        builder.setStatus(obligationIndex, 'in-progress');
        ledger.append({
            type: 'obligation-attempted',
            obligationIndex,
            obligationType: obligation.type,
            personaId: persona.id,
        });
        const renderCtx = (0, persona_message_1.buildRenderContext)(obligation, repoRoot, contract.manifest, commandTimeoutMs);
        if (mode === 'tournament') {
            const result = await (0, tournament_driver_1.executeTournament)({
                obligation,
                obligationIndex,
                primaryPersona: persona,
                registry,
                session,
                ledger,
                repoRoot,
                commandTimeoutMs,
                tournamentConfig: options.tournamentConfig,
                memoStore,
                renderContext: renderCtx,
                fileMustExistPaths,
                runId,
                ...(usingStreaming ? { streamingAssertions } : {}),
                ...(options.costTracker !== undefined ? { costTracker: options.costTracker } : {}),
            });
            totalUsage = (0, types_1.addUsage)(totalUsage, result.tournament.usage);
            verifierCallsSavedByMemoization += result.tournament.verifierCallsSavedByMemoization;
            streamingAbortedCandidates += result.tournament.streamingAbortedCandidates;
            streamingCharsBeforeAbort += result.tournament.streamingCharsBeforeAbort;
            const winnerPersonaId = result.tournament.winner?.personaId ?? null;
            let tournamentSatisfied = result.satisfied;
            let tournamentDetail = result.detail;
            if (result.satisfied) {
                const falsified = await runFalsifiersForObligation({
                    obligation,
                    obligationIndex,
                    repoRoot,
                    ledger,
                    registry: options.adapterRegistry,
                    falsifiers: options.falsifiers ?? 'on',
                    timeBudgetMs: options.adapterTimeBudgetMs ?? 60_000,
                    ...(options.falsifierScheduler ? { scheduler: options.falsifierScheduler } : {}),
                    ...(options.costTracker ? { costTracker: options.costTracker } : {}),
                });
                if (falsified !== null) {
                    tournamentSatisfied = false;
                    tournamentDetail = falsified;
                    const rb = await (0, rollback_1.rollbackObligation)(obligationIndex, ledger, repoRoot, runId, 'per-obligation-falsification');
                    ledger.append({
                        type: 'obligation-rolled-back',
                        obligationIndex,
                        trigger: 'per-obligation-falsification',
                        success: rb.success,
                        restoredFiles: rb.restoredFiles,
                        detail: rb.success
                            ? `rolled back ${rb.restoredFiles.length} file(s) after falsification`
                            : `rollback failed: ${rb.failure?.detail ?? 'unknown'}`,
                    });
                    if (!rb.success && rb.failure?.kind !== 'no-snapshot-found') {
                        throw new Error(`rollback failed for obligation ${obligationIndex}: ${rb.failure?.detail ?? 'unknown'}`);
                    }
                }
            }
            if (tournamentSatisfied) {
                builder.setStatus(obligationIndex, 'satisfied');
                ledger.append({
                    type: 'obligation-satisfied',
                    obligationIndex,
                    obligationType: obligation.type,
                    detail: tournamentDetail,
                });
            }
            else {
                builder.setStatus(obligationIndex, 'failed');
                ledger.append({
                    type: 'obligation-failed',
                    obligationIndex,
                    obligationType: obligation.type,
                    detail: tournamentDetail,
                });
            }
            outcomes.push({
                obligationIndex,
                obligation,
                personaId: winnerPersonaId,
                satisfied: tournamentSatisfied,
                detail: tournamentDetail,
                tournament: result.tournament,
            });
            continue;
        }
        // Single mode: generate→apply→verify with reprompt-on-failure
        // feedback loop. Bounded at RETRY_MAX so a confused persona can't
        // burn the run's token budget. Streaming path takes the first
        // attempt and skips retry — the streaming verifier already aborts
        // early on forbidden imports, which is its own corrective signal.
        const dynamic = (0, persona_message_1.renderDynamicMessage)(obligation, repoRoot, renderCtx);
        const RETRY_MAX = 2;
        let retryFeedback = null;
        const buildRequest = () => ({
            personaId: persona.id,
            personaSystemSuffix: persona.systemSuffix,
            sampling: { ...persona.sampling },
            userMessage: retryFeedback === null ? dynamic : `${dynamic}\n\n${retryFeedback}`,
        });
        let responseText;
        let responseUsage;
        let responseModel;
        let streamingOutcome = null;
        if (usingStreaming) {
            streamingOutcome = await (0, streaming_verifier_1.runStreamingCompletion)(session, buildRequest(), obligation, streamingAssertions, options.costTracker);
            responseText = streamingOutcome.streamResult.response.text;
            responseUsage = streamingOutcome.streamResult.response.usage;
            responseModel = streamingOutcome.streamResult.response.model;
        }
        else {
            const response = await session.complete(buildRequest());
            responseText = response.text;
            responseUsage = response.usage;
            responseModel = response.model;
        }
        totalUsage = (0, types_1.addUsage)(totalUsage, responseUsage);
        if (streamingOutcome?.aborted) {
            streamingAbortedCandidates += 1;
            streamingCharsBeforeAbort += streamingOutcome.abortedAtChars;
            ledger.append({
                type: 'candidate-stream-aborted',
                obligationIndex,
                roundIndex: 0,
                candidateIndex: 0,
                personaId: persona.id,
                partialResponseSha256: sha256(responseText),
                abortedAtChars: streamingOutcome.abortedAtChars,
                reason: streamingOutcome.abortReason ?? 'streaming verifier aborted',
                usageAtAbort: responseUsage,
                model: responseModel,
                ...providerAttribution(session),
            });
            builder.setStatus(obligationIndex, 'failed');
            const failDetail = `streaming verifier aborted: ${streamingOutcome.abortReason ?? 'unspecified violation'}`;
            ledger.append({
                type: 'obligation-failed',
                obligationIndex,
                obligationType: obligation.type,
                detail: failDetail,
            });
            outcomes.push({
                obligationIndex,
                obligation,
                personaId: persona.id,
                satisfied: false,
                detail: failDetail,
                tournament: null,
            });
            continue;
        }
        let attempt = 0;
        let attemptResult;
        for (;;) {
            if (attempt > 0) {
                const response = await session.complete(buildRequest());
                responseText = response.text;
                responseUsage = response.usage;
                responseModel = response.model;
                totalUsage = (0, types_1.addUsage)(totalUsage, responseUsage);
            }
            ledger.append({
                type: 'candidate-recorded',
                obligationIndex,
                personaId: persona.id,
                responseSha256: sha256(responseText),
                usage: responseUsage,
                model: responseModel,
                ...providerAttribution(session),
            });
            attemptResult = await attemptApplyAndVerify({
                obligation,
                obligationIndex,
                responseText,
                repoRoot,
                ledger,
                runId,
                fileMustExistPaths,
                commandTimeoutMs,
                renderContext: renderCtx,
                trigger: 'per-obligation-failed-apply',
            });
            if (attemptResult.satisfied)
                break;
            if (attempt >= RETRY_MAX)
                break;
            const failureContext = attemptResult.applyOk
                ? attemptResult.verifyDetail
                : `${attemptResult.applyDetail}; verifier: ${attemptResult.verifyDetail}`;
            retryFeedback =
                'Your previous attempt did not satisfy the obligation. Specifics:\n' +
                    failureContext +
                    '\n\nReissue your response. If the failure was a context mismatch, ' +
                    'look at the file contents in this prompt and use ONLY those exact ' +
                    'lines as ` ` and `-` lines in your diff. If the failure was a ' +
                    'predicate exit-1, your diff did not produce the asserted property ' +
                    '— adjust the diff to make the predicate exit zero.';
            attempt += 1;
        }
        let finalSatisfied = attemptResult.satisfied;
        let finalDetail = attemptResult.satisfied || attemptResult.applyOk
            ? attemptResult.verifyDetail
            : `${attemptResult.applyDetail}; verifier: ${attemptResult.verifyDetail}`;
        if (finalSatisfied) {
            const falsified = await runFalsifiersForObligation({
                obligation,
                obligationIndex,
                repoRoot,
                ledger,
                registry: options.adapterRegistry,
                falsifiers: options.falsifiers ?? 'on',
                timeBudgetMs: options.adapterTimeBudgetMs ?? 60_000,
                ...(options.falsifierScheduler ? { scheduler: options.falsifierScheduler } : {}),
                ...(options.costTracker ? { costTracker: options.costTracker } : {}),
            });
            if (falsified !== null) {
                finalSatisfied = false;
                finalDetail = falsified;
                if (attemptResult.pre) {
                    const rb = await (0, rollback_1.rollbackObligation)(obligationIndex, ledger, repoRoot, runId, 'per-obligation-falsification');
                    ledger.append({
                        type: 'obligation-rolled-back',
                        obligationIndex,
                        trigger: 'per-obligation-falsification',
                        success: rb.success,
                        restoredFiles: rb.restoredFiles,
                        detail: rb.success
                            ? `rolled back ${rb.restoredFiles.length} file(s) after falsification`
                            : `rollback failed: ${rb.failure?.detail ?? 'unknown'}`,
                    });
                    if (!rb.success && rb.failure?.kind !== 'no-snapshot-found') {
                        throw new Error(`rollback failed for obligation ${obligationIndex}: ${rb.failure?.detail ?? 'unknown'}`);
                    }
                }
            }
        }
        if (finalSatisfied) {
            builder.setStatus(obligationIndex, 'satisfied');
            ledger.append({
                type: 'obligation-satisfied',
                obligationIndex,
                obligationType: obligation.type,
                detail: finalDetail,
            });
        }
        else {
            builder.setStatus(obligationIndex, 'failed');
            ledger.append({
                type: 'obligation-failed',
                obligationIndex,
                obligationType: obligation.type,
                detail: finalDetail,
            });
        }
        outcomes.push({
            obligationIndex,
            obligation,
            personaId: persona.id,
            satisfied: finalSatisfied,
            detail: finalDetail,
            tournament: null,
        });
    }
    let satisfied = builder.countInStatus('satisfied');
    let failed = builder.countInStatus('failed');
    let postMerge = null;
    if (options.postMerge) {
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
        postMerge = {
            passed: pm.passed,
            obligationCount: pm.obligationCount,
            failedCount: pm.failedCount,
            outcomes: slimOutcomes,
        };
        // Post-merge is authoritative for the integrated state; recompute
        // satisfied/failed from pm.outcomes so the exit code reflects
        // post-merge truth, not a stale apply-time counter.
        satisfied = pm.outcomes.filter((o) => o.passed).length;
        failed = pm.outcomes.filter((o) => !o.passed).length;
        if (!pm.passed) {
            // Rollback policy: only abandon the merge when a STRUCTURAL
            // obligation regresses. Predicate-only regressions
            // (property-must-hold, function-must-have-signature,
            // coverage-must-exceed, etc.) are quality checks; rolling back
            // working code for cosmetic predicate misses destroys real
            // progress. May 2026 eval: test-must-pass succeeded, 14/16
            // obligations passed at post-merge, 2 over-literal greps failed —
            // a full rollback erased the entire feature.
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
    }
    ledger.append({
        type: 'run-finished',
        satisfied,
        failed,
        totalUsage,
    });
    // Runs after the final ledger entry so it can never race the writer.
    const runFailed = failed > 0 || postMerge?.passed === false;
    try {
        (0, snapshot_cleanup_1.cleanupSnapshots)(repoRoot, runId, runFailed, options.snapshotCleanupPolicy ?? snapshot_cleanup_1.DEFAULT_SNAPSHOT_POLICY);
    }
    catch (err) {
        log.warn('snapshot cleanup failed (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
    }
    return {
        outcomes,
        satisfied,
        failed,
        totalUsage,
        wallTimeMs: Date.now() - start,
        mode,
        memoizedObligations,
        verifierCallsSavedByMemoization,
        deterministicObligations,
        deterministicReroutes,
        preVerifiedObligations,
        streamingAbortedCandidates,
        streamingCharsBeforeAbort,
        postMerge,
    };
}
// §8 misclassification recovery: never retries a failing strategy.
// The caller tracks attempted indexes and reroutes to synthesis.
async function dispatchDeterministic(args) {
    const { obligation, obligationIndex, runtime, repoRoot, commandTimeoutMs, strategyTimeoutMs, ledger, } = args;
    const strategyName = obligation.deterministicStrategy ?? '';
    ledger.append({
        type: 'obligation-deterministic-attempted',
        obligationIndex,
        obligationType: obligation.type,
        strategyName,
    });
    const dispatchOpts = {};
    if (strategyTimeoutMs !== undefined)
        dispatchOpts.timeoutMs = strategyTimeoutMs;
    const outcome = await runtime.dispatch(obligation, repoRoot, dispatchOpts);
    if (outcome.error !== null) {
        ledger.append({
            type: 'obligation-deterministic-failed',
            obligationIndex,
            obligationType: obligation.type,
            strategyName,
            reason: 'error',
            detail: outcome.detail,
        });
        return { satisfied: false, detail: outcome.detail };
    }
    if (!outcome.applied) {
        ledger.append({
            type: 'obligation-deterministic-failed',
            obligationIndex,
            obligationType: obligation.type,
            strategyName,
            reason: 'not-applied',
            detail: outcome.detail,
        });
        return { satisfied: false, detail: outcome.detail };
    }
    const verifyOpts = { repoRoot };
    if (commandTimeoutMs !== undefined)
        verifyOpts.commandTimeoutMs = commandTimeoutMs;
    const verifyResult = (0, run_verifier_1.verifyObligation)(obligation, verifyOpts);
    if (!verifyResult.satisfied) {
        ledger.append({
            type: 'obligation-deterministic-failed',
            obligationIndex,
            obligationType: obligation.type,
            strategyName,
            reason: 'verifier-rejected',
            detail: `${outcome.detail}; verifier said: ${verifyResult.detail}`,
        });
        return { satisfied: false, detail: verifyResult.detail };
    }
    ledger.append({
        type: 'obligation-deterministic-applied',
        obligationIndex,
        obligationType: obligation.type,
        strategyName,
        filesAffected: outcome.filesAffected,
        wallTimeMs: outcome.wallTimeMs,
        detail: outcome.detail,
    });
    ledger.append({
        type: 'obligation-satisfied',
        obligationIndex,
        obligationType: obligation.type,
        detail: `deterministic ${strategyName}: ${outcome.detail}`,
    });
    return { satisfied: true, detail: outcome.detail };
}
function listPersonaIds(registry) {
    return registry.list().map((p) => p.id);
}
function sha256(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function providerAttribution(session) {
    // Older test mocks satisfy Session structurally without providerInfo.
    if (typeof session.providerInfo !== 'function')
        return {};
    const info = session.providerInfo();
    return {
        provider: info.provider,
        modelId: info.model,
        backend: info.backend,
        grammar: info.grammar,
        seed: info.seed,
        usageEstimated: info.usageEstimated,
    };
}
// Adapter throws are caught and recorded as failed dispatch entries:
// an adapter going sideways must not crash the run, the producer's
// verifier has already approved the patch.
async function runFalsifiersForObligation(args) {
    const { obligation, obligationIndex, repoRoot, ledger, registry, falsifiers } = args;
    if (falsifiers === 'off' || registry === undefined)
        return null;
    if (registry.forObligation(obligation.type).length === 0)
        return null;
    let outcome;
    try {
        const dispatchOpts = {
            falsifiers,
            timeBudgetMs: args.timeBudgetMs,
            workspaceRoot: repoRoot,
            contextRefs: [],
            patchSha: '',
        };
        if (args.scheduler)
            dispatchOpts.scheduler = args.scheduler;
        if (args.costTracker) {
            const tracker = args.costTracker;
            dispatchOpts.shouldCancel = () => tracker.isCancelled() ? live_cost_tracker_1.COST_CAP_ABORT_REASON : null;
        }
        outcome = await (0, dispatcher_1.dispatchFalsifiers)(obligation, registry, dispatchOpts);
        if (args.scheduler)
            args.scheduler.flush();
        if (outcome.dispatchDecision) {
            ledger.append({
                type: 'falsifier-dispatch-decision',
                obligationIndex,
                obligationType: obligation.type,
                kind: outcome.dispatchDecision.kind,
                order: outcome.dispatchDecision.order.slice(),
                scores: outcome.dispatchDecision.scores.map((s) => ({ adapter: s.adapter, score: Number.isFinite(s.score) ? s.score : null })),
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
        return null;
    }
    if (outcome.disabled)
        return null;
    let firstCounterExampleDetail = null;
    for (const call of outcome.calls) {
        const counterExamples = call.cost.counterExamplesFound;
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
            counterExamplesFound: counterExamples,
            wallClockMs: call.cost.wallClockMs,
            dollarsBilled: call.cost.dollarsBilled,
            dollarsApiEquivalent: call.cost.dollarsApiEquivalent,
            detail,
        });
    }
    return firstCounterExampleDetail;
}
// Re-export so external consumers (tests, v8 CLI handlers) keep their
// import path stable after the split.
var persona_message_2 = require("./persona-message");
Object.defineProperty(exports, "renderDynamicMessage", { enumerable: true, get: function () { return persona_message_2.renderDynamicMessage; } });
var test_framework_misuse_2 = require("./test-framework-misuse");
Object.defineProperty(exports, "isTestFilePath", { enumerable: true, get: function () { return test_framework_misuse_2.isTestFilePath; } });
