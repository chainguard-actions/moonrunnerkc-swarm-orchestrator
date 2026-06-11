"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const resume_1 = require("../../src/ledger/resume");
const compiler_1 = require("../../src/contract/compiler");
function header(seq, runId = 'r1') {
    return {
        ts: '2026-05-08T00:00:00.000Z',
        runId,
        seq,
        prevHash: '0'.repeat(64),
        entryHash: 'a'.repeat(64),
    };
}
function buildContract() {
    return (0, compiler_1.finalize)({
        schemaVersion: 'v1',
        goal: 'g',
        repoContext: { repoRoot: '/r', buildCommand: 'true', testCommand: 'true', language: 'typescript' },
        obligations: [
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'file-must-exist', path: 'b.ts' },
            { type: 'file-must-exist', path: 'c.ts' },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
            { type: 'file-must-exist', path: 'd.ts' },
        ],
        extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
    });
}
describe('ledger/resume', () => {
    describe('deriveResumeState', () => {
        it('throws ResumeError when no run-started matches', () => {
            const contract = buildContract();
            assert_1.strict.throws(() => (0, resume_1.deriveResumeState)([], contract), (err) => err instanceof resume_1.ResumeError && err.code === 'no-run-started');
        });
        it('returns empty satisfied set when prior run only got run-started', () => {
            const contract = buildContract();
            const entries = [
                {
                    ...header(0, 'old'),
                    type: 'run-started',
                    contractId: contract.manifest.contractId,
                    contractHash: contract.manifest.contractHash,
                    obligationCount: contract.obligations.length,
                    goal: 'g',
                },
            ];
            const state = (0, resume_1.deriveResumeState)(entries, contract);
            assert_1.strict.equal(state.satisfiedIndexes.size, 0);
            assert_1.strict.equal(state.pendingIndexes.size, contract.obligations.length);
            assert_1.strict.equal(state.resumeOf, 'old');
        });
        it('correctly identifies satisfied indexes for a partial 5-of-6 prior run', () => {
            const contract = buildContract();
            // prior run completed 5 obligations and was killed before the 6th.
            const entries = [
                {
                    ...header(0, 'old'),
                    type: 'run-started',
                    contractId: contract.manifest.contractId,
                    contractHash: contract.manifest.contractHash,
                    obligationCount: contract.obligations.length,
                    goal: 'g',
                },
                ...[0, 1, 2, 3, 4].map((i, k) => ({
                    ...header(k + 1, 'old'),
                    type: 'obligation-satisfied',
                    obligationIndex: i,
                    obligationType: contract.obligations[i].type,
                    detail: 'ok',
                })),
            ];
            const state = (0, resume_1.deriveResumeState)(entries, contract);
            assert_1.strict.equal(state.satisfiedIndexes.size, 5);
            assert_1.strict.deepEqual([...state.pendingIndexes], [5]);
            assert_1.strict.equal(state.originalObligationCount, contract.obligations.length);
        });
        it('lists prior failures separately from satisfied', () => {
            const contract = buildContract();
            const entries = [
                {
                    ...header(0, 'old'),
                    type: 'run-started',
                    contractId: contract.manifest.contractId,
                    contractHash: contract.manifest.contractHash,
                    obligationCount: contract.obligations.length,
                    goal: 'g',
                },
                {
                    ...header(1, 'old'),
                    type: 'obligation-satisfied',
                    obligationIndex: 0,
                    obligationType: 'file-must-exist',
                    detail: 'ok',
                },
                {
                    ...header(2, 'old'),
                    type: 'obligation-failed',
                    obligationIndex: 3,
                    obligationType: 'build-must-pass',
                    detail: 'build failed',
                },
            ];
            const state = (0, resume_1.deriveResumeState)(entries, contract);
            assert_1.strict.deepEqual([...state.satisfiedIndexes].sort(), [0]);
            assert_1.strict.deepEqual([...state.failedIndexes].sort(), [3]);
            // Failed indexes still go in pending so resume retries them.
            assert_1.strict.ok(state.pendingIndexes.has(3));
        });
        it('rejects empty contract obligations', () => {
            const contract = {
                manifest: {
                    schemaVersion: 'v1',
                    contractHash: 'h',
                    contractId: 'h0000000',
                    goal: 'g',
                    repoContext: { repoRoot: '/r', buildCommand: null, testCommand: null, language: 'unknown' },
                    extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
                    createdAt: '2026-05-08T00:00:00.000Z',
                },
                obligations: [],
            };
            const entries = [
                {
                    ...header(0, 'old'),
                    type: 'run-started',
                    contractId: 'h0000000',
                    contractHash: 'h',
                    obligationCount: 0,
                    goal: 'g',
                },
            ];
            assert_1.strict.throws(() => (0, resume_1.deriveResumeState)(entries, contract), (err) => err instanceof resume_1.ResumeError && err.code === 'no-obligations');
        });
    });
    describe('memoizedEntriesForResume', () => {
        it('builds one entry per satisfied index with the canonical obligation key', () => {
            const contract = buildContract();
            const state = {
                resumeOf: 'old',
                contractId: contract.manifest.contractId,
                contractHash: contract.manifest.contractHash,
                satisfiedIndexes: new Set([0, 2]),
                failedIndexes: new Set(),
                pendingIndexes: new Set([1, 3, 4, 5]),
                originalObligationCount: contract.obligations.length,
            };
            const out = (0, resume_1.memoizedEntriesForResume)(state, contract);
            assert_1.strict.equal(out.length, 2);
            const keys = out.map((e) => e.obligationKey).sort();
            assert_1.strict.deepEqual(keys, ['file-must-exist|a.ts', 'file-must-exist|c.ts']);
            for (const e of out) {
                assert_1.strict.equal(e.type, 'obligation-memoized');
                assert_1.strict.equal(e.source, 'prior-run');
            }
        });
    });
});
