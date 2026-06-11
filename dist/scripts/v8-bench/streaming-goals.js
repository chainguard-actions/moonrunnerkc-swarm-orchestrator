"use strict";
/**
 * Phase 6 streaming-verification benchmark goals.
 *
 * Each goal has a `doomed` and a `clean` variant:
 *   - `doomed`: the architect persona emits a forbidden import early in
 *     its response. Streaming aborts mid-stream; the rest of the response
 *     is not paid for.
 *   - `clean`: same architect output without the forbidden import; the
 *     stream completes normally.
 *
 * The benchmark compares output-token cost between streaming-aborted and
 * non-streaming runs of the same doomed scenario, validating impl guide
 * §9 "Token savings on aborted generations measurable in run output".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STREAMING_GOALS = void 0;
exports.assertStreamingGoalsShape = assertStreamingGoalsShape;
const STD_OBLIGATIONS = [
    { type: 'file-must-exist', path: 'src/feature.ts' },
    { type: 'build-must-pass', command: 'true' },
    { type: 'test-must-pass', command: 'true' },
];
exports.STREAMING_GOALS = [
    {
        id: 'doomed-small',
        goal: 'add a feature using a doomed package (small)',
        obligations: STD_OBLIGATIONS,
        forbiddenImports: ['doomed-pkg'],
        doomed: true,
        responseLength: 256,
    },
    {
        id: 'doomed-medium',
        goal: 'add a feature using a doomed package (medium)',
        obligations: STD_OBLIGATIONS,
        forbiddenImports: ['doomed-pkg'],
        doomed: true,
        responseLength: 1024,
    },
    {
        id: 'doomed-large',
        goal: 'add a feature using a doomed package (large)',
        obligations: STD_OBLIGATIONS,
        forbiddenImports: ['doomed-pkg'],
        doomed: true,
        responseLength: 4096,
    },
    {
        id: 'clean-baseline',
        goal: 'add a clean feature without forbidden imports',
        obligations: STD_OBLIGATIONS,
        forbiddenImports: ['doomed-pkg'],
        doomed: false,
        responseLength: 1024,
    },
];
/** Sanity check that benchmark wiring matches the file's expected shape. */
function assertStreamingGoalsShape() {
    if (exports.STREAMING_GOALS.length < 4) {
        throw new Error(`streaming-goals shape regression: expected >=4 goals, got ${exports.STREAMING_GOALS.length}`);
    }
    const doomed = exports.STREAMING_GOALS.filter((g) => g.doomed).length;
    if (doomed < 3) {
        throw new Error(`streaming-goals: expected at least 3 doomed variants, got ${doomed}`);
    }
}
