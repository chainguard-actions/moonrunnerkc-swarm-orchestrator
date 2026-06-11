"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const claude_code_1 = require("../../../../src/falsification/adapters/profiles/claude-code");
const claude_code_2 = require("../../../../src/falsification/adapters/profiles/claude-code");
function makeCandidates(n) {
    return Array.from({ length: n }, (_, i) => ({
        name: `c-${i}`,
        rationale: `candidate ${i}`,
        files: [{ relPath: `c-${i}/file.ts`, bytes: 'export const x = 1;\n' }],
    }));
}
function makeEnvelope(result, overrides = {}) {
    return JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result,
        total_cost_usd: 0.05,
        usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
        stop_reason: 'end_turn',
        num_turns: 1,
        ...overrides,
    });
}
describe('parseClaudeCodeEnvelope', () => {
    it('parses a well-formed envelope', () => {
        const env = (0, claude_code_1.parseClaudeCodeEnvelope)(makeEnvelope('hi'));
        assert_1.strict.equal(env.type, 'result');
        assert_1.strict.equal(env.subtype, 'success');
        assert_1.strict.equal(env.isError, false);
        assert_1.strict.equal(env.result, 'hi');
        assert_1.strict.equal(env.totalCostUsd, 0.05);
        assert_1.strict.equal(env.inputTokens, 100);
        assert_1.strict.equal(env.outputTokens, 50);
    });
    it('throws on empty stdout', () => {
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeEnvelope)(''), /no stdout/);
    });
    it('throws when stdout is not JSON', () => {
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeEnvelope)('not json'), /did not parse/);
    });
    it('throws when required fields are missing', () => {
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeEnvelope)(JSON.stringify({})), /missing string field "type"/);
    });
    it('treats missing usage fields as zero', () => {
        const env = (0, claude_code_1.parseClaudeCodeEnvelope)(makeEnvelope('hi', { usage: undefined }));
        assert_1.strict.equal(env.inputTokens, 0);
        assert_1.strict.equal(env.outputTokens, 0);
    });
});
describe('parseClaudeCodeCandidates', () => {
    it('parses candidates from a successful envelope', () => {
        const candidates = makeCandidates(claude_code_2.CLAUDE_CODE_CANDIDATE_COUNT);
        const inner = ['```json', JSON.stringify({ candidates }), '```'].join('\n');
        const stdout = makeEnvelope(inner);
        const parsed = (0, claude_code_1.parseClaudeCodeCandidates)(stdout);
        assert_1.strict.equal(parsed.length, claude_code_2.CLAUDE_CODE_CANDIDATE_COUNT);
        assert_1.strict.equal(parsed[0].name, 'c-0');
    });
    it('throws when envelope reports is_error=true', () => {
        const stdout = makeEnvelope('Auth failed.', { is_error: true, subtype: 'error_max_budget_usd' });
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeCandidates)(stdout), /reported is_error=true/);
    });
    it('throws when result is empty', () => {
        const stdout = makeEnvelope('');
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeCandidates)(stdout), /empty `result`/);
    });
    it('throws when fenced JSON is missing from result', () => {
        const stdout = makeEnvelope('Here are some thoughts but no fenced JSON.');
        assert_1.strict.throws(() => (0, claude_code_1.parseClaudeCodeCandidates)(stdout), /did not contain a fenced/);
    });
});
