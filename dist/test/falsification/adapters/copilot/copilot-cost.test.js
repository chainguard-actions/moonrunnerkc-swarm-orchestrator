"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const copilot_1 = require("../../../../src/falsification/adapters/profiles/copilot");
describe('copilot-cost', () => {
    describe('copilotUsdPerPremiumRequest', () => {
        it('returns the Pro+ default when the env override is unset', () => {
            const r = (0, copilot_1.copilotUsdPerPremiumRequest)({});
            assert_1.strict.ok(Math.abs(r - 0.026) < 1e-9);
        });
        it('honours a positive numeric override', () => {
            const r = (0, copilot_1.copilotUsdPerPremiumRequest)({ COPILOT_USD_PER_PREMIUM_REQUEST: '0.05' });
            assert_1.strict.ok(Math.abs(r - 0.05) < 1e-9);
        });
        it('falls back to the default when the override is malformed', () => {
            const r = (0, copilot_1.copilotUsdPerPremiumRequest)({ COPILOT_USD_PER_PREMIUM_REQUEST: 'banana' });
            assert_1.strict.ok(Math.abs(r - 0.026) < 1e-9);
        });
        it('falls back to the default when the override is non-positive', () => {
            const r = (0, copilot_1.copilotUsdPerPremiumRequest)({ COPILOT_USD_PER_PREMIUM_REQUEST: '0' });
            assert_1.strict.ok(Math.abs(r - 0.026) < 1e-9);
        });
    });
    describe('copilotApiEquivalentUsdPerPremiumRequest', () => {
        // The audit-and-corrections fix (DECISIONS.md 2026-05-09)
        // distinguishes the subscription-imputed per-request rate ($0.026 on
        // Pro+) from the API-equivalent rate (GPT-4-Turbo midpoint, $0.05).
        // The test pins both the default and the override path so a future
        // rate-card refresh has to update the constant *and* the test
        // intentionally.
        it('returns the GPT-4-Turbo-derived default when the env override is unset', () => {
            const r = (0, copilot_1.copilotApiEquivalentUsdPerPremiumRequest)({});
            assert_1.strict.ok(Math.abs(r - 0.05) < 1e-9);
        });
        it('honours a positive numeric override', () => {
            const r = (0, copilot_1.copilotApiEquivalentUsdPerPremiumRequest)({
                COPILOT_USD_PER_PREMIUM_REQUEST_API_EQUIV: '0.08',
            });
            assert_1.strict.ok(Math.abs(r - 0.08) < 1e-9);
        });
        it('falls back to the default when the override is malformed', () => {
            const r = (0, copilot_1.copilotApiEquivalentUsdPerPremiumRequest)({
                COPILOT_USD_PER_PREMIUM_REQUEST_API_EQUIV: 'banana',
            });
            assert_1.strict.ok(Math.abs(r - 0.05) < 1e-9);
        });
        it('falls back to the default when the override is non-positive', () => {
            const r = (0, copilot_1.copilotApiEquivalentUsdPerPremiumRequest)({
                COPILOT_USD_PER_PREMIUM_REQUEST_API_EQUIV: '0',
            });
            assert_1.strict.ok(Math.abs(r - 0.05) < 1e-9);
        });
    });
    describe('dollarsForRequestsByAuth', () => {
        it('reports dollarsBilled=0 under chatgpt auth', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, copilot_1.dollarsForRequestsByAuth)(4, 'chatgpt', {});
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.ok(dollarsTokenEstimate > 0);
        });
        it('reports dollarsBilled === dollarsTokenEstimate under api auth', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, copilot_1.dollarsForRequestsByAuth)(4, 'api', {});
            assert_1.strict.equal(dollarsBilled, dollarsTokenEstimate);
        });
        it('treats unknown auth as billed (conservative — bills full estimate)', () => {
            const { dollarsBilled, dollarsTokenEstimate } = (0, copilot_1.dollarsForRequestsByAuth)(4, 'unknown', {});
            assert_1.strict.equal(dollarsBilled, dollarsTokenEstimate);
        });
        it('returns 0/0/0 for zero requests', () => {
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, copilot_1.dollarsForRequestsByAuth)(0, 'api', {});
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.equal(dollarsTokenEstimate, 0);
            assert_1.strict.equal(dollarsApiEquivalent, 0);
        });
        it('reports a non-zero dollarsApiEquivalent under chatgpt auth (Phase 3 shape)', () => {
            // 1 Premium request under Pro+ subscription:
            //   billed         = 0          (subscription)
            //   tokenEstimate  = $0.026     (subscription-imputed)
            //   apiEquivalent  = $0.05      (GPT-4-Turbo per-request)
            const { dollarsBilled, dollarsTokenEstimate, dollarsApiEquivalent } = (0, copilot_1.dollarsForRequestsByAuth)(1, 'chatgpt', {});
            assert_1.strict.equal(dollarsBilled, 0);
            assert_1.strict.ok(Math.abs(dollarsTokenEstimate - 0.026) < 1e-9);
            assert_1.strict.ok(Math.abs(dollarsApiEquivalent - 0.05) < 1e-9);
            // The two columns are intentionally distinct: subscription
            // pricing flatters tokenEstimate-basis comparisons.
            assert_1.strict.notEqual(dollarsTokenEstimate, dollarsApiEquivalent);
        });
        it('honours both rate-card env overrides independently', () => {
            const env = {
                COPILOT_USD_PER_PREMIUM_REQUEST: '0.04',
                COPILOT_USD_PER_PREMIUM_REQUEST_API_EQUIV: '0.10',
            };
            const { dollarsTokenEstimate, dollarsApiEquivalent } = (0, copilot_1.dollarsForRequestsByAuth)(3, 'chatgpt', env);
            assert_1.strict.ok(Math.abs(dollarsTokenEstimate - 0.12) < 1e-9);
            assert_1.strict.ok(Math.abs(dollarsApiEquivalent - 0.3) < 1e-9);
        });
    });
    describe('parseCopilotPremiumRequests', () => {
        it('parses the canonical "Requests N Premium (Ts)" line', () => {
            const stderr = [
                'Changes   +2 -0',
                'Requests  4 Premium (112s)',
                'Tokens    ↑ 1234',
            ].join('\n');
            assert_1.strict.equal((0, copilot_1.parseCopilotPremiumRequests)(stderr), 4);
        });
        it('returns null when the marker is absent', () => {
            assert_1.strict.equal((0, copilot_1.parseCopilotPremiumRequests)('no marker here'), null);
        });
        it('returns null on the empty string', () => {
            assert_1.strict.equal((0, copilot_1.parseCopilotPremiumRequests)(''), null);
        });
        it('parses zero as a valid count', () => {
            assert_1.strict.equal((0, copilot_1.parseCopilotPremiumRequests)('Requests 0 Premium (1s)'), 0);
        });
    });
});
