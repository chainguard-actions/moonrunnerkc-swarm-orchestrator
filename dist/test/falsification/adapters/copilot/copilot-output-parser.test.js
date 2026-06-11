"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const copilot_1 = require("../../../../src/falsification/adapters/profiles/copilot");
const copilot_2 = require("../../../../src/falsification/adapters/profiles/copilot");
function fence(payload) {
    return ['```json', JSON.stringify(payload), '```'].join('\n');
}
function makeCandidates(n) {
    return Array.from({ length: n }, (_, i) => ({
        name: `c-${i}`,
        rationale: `candidate ${i}`,
        files: [{ relPath: `c-${i}/file.ts`, bytes: 'export const x = 1;\n' }],
    }));
}
describe('parseCopilotCandidates', () => {
    it('parses a well-formed fenced JSON document', () => {
        const out = fence({ candidates: makeCandidates(copilot_2.COPILOT_CANDIDATE_COUNT) });
        const parsed = (0, copilot_1.parseCopilotCandidates)(out);
        assert_1.strict.equal(parsed.length, copilot_2.COPILOT_CANDIDATE_COUNT);
        assert_1.strict.equal(parsed[0].name, 'c-0');
        assert_1.strict.equal(parsed[0].files[0].relPath, 'c-0/file.ts');
    });
    it('throws when the candidate count differs from COPILOT_CANDIDATE_COUNT', () => {
        const out = fence({ candidates: makeCandidates(1) });
        assert_1.strict.throws(() => (0, copilot_1.parseCopilotCandidates)(out), /returned 1 candidates/);
    });
    it('throws when the fenced block is missing', () => {
        assert_1.strict.throws(() => (0, copilot_1.parseCopilotCandidates)('no fence here'), /did not contain a fenced/);
    });
    it('throws when the JSON does not parse', () => {
        const broken = '```json\n{not json}\n```';
        assert_1.strict.throws(() => (0, copilot_1.parseCopilotCandidates)(broken), /did not parse as JSON/);
    });
    it('rejects relPath containing ..', () => {
        const candidates = makeCandidates(copilot_2.COPILOT_CANDIDATE_COUNT);
        candidates[0].files[0].relPath = '../escape.ts';
        const out = fence({ candidates });
        assert_1.strict.throws(() => (0, copilot_1.parseCopilotCandidates)(out), /must be relative/);
    });
    it('rejects an absolute relPath', () => {
        const candidates = makeCandidates(copilot_2.COPILOT_CANDIDATE_COUNT);
        candidates[0].files[0].relPath = '/etc/passwd';
        const out = fence({ candidates });
        assert_1.strict.throws(() => (0, copilot_1.parseCopilotCandidates)(out), /must be relative/);
    });
    it('extracts JSON even when bytes contain triple-backticks', () => {
        const candidates = makeCandidates(copilot_2.COPILOT_CANDIDATE_COUNT);
        candidates[0].files[0].bytes =
            '```ts\nexport const x = 1;\n```\n';
        const out = fence({ candidates });
        const parsed = (0, copilot_1.parseCopilotCandidates)(out);
        assert_1.strict.equal(parsed[0].files[0].bytes, '```ts\nexport const x = 1;\n```\n');
    });
    it('accepts empty bytes (an empty file is a legitimate counter-example shape)', () => {
        const candidates = makeCandidates(copilot_2.COPILOT_CANDIDATE_COUNT);
        candidates[0].files[0].bytes = '';
        const out = fence({ candidates });
        const parsed = (0, copilot_1.parseCopilotCandidates)(out);
        assert_1.strict.equal(parsed[0].files[0].bytes, '');
    });
});
