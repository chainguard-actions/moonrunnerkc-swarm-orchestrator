"use strict";
/**
 * Phase 5 §8 deterministic-floor benchmark goal suite.
 *
 * Each goal is a contract whose `file-must-exist` obligations are
 * either boilerplate paths the auto-tagger picks up
 * (`scaffold-template`) or non-boilerplate paths that fall through to
 * synthesis. The benchmark compares two configurations against this
 * suite:
 *
 *   - **baseline** — `wasmRuntime: undefined`. Every file obligation
 *     hits the synthesis path; the architect persona generates a body
 *     for each one.
 *   - **deterministic** — `wasmRuntime: createDefaultRuntime()`. Tagged
 *     obligations short-circuit through the WASM runtime at zero
 *     LLM token cost; untagged ones still go through synthesis.
 *
 * The §8 (a) ship-gate is structural: tagged obligations consume zero
 * candidate-recorded entries in the deterministic configuration. The
 * §8 (b) ship-gate is comparative: aggregate effective input under the
 * deterministic configuration is strictly lower than under baseline
 * for goals dominated by deterministic obligations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DETERMINISTIC_GOALS = void 0;
exports.assertDeterministicGoalsShape = assertDeterministicGoalsShape;
exports.DETERMINISTIC_GOALS = [
    {
        id: 'boilerplate-3',
        goal: 'scaffold three pieces of project boilerplate (LICENSE, .gitignore, README.md)',
        obligations: [
            { type: 'file-must-exist', path: 'LICENSE' },
            { type: 'file-must-exist', path: '.gitignore' },
            { type: 'file-must-exist', path: 'README.md' },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
        ],
        expectedDeterministic: 3,
    },
    {
        id: 'boilerplate-5',
        goal: 'scaffold five pieces of project boilerplate (LICENSE, .gitignore, .editorconfig, README.md, CHANGELOG.md)',
        obligations: [
            { type: 'file-must-exist', path: 'LICENSE' },
            { type: 'file-must-exist', path: '.gitignore' },
            { type: 'file-must-exist', path: '.editorconfig' },
            { type: 'file-must-exist', path: 'README.md' },
            { type: 'file-must-exist', path: 'CHANGELOG.md' },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
        ],
        expectedDeterministic: 5,
    },
    {
        id: 'mixed-boilerplate-and-source',
        goal: 'scaffold LICENSE plus a service module',
        obligations: [
            { type: 'file-must-exist', path: 'LICENSE' },
            { type: 'file-must-exist', path: 'src/service.ts' },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
        ],
        expectedDeterministic: 1,
    },
];
/** Sanity assertion. */
function assertDeterministicGoalsShape() {
    if (exports.DETERMINISTIC_GOALS.length < 3) {
        throw new Error(`expected ≥3 deterministic goals, got ${exports.DETERMINISTIC_GOALS.length}`);
    }
    for (const g of exports.DETERMINISTIC_GOALS) {
        const hasBuild = g.obligations.some((o) => o.type === 'build-must-pass');
        const hasTest = g.obligations.some((o) => o.type === 'test-must-pass');
        if (!hasBuild || !hasTest) {
            throw new Error(`goal ${g.id} is missing build- or test-must-pass`);
        }
    }
}
