"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const stub_session_1 = require("../../src/session/stub-session");
describe('session/StubSession', () => {
    it('first call records cache-write tokens; subsequent calls record cache-read', async () => {
        const ctx = 'A'.repeat(400); // ~100 tokens
        const session = new stub_session_1.StubSession({ projectContext: ctx });
        const first = await session.complete({
            personaId: 'p',
            personaSystemSuffix: 'suffix',
            sampling: { temperature: 0, maxTokens: 64 },
            userMessage: 'hello',
        });
        assert_1.strict.ok(first.usage.cacheCreationTokens > 0);
        assert_1.strict.equal(first.usage.cacheReadTokens, 0);
        const second = await session.complete({
            personaId: 'p',
            personaSystemSuffix: 'suffix',
            sampling: { temperature: 0, maxTokens: 64 },
            userMessage: 'hello',
        });
        assert_1.strict.equal(second.usage.cacheCreationTokens, 0);
        assert_1.strict.ok(second.usage.cacheReadTokens > 0);
        assert_1.strict.equal(second.usage.cacheReadTokens, first.usage.cacheCreationTokens);
    });
    it('responder receives request and call index', async () => {
        const seen = [];
        const session = new stub_session_1.StubSession({
            projectContext: '',
            responder: (req, idx) => {
                seen.push({ id: req.personaId, idx });
                return `response-${idx}`;
            },
        });
        const r1 = await session.complete({
            personaId: 'a',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: '',
        });
        const r2 = await session.complete({
            personaId: 'b',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: '',
        });
        assert_1.strict.equal(r1.text, 'response-0');
        assert_1.strict.equal(r2.text, 'response-1');
        assert_1.strict.deepEqual(seen, [
            { id: 'a', idx: 0 },
            { id: 'b', idx: 1 },
        ]);
    });
    it('cumulative totalUsage matches the sum of per-call usages', async () => {
        const session = new stub_session_1.StubSession({ projectContext: 'ctx' });
        const a = await session.complete({
            personaId: 'p',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: 'one',
        });
        const b = await session.complete({
            personaId: 'p',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: 'two',
        });
        const total = session.totalUsage();
        assert_1.strict.equal(total.inputTokens, a.usage.inputTokens + b.usage.inputTokens);
        assert_1.strict.equal(total.outputTokens, a.usage.outputTokens + b.usage.outputTokens);
        assert_1.strict.equal(total.cacheReadTokens, b.usage.cacheReadTokens);
        assert_1.strict.equal(total.cacheCreationTokens, a.usage.cacheCreationTokens);
    });
    it('estimateTokens follows the 4-chars-per-token heuristic', () => {
        assert_1.strict.equal((0, stub_session_1.estimateTokens)(''), 0);
        assert_1.strict.equal((0, stub_session_1.estimateTokens)('abcd'), 1);
        assert_1.strict.equal((0, stub_session_1.estimateTokens)('abcde'), 2);
        assert_1.strict.equal((0, stub_session_1.estimateTokens)('a'.repeat(400)), 100);
    });
});
