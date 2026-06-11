"use strict";
/**
 * Phase 6: streaming-verification driver.
 *
 * Receives partial generation output from the session's streaming API at
 * intervals and evaluates checkable contract assertions against the
 * partial. When an assertion fires a violation that cannot be repaired
 * by continuing, the generation is cancelled. Tokens generated to that
 * point are still billed by the provider; tokens not generated are
 * saved.
 *
 * See `v8-overhaul-guide.md` §5.5 (multi-point verification) and
 * `v8-implementation-guide.md` §9 (Phase 6 deliverables and exit
 * criteria).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NULL_STREAMING_CONFIG = exports.COST_CAP_ASSERTION_ID = void 0;
exports.forbiddenImportsAssertion = forbiddenImportsAssertion;
exports.matchesForbiddenImport = matchesForbiddenImport;
exports.evaluateAssertions = evaluateAssertions;
exports.runStreamingCompletion = runStreamingCompletion;
exports.buildAssertions = buildAssertions;
/**
 * The default forbidden-imports assertion. Detects import / require
 * statements referencing any module name in the configured deny list.
 * A canonical doomed-obligation example from the impl guide §9 is
 * "import a package that doesn't exist": once the candidate writes the
 * import line, the assertion fires and the rest of the generation is
 * not paid for.
 *
 * The matcher recognises:
 *   - JS / TS:    `import … from 'name'`, `require('name')`,
 *                 `import 'name'`, `import('name')` (dynamic)
 *   - Python:     `import name`, `from name import …`
 *
 * Names match by prefix to catch submodule references (e.g. listing
 * `forbidden-pkg` rejects `from forbidden-pkg.sub import X`).
 */
function forbiddenImportsAssertion(forbidden) {
    const cleaned = forbidden.map((s) => s.trim()).filter((s) => s.length > 0);
    return {
        id: 'forbidden-imports',
        description: cleaned.length === 0
            ? 'forbidden-imports (no entries; assertion is a no-op)'
            : `forbidden-imports: ${cleaned.join(', ')}`,
        evaluate({ partialText }) {
            if (cleaned.length === 0)
                return null;
            for (const name of cleaned) {
                if (matchesForbiddenImport(partialText, name)) {
                    return `partial output references forbidden import "${name}"`;
                }
            }
            return null;
        },
    };
}
/**
 * Test whether `text` contains an import / require statement for the
 * given module name. Conservative on purpose: false positives waste a
 * candidate, false negatives waste an entire stream.
 */
function matchesForbiddenImport(text, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // JS / TS quoted forms: `'name'`, `"name"`, including dotted submodule.
    const quoted = new RegExp(`['"\`]${escaped}(?:[/.][^'"\`]*)?['"\`]`);
    if (quoted.test(text))
        return true;
    // Python: `import name`, `import name.sub`, `from name import …`,
    //         `from name.sub import …`. Boundary on the right with end,
    //         dot, whitespace, or comma.
    const py = new RegExp(`(?:^|\\n)\\s*(?:from|import)\\s+${escaped}(?=$|\\s|\\.|,)`, 'm');
    if (py.test(text))
        return true;
    return false;
}
/**
 * Check the partial against every assertion; return the first violation,
 * or null when nothing fired. Determinism: assertions evaluated in
 * registration order.
 */
function evaluateAssertions(assertions, obligation, partialText) {
    for (const a of assertions) {
        const reason = a.evaluate({ obligation, partialText });
        if (reason !== null) {
            return { assertionId: a.id, reason };
        }
    }
    return null;
}
/**
 * Drive a streaming completion under verifier supervision. The verifier
 * is consulted on every chunk delivered by the session; the first
 * violating assertion wins and aborts the stream.
 *
 * When `costTracker` is supplied, the stream is also gated by the
 * tracker: if projected spend (committed + in-flight estimate) crosses
 * the configured cap, the tracker's observer aborts ahead of the
 * assertion observer and the result records `'cost-cap exceeded'` as
 * the reason. The tracker is updated with the call's actual usage when
 * the stream settles, so subsequent calls see correct cumulative state.
 */
async function runStreamingCompletion(session, request, obligation, assertions, costTracker) {
    let abortAssertionId = null;
    let abortReason = null;
    let abortedAtChars = 0;
    const assertionObserver = ({ partialText }) => {
        const violation = evaluateAssertions(assertions, obligation, partialText);
        if (violation === null)
            return { kind: 'continue' };
        abortAssertionId = violation.assertionId;
        abortReason = violation.reason;
        abortedAtChars = partialText.length;
        return { kind: 'abort', reason: violation.reason };
    };
    let observer = assertionObserver;
    let finalize = null;
    if (costTracker) {
        const wrap = costTracker.observerForStream(assertionObserver);
        observer = wrap.observer;
        finalize = wrap.finalize;
    }
    let streamResult;
    try {
        streamResult = await session.stream(request, observer);
    }
    catch (err) {
        if (finalize)
            finalize(null);
        throw err;
    }
    if (finalize)
        finalize(streamResult.response.usage);
    const aborted = streamResult.aborted;
    // Cost-cap aborts populate `abortReason` from the tracker, not from
    // an assertion. Reflect that distinction in the outcome shape.
    if (aborted && abortAssertionId === null && streamResult.abortReason !== null) {
        abortReason = streamResult.abortReason;
        abortAssertionId = exports.COST_CAP_ASSERTION_ID;
        abortedAtChars = streamResult.response.text.length;
    }
    return {
        streamResult,
        aborted,
        abortAssertionId,
        abortReason,
        abortedAtChars: aborted ? abortedAtChars : streamResult.response.text.length,
    };
}
/** Synthetic assertion id used in ledger output when a cost-cap fired. */
exports.COST_CAP_ASSERTION_ID = 'cost-cap';
/** Build the assertion list a `StreamingVerifierConfig` resolves to. */
function buildAssertions(config) {
    const out = [forbiddenImportsAssertion(config.forbiddenImports)];
    if (config.extraAssertions)
        out.push(...config.extraAssertions);
    return out;
}
/**
 * Convenience: zero-config verifier that disables every default
 * assertion. Useful for tests that want to assert "streaming runs but
 * never aborts".
 */
exports.NULL_STREAMING_CONFIG = {
    forbiddenImports: [],
};
