"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const pr_source_1 = require("../../../src/audit/pr-source");
describe('audit / pr-source / detectAgent', () => {
    it('identifies Devin from the bot author with high confidence', () => {
        const att = (0, pr_source_1.detectAgent)({ authors: ['devin-ai-integration[bot]'] });
        assert_1.strict.equal(att?.vendor, 'devin');
        assert_1.strict.equal(att?.confidence, 'high');
        assert_1.strict.equal(att?.source, 'bot-author');
    });
    it('identifies Claude Code from a "Generated with Claude Code" PR body', () => {
        const att = (0, pr_source_1.detectAgent)({
            prBody: 'Generated with [Claude Code](https://claude.com/claude-code)',
        });
        assert_1.strict.equal(att?.vendor, 'claude-code');
        assert_1.strict.equal(att?.confidence, 'high');
        assert_1.strict.equal(att?.source, 'pr-body-marker');
    });
    it('identifies Claude Code from a Co-Authored-By trailer in commit messages', () => {
        const att = (0, pr_source_1.detectAgent)({
            commitMessages: ['fix: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>'],
        });
        assert_1.strict.equal(att?.vendor, 'claude-code');
        assert_1.strict.equal(att?.source, 'commit-marker');
    });
    it('extracts a version when a Claude model number is present', () => {
        const att = (0, pr_source_1.detectAgent)({
            prBody: 'Generated with Claude Code (Opus 4.7)',
        });
        assert_1.strict.equal(att?.vendor, 'claude-code');
        assert_1.strict.equal(att?.version, '4.7');
    });
    it('falls back to medium confidence on branch-name pattern', () => {
        const att = (0, pr_source_1.detectAgent)({ headRef: 'cursor/feature-add-foo' });
        assert_1.strict.equal(att?.vendor, 'cursor');
        assert_1.strict.equal(att?.confidence, 'medium');
        assert_1.strict.equal(att?.source, 'branch-name');
    });
    it('returns undefined when no signal is present', () => {
        const att = (0, pr_source_1.detectAgent)({
            prTitle: 'plain human PR',
            prBody: 'no markers here',
            headRef: 'main',
        });
        assert_1.strict.equal(att, undefined);
    });
});
