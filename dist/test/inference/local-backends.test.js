"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const openai_compatible_1 = require("../../src/inference/local/backends/openai-compatible");
const ollama_1 = require("../../src/inference/local/backends/ollama");
const llama_cpp_1 = require("../../src/inference/local/backends/llama-cpp");
const vllm_1 = require("../../src/inference/local/backends/vllm");
function mockFetchReturning(json) {
    const calls = [];
    const fetchImpl = (async (url, init) => {
        const headers = {};
        if (init?.headers) {
            for (const [k, v] of Object.entries(init.headers)) {
                headers[k.toLowerCase()] = v;
            }
        }
        calls.push({
            url,
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
            headers,
        });
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(json),
            body: null,
        };
    });
    return { fetchImpl, calls };
}
function mockFetchErroring(status, body) {
    return (async () => ({
        ok: false,
        status,
        text: async () => body,
    }));
}
describe('inference/local — OpenAiCompatibleBackend', () => {
    it('advertises json-schema grammar support', () => {
        const backend = new openai_compatible_1.OpenAiCompatibleBackend({ baseUrl: 'http://x', fetch: mockFetchReturning({}).fetchImpl });
        node_assert_1.strict.deepEqual([...backend.supportsGrammar()].sort(), ['json-schema', 'none']);
    });
    it('posts to /v1/chat/completions with the expected body and parses usage', async () => {
        const { fetchImpl, calls } = mockFetchReturning({
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
        });
        const backend = new openai_compatible_1.OpenAiCompatibleBackend({
            baseUrl: 'http://x/',
            apiKey: 'sk-test',
            fetch: fetchImpl,
        });
        const r = await backend.chat({
            model: 'm',
            messages: [{ role: 'user', content: 'hi' }],
            temperature: 0,
            maxTokens: 32,
            seed: 7,
            grammar: { kind: 'json-schema', schema: { type: 'object' } },
        });
        node_assert_1.strict.equal(r.text, 'hello');
        node_assert_1.strict.equal(r.usage.inputTokens, 12);
        node_assert_1.strict.equal(r.usage.outputTokens, 3);
        node_assert_1.strict.equal(r.usageEstimated, false);
        node_assert_1.strict.equal(calls.length, 1);
        node_assert_1.strict.equal(calls[0].url, 'http://x/v1/chat/completions');
        node_assert_1.strict.equal(calls[0].headers.authorization, 'Bearer sk-test');
        const body = calls[0].body;
        node_assert_1.strict.equal(body.model, 'm');
        node_assert_1.strict.equal(body.temperature, 0);
        node_assert_1.strict.equal(body.seed, 7);
        node_assert_1.strict.ok(body.response_format, 'response_format should be set when grammar is json-schema');
    });
    it('surfaces a corrective message on HTTP errors', async () => {
        const backend = new openai_compatible_1.OpenAiCompatibleBackend({
            baseUrl: 'http://x',
            fetch: mockFetchErroring(503, 'overloaded'),
        });
        await node_assert_1.strict.rejects(() => backend.chat({ model: 'm', messages: [], temperature: 0, maxTokens: 32 }), /503.*overloaded/);
    });
});
describe('inference/local — OllamaBackend', () => {
    it('advertises json-schema grammar support', () => {
        const backend = new ollama_1.OllamaBackend({ baseUrl: 'http://x', fetch: mockFetchReturning({}).fetchImpl });
        node_assert_1.strict.deepEqual([...backend.supportsGrammar()].sort(), ['json-schema', 'none']);
    });
    it('posts to /api/chat with the expected body and parses usage', async () => {
        const { fetchImpl, calls } = mockFetchReturning({
            message: { content: 'hello' },
            prompt_eval_count: 20,
            eval_count: 5,
        });
        const backend = new ollama_1.OllamaBackend({ baseUrl: 'http://x', fetch: fetchImpl });
        const r = await backend.chat({
            model: 'llama-x',
            messages: [{ role: 'user', content: 'hi' }],
            temperature: 0,
            maxTokens: 64,
            seed: 11,
            grammar: { kind: 'json-schema', schema: { type: 'object' } },
        });
        node_assert_1.strict.equal(r.text, 'hello');
        node_assert_1.strict.equal(r.usage.inputTokens, 20);
        node_assert_1.strict.equal(r.usage.outputTokens, 5);
        node_assert_1.strict.equal(r.usageEstimated, false);
        node_assert_1.strict.equal(calls[0].url, 'http://x/api/chat');
        const body = calls[0].body;
        node_assert_1.strict.equal(body.model, 'llama-x');
        node_assert_1.strict.equal(body.stream, false);
        node_assert_1.strict.deepEqual(body.format, { type: 'object' });
        const opts = body.options;
        node_assert_1.strict.equal(opts.seed, 11);
        node_assert_1.strict.equal(opts.num_predict, 64);
    });
});
describe('inference/local — LlamaCppBackend', () => {
    it('advertises gbnf grammar support', () => {
        const backend = new llama_cpp_1.LlamaCppBackend({ baseUrl: 'http://x', fetch: mockFetchReturning({}).fetchImpl });
        node_assert_1.strict.deepEqual([...backend.supportsGrammar()].sort(), ['gbnf', 'none']);
    });
    it('posts to /completion with the expected body and parses usage', async () => {
        const { fetchImpl, calls } = mockFetchReturning({
            content: 'no-op',
            tokens_evaluated: 30,
            tokens_predicted: 4,
        });
        const backend = new llama_cpp_1.LlamaCppBackend({ baseUrl: 'http://x', fetch: fetchImpl });
        const r = await backend.chat({
            model: 'unused',
            messages: [
                { role: 'system', content: 'sys' },
                { role: 'user', content: 'hi' },
            ],
            temperature: 0,
            maxTokens: 32,
            grammar: { kind: 'gbnf', grammar: 'root ::= "no-op"' },
        });
        node_assert_1.strict.equal(r.text, 'no-op');
        node_assert_1.strict.equal(r.usage.inputTokens, 30);
        node_assert_1.strict.equal(r.usage.outputTokens, 4);
        const body = calls[0].body;
        node_assert_1.strict.equal(typeof body.prompt, 'string');
        node_assert_1.strict.match(body.prompt, /### System\nsys/);
        node_assert_1.strict.match(body.prompt, /### User\nhi/);
        node_assert_1.strict.equal(body.grammar, 'root ::= "no-op"');
        node_assert_1.strict.equal(body.cache_prompt, true);
    });
});
describe('inference/local — VllmBackend', () => {
    it('advertises json-schema grammar support', () => {
        const backend = new vllm_1.VllmBackend({ baseUrl: 'http://x', fetch: mockFetchReturning({}).fetchImpl });
        node_assert_1.strict.deepEqual([...backend.supportsGrammar()].sort(), ['json-schema', 'none']);
    });
    it('posts to /v1/chat/completions with guided_json and parses cache hits', async () => {
        const { fetchImpl, calls } = mockFetchReturning({
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 12, completion_tokens: 3, cached_tokens: 8 },
        });
        const backend = new vllm_1.VllmBackend({ baseUrl: 'http://x', fetch: fetchImpl });
        const r = await backend.chat({
            model: 'm',
            messages: [{ role: 'user', content: 'hi' }],
            temperature: 0,
            maxTokens: 64,
            grammar: { kind: 'json-schema', schema: { type: 'object' } },
        });
        node_assert_1.strict.equal(r.text, 'hello');
        node_assert_1.strict.equal(r.usage.cacheReadTokens, 8);
        node_assert_1.strict.equal(r.usage.inputTokens, 12);
        const body = calls[0].body;
        node_assert_1.strict.deepEqual(body.guided_json, { type: 'object' });
    });
});
