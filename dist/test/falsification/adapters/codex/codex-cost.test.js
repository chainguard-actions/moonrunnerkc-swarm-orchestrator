"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const codex_1 = require("../../../../src/falsification/adapters/profiles/codex");
describe('codex cost parsing and pricing', () => {
    describe('parseCodexUsage', () => {
        it('parses the human-readable form', () => {
            const usage = (0, codex_1.parseCodexUsage)('final answer here.\n\ntokens used: input=1234 output=456 total=1690\n', 'o4-mini');
            assert_1.strict.ok(usage);
            assert_1.strict.equal(usage.inputTokens, 1234);
            assert_1.strict.equal(usage.outputTokens, 456);
            assert_1.strict.equal(usage.model, 'o4-mini');
        });
        it('parses an embedded JSON tokens object', () => {
            const usage = (0, codex_1.parseCodexUsage)('{"meta": {"tokens": {"input": 800, "output": 200}}}', 'gpt-5-codex');
            assert_1.strict.ok(usage);
            assert_1.strict.equal(usage.inputTokens, 800);
            assert_1.strict.equal(usage.outputTokens, 200);
        });
        it('returns null when no usage is reported', () => {
            assert_1.strict.equal((0, codex_1.parseCodexUsage)('just narration with no usage block', 'o4-mini'), null);
        });
        it('parses the codex 0.130.0 footer (single-total form, comma-separated)', () => {
            const usage = (0, codex_1.parseCodexUsage)('codex\nhello there\ntokens used\n1,545\n', 'gpt-5.5');
            assert_1.strict.ok(usage);
            assert_1.strict.equal(usage.inputTokens, 0);
            assert_1.strict.equal(usage.outputTokens, 1545);
            assert_1.strict.equal(usage.model, 'gpt-5.5');
        });
    });
    describe('dollarsForUsage', () => {
        it('prices o4-mini at the documented rate', () => {
            const dollars = (0, codex_1.dollarsForUsage)({ inputTokens: 1_000_000, outputTokens: 1_000_000, model: 'o4-mini' });
            // 1M input * 1.10 + 1M output * 4.40 = 5.50
            assert_1.strict.equal(dollars, 5.5);
        });
        it('prices gpt-5-codex at the documented rate', () => {
            const dollars = (0, codex_1.dollarsForUsage)({
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
                model: 'gpt-5-codex',
            });
            // 1M input * 1.25 + 1M output * 10.00 = 11.25
            assert_1.strict.equal(dollars, 11.25);
        });
        it('falls back to a conservative rate for unknown models', () => {
            const known = (0, codex_1.dollarsForUsage)({ inputTokens: 1_000_000, outputTokens: 1_000_000, model: 'gpt-5-codex' });
            const unknown = (0, codex_1.dollarsForUsage)({
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
                model: 'a-future-model-not-in-the-table',
            });
            assert_1.strict.equal(unknown, known);
        });
        it('returns 0 when no tokens are consumed', () => {
            assert_1.strict.equal((0, codex_1.dollarsForUsage)({ inputTokens: 0, outputTokens: 0, model: 'o4-mini' }), 0);
        });
    });
    describe('dollarsForUsageByAuth (audit-and-corrections, 2026-05-09)', () => {
        // Codex is metered at API token rates regardless of auth tier:
        // dollarsApiEquivalent must equal dollarsTokenEstimate for every
        // outcome of dollarsForUsageByAuth. (Subscription auth zeroes
        // dollarsBilled; the API-equivalent column is unaffected.)
        it('reports dollarsApiEquivalent === dollarsTokenEstimate under chatgpt auth', () => {
            const usage = { inputTokens: 1000, outputTokens: 500, model: 'o4-mini' };
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, codex_1.dollarsForUsageByAuth)(usage, 'chatgpt');
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.ok(dollarsTokenEstimate > 0);
            assert_1.strict.equal(dollarsApiEquivalent, dollarsTokenEstimate);
        });
        it('reports dollarsApiEquivalent === dollarsTokenEstimate === dollarsBilled under api auth', () => {
            const usage = { inputTokens: 1000, outputTokens: 500, model: 'gpt-5-codex' };
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, codex_1.dollarsForUsageByAuth)(usage, 'api');
            assert_1.strict.equal(dollarsBilled, dollarsTokenEstimate);
            assert_1.strict.equal(dollarsApiEquivalent, dollarsTokenEstimate);
        });
    });
});
