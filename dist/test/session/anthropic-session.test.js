"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const anthropic_session_1 = require("../../src/session/anthropic-session");
function fakeClient(responder) {
    const calls = [];
    const client = {
        messages: {
            create: async (args) => {
                calls.push(args);
                return responder(args);
            },
        },
    };
    return { client, calls };
}
describe('session/AnthropicSession', () => {
    it('places project context as a cache_control system block, persona suffix after', async () => {
        const { client, calls } = fakeClient(() => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 },
            model: 'claude-sonnet-4-6',
            stop_reason: 'end_turn',
        }));
        const session = new anthropic_session_1.AnthropicSession({
            client: client,
            projectContext: 'PROJECT_CTX',
            apiKey: 'k',
        });
        await session.complete({
            personaId: 'architect',
            personaSystemSuffix: 'SUFFIX',
            sampling: { temperature: 0.2, maxTokens: 100 },
            userMessage: 'hello',
        });
        assert_1.strict.equal(calls.length, 1);
        const call = calls[0];
        assert_1.strict.ok(call);
        assert_1.strict.ok(Array.isArray(call.system));
        const system = call.system;
        assert_1.strict.equal(system.length, 2);
        assert_1.strict.equal(system[0]?.text, 'PROJECT_CTX');
        assert_1.strict.deepEqual(system[0]?.cache_control, { type: 'ephemeral' });
        assert_1.strict.equal(system[1]?.text, 'SUFFIX');
        // Persona suffix block is NOT cache-controlled (per-call dynamic).
        assert_1.strict.equal(system[1]?.cache_control, undefined);
    });
    it('accumulates totalUsage across calls', async () => {
        const responses = [
            {
                content: [{ type: 'text', text: 'a' }],
                usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 },
                model: 'm',
                stop_reason: 'end_turn',
            },
            {
                content: [{ type: 'text', text: 'b' }],
                usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
                model: 'm',
                stop_reason: 'end_turn',
            },
        ];
        let i = 0;
        const { client } = fakeClient(() => responses[i++]);
        const session = new anthropic_session_1.AnthropicSession({
            client: client,
            projectContext: 'CTX',
            apiKey: 'k',
        });
        await session.complete({
            personaId: 'a',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: '',
        });
        await session.complete({
            personaId: 'a',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: '',
        });
        const total = session.totalUsage();
        assert_1.strict.equal(total.inputTokens, 10);
        assert_1.strict.equal(total.outputTokens, 2);
        assert_1.strict.equal(total.cacheCreationTokens, 100);
        assert_1.strict.equal(total.cacheReadTokens, 100);
    });
    it('readAnthropicUsage tolerates missing or null cache fields', () => {
        assert_1.strict.deepEqual((0, anthropic_session_1.readAnthropicUsage)(undefined), {
            inputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 0,
        });
        assert_1.strict.deepEqual((0, anthropic_session_1.readAnthropicUsage)({ input_tokens: 1, output_tokens: 2 }), {
            inputTokens: 1,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 2,
        });
        assert_1.strict.deepEqual((0, anthropic_session_1.readAnthropicUsage)({
            input_tokens: 1,
            output_tokens: 2,
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
        }), { inputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 2 });
    });
    it('respects per-request model override', async () => {
        const { client, calls } = fakeClient(() => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: 'override',
            stop_reason: 'end_turn',
        }));
        const session = new anthropic_session_1.AnthropicSession({
            client: client,
            projectContext: '',
            apiKey: 'k',
            model: 'default',
        });
        await session.complete({
            personaId: 'a',
            personaSystemSuffix: '',
            sampling: { temperature: 0, maxTokens: 1 },
            userMessage: 'x',
            model: 'override',
        });
        assert_1.strict.equal(calls[0]?.model, 'override');
    });
});
