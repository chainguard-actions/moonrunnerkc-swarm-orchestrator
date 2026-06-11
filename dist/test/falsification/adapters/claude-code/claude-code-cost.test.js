"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const claude_code_1 = require("../../../../src/falsification/adapters/profiles/claude-code");
describe('claude-code-cost', () => {
    describe('detectClaudeCodeAuthMethod', () => {
        it('returns chatgpt when ANTHROPIC_API_KEY is unset', () => {
            assert_1.strict.equal((0, claude_code_1.detectClaudeCodeAuthMethod)({}), 'chatgpt');
        });
        it('returns chatgpt when ANTHROPIC_API_KEY is empty', () => {
            assert_1.strict.equal((0, claude_code_1.detectClaudeCodeAuthMethod)({ ANTHROPIC_API_KEY: '' }), 'chatgpt');
        });
        it('returns api when ANTHROPIC_API_KEY is set', () => {
            assert_1.strict.equal((0, claude_code_1.detectClaudeCodeAuthMethod)({ ANTHROPIC_API_KEY: 'sk-x' }), 'api');
        });
    });
    describe('dollarsForEnvelopeByAuth', () => {
        it('reports dollarsBilled=0 under chatgpt auth', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0.42, 'chatgpt');
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.ok(dollarsTokenEstimate > 0);
        });
        it('reports dollarsBilled === dollarsTokenEstimate under api auth', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0.42, 'api');
            assert_1.strict.equal(dollarsBilled, dollarsTokenEstimate);
        });
        it('treats unknown as billed (conservative)', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0.42, 'unknown');
            assert_1.strict.equal(dollarsBilled, dollarsTokenEstimate);
        });
        it('returns 0/0 when totalCostUsd is 0', () => {
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0, 'api');
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.equal(dollarsTokenEstimate, 0);
            assert_1.strict.equal(dollarsApiEquivalent, 0);
        });
        // Audit-and-corrections (2026-05-09): ClaudeCode CLI returns
        // total_cost_usd already at API rate-card value, so the
        // API-equivalent surface is identical to the token-estimate.
        it('reports dollarsApiEquivalent === dollarsTokenEstimate under chatgpt auth', () => {
            const { dollarsTokenEstimate, dollarsApiEquivalent } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0.42, 'chatgpt');
            assert_1.strict.equal(dollarsApiEquivalent, dollarsTokenEstimate);
        });
        it('reports dollarsApiEquivalent === dollarsTokenEstimate === dollarsBilled under api auth', () => {
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, claude_code_1.dollarsForEnvelopeByAuth)(0.42, 'api');
            assert_1.strict.equal(dollarsApiEquivalent, dollarsTokenEstimate);
            assert_1.strict.equal(dollarsApiEquivalent, dollarsBilled);
        });
    });
});
