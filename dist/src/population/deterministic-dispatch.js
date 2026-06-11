"use strict";
/**
 * Deterministic-floor dispatch for a single obligation.
 *
 * §8 misclassification recovery: never retries a failing strategy.
 * The caller tracks attempted indexes and reroutes to synthesis.
 * Extracted from manager.ts to keep the main loop focused on
 * scheduling while WASM dispatch details live in their own module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchDeterministicFloor = dispatchDeterministicFloor;
const run_verifier_1 = require("../verification/run-verifier");
const logger_1 = require("../logger");
const _log = (0, logger_1.getLogger)('population.deterministic-dispatch');
/**
 * Dispatch an obligation through its WASM deterministic strategy.
 * Returns `{ applied: true }` when the strategy applied AND verified;
 * `{ applied: false }` on any failure (error, not-applied, verifier-rejected).
 * The caller records the outcome in the state builder and decides
 * whether to count the obligation as satisfied or reroute to synthesis.
 */
async function dispatchDeterministicFloor(obligationIndex, obligation, wasmRuntime, repoRoot, ledger, commandTimeoutMs, strategyTimeoutMs) {
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
    const outcome = await wasmRuntime.dispatch(obligation, repoRoot, dispatchOpts);
    if (outcome.error !== null) {
        ledger.append({
            type: 'obligation-deterministic-failed',
            obligationIndex,
            obligationType: obligation.type,
            strategyName,
            reason: 'error',
            detail: outcome.detail,
        });
        return { applied: false, detail: outcome.detail };
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
        return { applied: false, detail: outcome.detail };
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
        return { applied: false, detail: verifyResult.detail };
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
    return { applied: true, detail: outcome.detail };
}
