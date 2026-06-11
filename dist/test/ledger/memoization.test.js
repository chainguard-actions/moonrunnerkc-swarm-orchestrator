"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const memoization_1 = require("../../src/ledger/memoization");
const types_1 = require("../../src/session/types");
function header(seq, runId = 'r1') {
    return {
        ts: '2026-05-08T00:00:00.000Z',
        runId,
        seq,
        prevHash: '0'.repeat(64),
        entryHash: 'a'.repeat(64),
    };
}
describe('ledger/memoization', () => {
    describe('obligationKey', () => {
        it('keys file-must-exist by path', () => {
            assert_1.strict.equal((0, memoization_1.obligationKey)({ type: 'file-must-exist', path: 'src/x.ts' }), 'file-must-exist|src/x.ts');
        });
        it('keys build-must-pass by command', () => {
            assert_1.strict.equal((0, memoization_1.obligationKey)({ type: 'build-must-pass', command: 'npm run build' }), 'build-must-pass|npm run build');
        });
    });
    describe('MemoStore', () => {
        it('indexes tournament winners by hash and obligation type', () => {
            const entries = [
                { ...header(0), type: 'run-started', contractId: 'c', contractHash: 'h', obligationCount: 1, goal: 'g' },
                { ...header(1), type: 'tournament-round-started', obligationIndex: 0, obligationType: 'file-must-exist', roundIndex: 0, roundCap: 3, personaIds: ['architect'], temperatures: [0.2] },
                { ...header(2), type: 'tournament-winner-selected', obligationIndex: 0, roundIndex: 0, candidateIndex: 0, personaId: 'architect', responseSha256: 'aaaa', score: 0.9, rationale: 'ok' },
            ];
            const store = new memoization_1.MemoStore(entries);
            assert_1.strict.equal(store.winnerCount(), 1);
            assert_1.strict.equal(store.hashesIndexedCount(), 1);
            const hit = store.findPriorWinnerByHash({ type: 'file-must-exist', path: 'irrelevant' }, 'aaaa');
            assert_1.strict.ok(hit);
            assert_1.strict.equal(hit?.source, 'prior-winner');
        });
        it('returns null when hash is unknown', () => {
            const store = new memoization_1.MemoStore([]);
            const hit = store.findPriorWinnerByHash({ type: 'file-must-exist', path: 'x' }, 'unknown');
            assert_1.strict.equal(hit, null);
        });
        it('returns null when hash matches but obligation type differs', () => {
            const entries = [
                { ...header(0), type: 'tournament-round-started', obligationIndex: 0, obligationType: 'build-must-pass', roundIndex: 0, roundCap: 3, personaIds: ['implementer'], temperatures: [0.2] },
                { ...header(1), type: 'tournament-winner-selected', obligationIndex: 0, roundIndex: 0, candidateIndex: 0, personaId: 'implementer', responseSha256: 'aaaa', score: 0.9, rationale: 'ok' },
            ];
            const store = new memoization_1.MemoStore(entries);
            const hit = store.findPriorWinnerByHash({ type: 'file-must-exist', path: 'x' }, 'aaaa');
            assert_1.strict.equal(hit, null);
        });
        it('ingestWinner adds to the index incrementally', () => {
            const store = new memoization_1.MemoStore([]);
            store.ingestWinner({
                ...header(0),
                type: 'tournament-winner-selected',
                obligationIndex: 0,
                roundIndex: 0,
                candidateIndex: 0,
                personaId: 'architect',
                responseSha256: 'bbbb',
                score: 0.9,
                rationale: 'ok',
            }, 'file-must-exist');
            const hit = store.findPriorWinnerByHash({ type: 'file-must-exist', path: 'y' }, 'bbbb');
            assert_1.strict.ok(hit);
        });
    });
    describe('priorSatisfiedIndexes', () => {
        it('returns indexes satisfied by runs with matching contractHash', () => {
            const entries = [
                { ...header(0, 'old'), type: 'run-started', contractId: 'c', contractHash: 'H', obligationCount: 3, goal: 'g' },
                { ...header(1, 'old'), type: 'obligation-satisfied', obligationIndex: 0, obligationType: 'file-must-exist', detail: 'ok' },
                { ...header(2, 'old'), type: 'obligation-satisfied', obligationIndex: 2, obligationType: 'test-must-pass', detail: 'ok' },
                { ...header(3, 'old'), type: 'run-finished', satisfied: 2, failed: 0, totalUsage: (0, types_1.emptyUsage)() },
            ];
            const set = (0, memoization_1.priorSatisfiedIndexes)(entries, 'H');
            assert_1.strict.deepEqual([...set].sort(), [0, 2]);
        });
        it('skips runs with non-matching contractHash', () => {
            const entries = [
                { ...header(0, 'old'), type: 'run-started', contractId: 'c', contractHash: 'OTHER', obligationCount: 3, goal: 'g' },
                { ...header(1, 'old'), type: 'obligation-satisfied', obligationIndex: 0, obligationType: 'file-must-exist', detail: 'ok' },
            ];
            const set = (0, memoization_1.priorSatisfiedIndexes)(entries, 'H');
            assert_1.strict.equal(set.size, 0);
        });
        it('treats failed-then-satisfied as satisfied (last status wins)', () => {
            const entries = [
                { ...header(0, 'old'), type: 'run-started', contractId: 'c', contractHash: 'H', obligationCount: 1, goal: 'g' },
                { ...header(1, 'old'), type: 'obligation-failed', obligationIndex: 0, obligationType: 'build-must-pass', detail: 'err' },
                { ...header(2, 'old'), type: 'obligation-satisfied', obligationIndex: 0, obligationType: 'build-must-pass', detail: 'ok' },
            ];
            const sat = (0, memoization_1.priorSatisfiedIndexes)(entries, 'H');
            assert_1.strict.ok(sat.has(0));
            const failed = (0, memoization_1.priorFailedIndexes)(entries, 'H');
            assert_1.strict.ok(!failed.has(0));
        });
        it('honours excludeRunId so the resuming run does not double-count itself', () => {
            const entries = [
                { ...header(0, 'self'), type: 'run-started', contractId: 'c', contractHash: 'H', obligationCount: 1, goal: 'g' },
                { ...header(1, 'self'), type: 'obligation-satisfied', obligationIndex: 0, obligationType: 'file-must-exist', detail: 'ok' },
            ];
            const set = (0, memoization_1.priorSatisfiedIndexes)(entries, 'H', { excludeRunId: 'self' });
            assert_1.strict.equal(set.size, 0);
        });
        it('honors obligation-memoized as satisfied', () => {
            const entries = [
                { ...header(0, 'old'), type: 'run-started', contractId: 'c', contractHash: 'H', obligationCount: 1, goal: 'g' },
                { ...header(1, 'old'), type: 'obligation-memoized', obligationIndex: 0, obligationType: 'file-must-exist', obligationKey: 'file-must-exist|x', source: 'prior-run', responseSha256: null, detail: 'memo' },
            ];
            const set = (0, memoization_1.priorSatisfiedIndexes)(entries, 'H');
            assert_1.strict.ok(set.has(0));
        });
    });
    describe('hitFromMemoized', () => {
        it('round-trips a memoized entry to a hit', () => {
            const entry = {
                ...header(0),
                type: 'obligation-memoized',
                obligationIndex: 0,
                obligationType: 'file-must-exist',
                obligationKey: 'file-must-exist|x',
                source: 'prior-run',
                responseSha256: 'aaaa',
                detail: 'd',
            };
            const hit = (0, memoization_1.hitFromMemoized)(entry);
            assert_1.strict.equal(hit.source, 'prior-run');
            assert_1.strict.equal(hit.responseSha256, 'aaaa');
            assert_1.strict.equal(hit.detail, 'd');
        });
    });
    describe('MemoStore + obligation-attempted', () => {
        it('ignores obligation-attempted when no winner follows', () => {
            const entries = [
                { ...header(0), type: 'obligation-attempted', obligationIndex: 0, obligationType: 'file-must-exist', personaId: 'architect' },
                { ...header(1), type: 'candidate-recorded', obligationIndex: 0, personaId: 'architect', responseSha256: 'cccc', usage: (0, types_1.emptyUsage)(), model: 'm' },
            ];
            const store = new memoization_1.MemoStore(entries);
            assert_1.strict.equal(store.winnerCount(), 0);
        });
    });
});
