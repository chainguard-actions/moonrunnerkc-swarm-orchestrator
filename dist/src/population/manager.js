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
exports.runPopulation = runPopulation;
exports.listPersonaIds = listPersonaIds;
exports.sha256 = sha256;
const crypto = __importStar(require("crypto"));
const memoization_1 = require("../ledger/memoization");
const predicates_1 = require("../persona/predicates");
const types_1 = require("../session/types");
const pre_generation_1 = require("../verification/pre-generation");
const streaming_verifier_1 = require("../verification/streaming-verifier");
const snapshot_cleanup_1 = require("./snapshot-cleanup");
const logger_1 = require("../logger");
const falsifier_dispatch_1 = require("./falsifier-dispatch");
const deterministic_dispatch_1 = require("./deterministic-dispatch");
const post_merge_handler_1 = require("./post-merge-handler");
const single_mode_executor_1 = require("./single-mode-executor");
const rollback_1 = require("./rollback");
const state_1 = require("./state");
const tournament_driver_1 = require("./tournament-driver");
const persona_message_1 = require("./persona-message");
const log = (0, logger_1.getLogger)('population.manager');
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
    // ── Deterministic floor ─────────────────────────────────────────
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
            const detResult = await (0, deterministic_dispatch_1.dispatchDeterministicFloor)(i, o, wasmRuntime, repoRoot, ledger, commandTimeoutMs, options.strategyTimeoutMs);
            deterministicTried.add(i);
            if (detResult.applied) {
                builder.setStatus(i, 'satisfied');
                deterministicObligations += 1;
                outcomes.push({
                    obligationIndex: i,
                    obligation: o,
                    personaId: null,
                    satisfied: true,
                    detail: detResult.detail,
                    tournament: null,
                });
            }
            else {
                deterministicReroutes += 1;
            }
        }
    }
    // ── Pre-generation check ────────────────────────────────────────
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
    // ── Main scheduling loop ────────────────────────────────────────
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
                const falsified = await (0, falsifier_dispatch_1.dispatchFalsifiersForObligation)(obligationIndex, obligation, options.adapterRegistry, ledger, repoRoot, options.falsifiers ?? 'on', options.adapterTimeBudgetMs ?? 60_000, options.falsifierScheduler, options.costTracker);
                if (falsified.counterExample) {
                    tournamentSatisfied = false;
                    tournamentDetail = falsified.detail;
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
        // ── Single mode ────────────────────────────────────────────────
        const singleOpts = {
            fileMustExistPaths,
            runId,
            commandTimeoutMs,
            renderContext: renderCtx,
            streamingAssertions,
            adapterRegistry: options.adapterRegistry,
            falsifiers: options.falsifiers,
            adapterTimeBudgetMs: options.adapterTimeBudgetMs,
            falsifierScheduler: options.falsifierScheduler,
            costTracker: options.costTracker,
        };
        const singleResult = await (0, single_mode_executor_1.executeSingleMode)(obligationIndex, obligation, session, persona, builder, repoRoot, ledger, singleOpts);
        totalUsage = (0, types_1.addUsage)(totalUsage, singleResult.usage);
        if (singleResult.streamingAborted) {
            streamingAbortedCandidates += 1;
            streamingCharsBeforeAbort += singleResult.streamingAbortedAtChars;
        }
        outcomes.push({
            obligationIndex,
            obligation,
            personaId: persona.id,
            satisfied: singleResult.satisfied,
            detail: singleResult.detail,
            tournament: null,
        });
    }
    // ── Post-merge integration check ────────────────────────────────
    let satisfied = builder.countInStatus('satisfied');
    let failed = builder.countInStatus('failed');
    let postMerge = null;
    if (options.postMerge) {
        const pmResult = await (0, post_merge_handler_1.handlePostMerge)(contract, builder, repoRoot, ledger, runId, outcomes, commandTimeoutMs);
        // Post-merge is authoritative; use its recomputed counts.
        satisfied = pmResult.satisfied;
        failed = pmResult.failed;
        postMerge = {
            passed: pmResult.passed,
            obligationCount: pmResult.obligationCount,
            failedCount: pmResult.failedCount,
            outcomes: pmResult.outcomes,
        };
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
function listPersonaIds(registry) {
    return registry.list().map((p) => p.id);
}
function sha256(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
// Re-export so external consumers (tests, v8 CLI handlers) keep their
// import path stable after the split.
var persona_message_2 = require("./persona-message");
Object.defineProperty(exports, "renderDynamicMessage", { enumerable: true, get: function () { return persona_message_2.renderDynamicMessage; } });
var test_framework_misuse_1 = require("./test-framework-misuse");
Object.defineProperty(exports, "isTestFilePath", { enumerable: true, get: function () { return test_framework_misuse_1.isTestFilePath; } });
