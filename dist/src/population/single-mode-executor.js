"use strict";
/**
 * Single-mode obligation executor: generate → apply → verify → reprompt.
 *
 * Extracted from manager.ts so the main loop focuses on scheduling
 * while the retry loop with reprompt-on-failure feedback lives in its
 * own module. Streaming path takes the first attempt and skips retry —
 * the streaming verifier already aborts early on forbidden imports,
 * which is its own corrective signal.
 */
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
exports.executeSingleMode = executeSingleMode;
const crypto = __importStar(require("crypto"));
const types_1 = require("../session/types");
const streaming_verifier_1 = require("../verification/streaming-verifier");
const apply_verify_1 = require("./apply-verify");
const falsifier_dispatch_1 = require("./falsifier-dispatch");
const provider_attribution_1 = require("./provider-attribution");
const rollback_1 = require("./rollback");
const persona_message_1 = require("./persona-message");
const logger_1 = require("../logger");
const _log = (0, logger_1.getLogger)('population.single-mode-executor');
/** SHA-256 helper used for response fingerprinting in ledger entries. */
function sha256(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
/**
 * Execute a single-mode obligation: generate → apply → verify with
 * reprompt-on-failure feedback loop. Bounded at `options.retryMax`
 * (default 2) so a confused persona can't burn the run's token budget.
 */
async function executeSingleMode(obligationIndex, obligation, session, persona, state, repoRoot, ledger, options) {
    const RETRY_MAX = options.retryMax ?? 2;
    const usingStreaming = options.streamingAssertions.length > 0;
    const dynamic = (0, persona_message_1.renderDynamicMessage)(obligation, repoRoot, options.renderContext);
    let retryFeedback = null;
    const buildRequest = () => ({
        personaId: persona.id,
        personaSystemSuffix: persona.systemSuffix,
        sampling: { ...persona.sampling },
        userMessage: retryFeedback === null ? dynamic : `${dynamic}\n\n${retryFeedback}`,
    });
    let totalUsage = (0, types_1.emptyUsage)();
    let responseText;
    let responseUsage;
    let responseModel;
    let streamingOutcome = null;
    if (usingStreaming) {
        streamingOutcome = await (0, streaming_verifier_1.runStreamingCompletion)(session, buildRequest(), obligation, options.streamingAssertions, options.costTracker);
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
            ...(0, provider_attribution_1.providerAttribution)(session),
        });
        state.setStatus(obligationIndex, 'failed');
        const failDetail = `streaming verifier aborted: ${streamingOutcome.abortReason ?? 'unspecified violation'}`;
        ledger.append({
            type: 'obligation-failed',
            obligationIndex,
            obligationType: obligation.type,
            detail: failDetail,
        });
        return {
            satisfied: false,
            detail: failDetail,
            usage: totalUsage,
            streamingAborted: true,
            streamingAbortedAtChars: streamingOutcome.abortedAtChars,
        };
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
            ...(0, provider_attribution_1.providerAttribution)(session),
        });
        attemptResult = await (0, apply_verify_1.attemptApplyAndVerify)({
            obligation,
            obligationIndex,
            responseText,
            repoRoot,
            ledger,
            runId: options.runId,
            fileMustExistPaths: options.fileMustExistPaths,
            commandTimeoutMs: options.commandTimeoutMs,
            renderContext: options.renderContext,
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
        const falsified = await (0, falsifier_dispatch_1.dispatchFalsifiersForObligation)(obligationIndex, obligation, options.adapterRegistry, ledger, repoRoot, options.falsifiers ?? 'on', options.adapterTimeBudgetMs ?? 60_000, options.falsifierScheduler, options.costTracker);
        if (falsified.counterExample) {
            finalSatisfied = false;
            finalDetail = falsified.detail;
            if (attemptResult.pre) {
                const rb = await (0, rollback_1.rollbackObligation)(obligationIndex, ledger, repoRoot, options.runId, 'per-obligation-falsification');
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
        state.setStatus(obligationIndex, 'satisfied');
        ledger.append({
            type: 'obligation-satisfied',
            obligationIndex,
            obligationType: obligation.type,
            detail: finalDetail,
        });
    }
    else {
        state.setStatus(obligationIndex, 'failed');
        ledger.append({
            type: 'obligation-failed',
            obligationIndex,
            obligationType: obligation.type,
            detail: finalDetail,
        });
    }
    return {
        satisfied: finalSatisfied,
        detail: finalDetail,
        usage: totalUsage,
        streamingAborted: false,
        streamingAbortedAtChars: 0,
    };
}
