"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubExtractor = void 0;
/**
 * @internal
 *
 * Deterministic extractor used by the project's own tests and the
 * synthetic-mode benchmark. NOT a user-facing provider: the three
 * CLI-reachable providers are `deterministic`, `local`, and `anthropic`
 * (see `src/contract/extractor/factory.ts`). Tests construct this class
 * directly via `StubExtractor.fromObligations(...)` /
 * `.fromGoalMap(...)` / `.fromHeuristic()`. The factory deliberately
 * does not accept a `stub` provider name.
 *
 * Two construction modes:
 *
 *   1. `StubExtractor.fromObligations(obligations)` — return the exact list
 *      regardless of input. Useful for unit tests of the compiler pipeline.
 *
 *   2. `StubExtractor.fromGoalMap(map, fallback?)` — look up the goal in a
 *      map; fall back to the supplied function (or the default heuristic) on
 *      miss. Useful for wide test suites where each goal needs a different
 *      response.
 *
 * Default heuristic when no other source is supplied: emit a single
 * `file-must-exist` derived from the goal (path = first slash- or
 * filename-shaped token, or `CHANGES.md` if none) plus the build/test
 * commands from `repoContext` (or `npm run build` / `npm test` as
 * fallbacks). Deterministic: identical input produces identical output.
 */
class StubExtractor {
    resolver;
    constructor(resolver) {
        this.resolver = resolver;
    }
    /** Return the same fixed obligation list regardless of input. */
    static fromObligations(obligations) {
        const frozen = obligations.slice();
        return new StubExtractor(() => frozen.slice());
    }
    /** Resolve obligations from a goal-keyed map; fall back when missing. */
    static fromGoalMap(map, fallback) {
        const fb = fallback ?? defaultHeuristic;
        return new StubExtractor((input) => {
            const hit = map[input.goal];
            if (hit)
                return hit.slice();
            return fb(input);
        });
    }
    /** Use the default heuristic as the only resolver. */
    static fromHeuristic() {
        return new StubExtractor(defaultHeuristic);
    }
    async extract(input) {
        const obligations = this.resolver(input);
        return {
            obligations,
            provenance: {
                name: 'stub',
                model: null,
                temperature: null,
                promptSha256: null,
            },
        };
    }
}
exports.StubExtractor = StubExtractor;
function defaultHeuristic(input) {
    const out = [];
    const filePath = guessFilePath(input.goal);
    out.push({ type: 'file-must-exist', path: filePath });
    const test = input.repoContext.testCommand ?? 'npm test';
    // Only emit build-must-pass when the project actually has a build step;
    // forcing it on libraries without `scripts.build` produces a phantom
    // obligation that fails post-merge.
    if (input.repoContext.buildCommand !== null) {
        out.push({ type: 'build-must-pass', command: input.repoContext.buildCommand });
    }
    out.push({ type: 'test-must-pass', command: test });
    return out;
}
const PATH_TOKEN = /(?:[a-zA-Z0-9_./-]+\/[a-zA-Z0-9_./-]+|[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/;
function guessFilePath(goal) {
    const match = goal.match(PATH_TOKEN);
    if (match)
        return match[0];
    return 'CHANGES.md';
}
