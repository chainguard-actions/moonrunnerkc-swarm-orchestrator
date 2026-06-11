"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const report_comment_1 = require("../../../src/audit/report-comment");
const PASS_RESULT = {
    pass: true,
    findings: [],
    generatedAt: '2026-05-23T00:00:00.000Z',
    detectorVersions: { 'test-relaxation': '1.0.0' },
};
const BLOCK_RESULT = {
    pass: false,
    generatedAt: '2026-05-23T00:00:00.000Z',
    detectorVersions: { 'test-relaxation': '1.0.0', 'assertion-strip': '1.0.0' },
    agent: { vendor: 'claude-code', version: '4.7', confidence: 'high', source: 'bot-author' },
    findings: [
        {
            category: 'test-relaxation',
            severity: 'block',
            message: 'Strict matcher swapped for loose.',
            location: { file: 'foo.test.ts', line: 12 },
            evidence: '- expect(x).toBe(1)\n+ expect(x).toBeDefined()',
        },
        {
            category: 'no-op-fix',
            severity: 'warn',
            message: 'Symbol mismatch.',
            location: { file: 'bar.test.ts', line: 4 },
            evidence: '(no overlap)',
        },
    ],
};
describe('audit / report-comment', () => {
    it('renders a PASS header for a clean audit', () => {
        const md = (0, report_comment_1.renderPrComment)(PASS_RESULT);
        assert_1.strict.ok(md.startsWith('# Swarm Audit: PASS\n'));
    });
    it('renders a BLOCK header when there are blocking findings', () => {
        const md = (0, report_comment_1.renderPrComment)(BLOCK_RESULT);
        assert_1.strict.ok(md.startsWith('# Swarm Audit: BLOCK\n'));
    });
    it('renders the agent attribution line', () => {
        const md = (0, report_comment_1.renderPrComment)(BLOCK_RESULT);
        assert_1.strict.ok(md.includes('Detected agent:'));
        assert_1.strict.ok(md.includes('`claude-code`'));
        assert_1.strict.ok(md.includes('v4.7'));
    });
    it('renders findings grouped by severity in the canonical order', () => {
        const md = (0, report_comment_1.renderPrComment)(BLOCK_RESULT);
        const blockIdx = md.indexOf('Blocking');
        const warnIdx = md.indexOf('Warning');
        assert_1.strict.notEqual(blockIdx, -1);
        assert_1.strict.notEqual(warnIdx, -1);
        assert_1.strict.ok(blockIdx < warnIdx);
    });
    it('includes ledger and AIBOM links when provided', () => {
        const md = (0, report_comment_1.renderPrComment)(PASS_RESULT, {
            ledgerUrl: 'https://example.com/ledger.jsonl',
            aibomUrl: 'https://example.com/aibom.json',
            leaderboardUrl: 'https://moonrunnerkc.github.io/swarm-orchestrator/',
        });
        assert_1.strict.ok(md.includes('https://example.com/ledger.jsonl'));
        assert_1.strict.ok(md.includes('https://example.com/aibom.json'));
        assert_1.strict.ok(md.includes('https://moonrunnerkc.github.io/swarm-orchestrator/'));
    });
    it('produces deterministic output for a fixed input', () => {
        const a = (0, report_comment_1.renderPrComment)(BLOCK_RESULT);
        const b = (0, report_comment_1.renderPrComment)(BLOCK_RESULT);
        assert_1.strict.equal(a, b);
    });
});
