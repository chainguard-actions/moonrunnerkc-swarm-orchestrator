"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VllmBackend = void 0;
const backend_1 = require("../backend");
/**
 * Backend for vLLM's OpenAI-compatible HTTP server. vLLM accepts the same
 * `/v1/chat/completions` shape as the {@link OpenAiCompatibleBackend}, plus
 * a `guided_json` extras field for grammar-constrained decoding against a
 * JSON Schema. The OpenAI-compatible response_format path is also supported
 * by recent vLLM builds; this backend prefers `guided_json` because it has
 * been the stable surface across versions.
 *
 * Prefix-cache mapping: vLLM honors `enable_prefix_caching` at server
 * startup. When enabled, the server reports `cached_tokens` in the usage
 * block — the backend surfaces that as `cacheReadTokens` for the cost
 * model.
 */
class VllmBackend {
    name = 'vllm';
    baseUrl;
    apiKey;
    timeoutMs;
    fetchImpl;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.apiKey = options.apiKey ?? null;
        this.timeoutMs = options.requestTimeoutMs ?? backend_1.DEFAULT_REQUEST_TIMEOUT_MS;
        this.fetchImpl = options.fetch ?? fetch;
    }
    supportsGrammar() {
        return ['json-schema', 'none'];
    }
    async chat(request) {
        const body = buildVllmBody(request, false);
        const response = await this.fetchWithTimeout('/v1/chat/completions', body);
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`vllm backend /v1/chat/completions returned ${response.status}: ${truncate(text, 200)}`);
        }
        const parsed = safeParseJson(text);
        const content = parsed?.choices?.[0]?.message?.content ?? '';
        return {
            text: content,
            usage: vllmUsage(parsed?.usage),
            usageEstimated: parsed?.usage?.completion_tokens === undefined,
        };
    }
    async stream(request, observer) {
        const body = buildVllmBody(request, true);
        const response = await this.fetchWithTimeout('/v1/chat/completions', body);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`vllm backend stream failed (${response.status}): ${truncate(text, 200)}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('vllm backend stream: response has no body reader');
        const decoder = new TextDecoder('utf-8');
        let partialText = '';
        let buffered = '';
        let aborted = false;
        let usage = (0, backend_1.emptyBackendUsage)();
        let usageEstimated = true;
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffered += decoder.decode(value, { stream: true });
            const { events, remaining } = drainSseEvents(buffered);
            buffered = remaining;
            for (const evt of events) {
                if (evt === '[DONE]')
                    continue;
                const parsed = safeParseJson(evt);
                if (!parsed)
                    continue;
                const delta = parsed.choices?.[0]?.delta?.content ?? '';
                if (delta.length > 0) {
                    partialText += delta;
                    if (!observer({ chunk: delta, partialText })) {
                        aborted = true;
                        try {
                            await reader.cancel();
                        }
                        catch {
                            // Cancellation is best-effort.
                        }
                        break;
                    }
                }
                if (parsed.usage) {
                    usage = vllmUsage(parsed.usage);
                    usageEstimated = parsed.usage.completion_tokens === undefined;
                }
            }
            if (aborted)
                break;
        }
        return { text: partialText, usage, usageEstimated, aborted };
    }
    async fetchWithTimeout(endpoint, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const headers = { 'content-type': 'application/json' };
        if (this.apiKey)
            headers.authorization = `Bearer ${this.apiKey}`;
        try {
            return await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.VllmBackend = VllmBackend;
function buildVllmBody(request, stream) {
    const body = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream,
    };
    if (request.seed !== undefined && request.seed !== null)
        body.seed = request.seed;
    if (request.stop && request.stop.length > 0)
        body.stop = [...request.stop];
    if (request.grammar?.kind === 'json-schema') {
        body.guided_json = request.grammar.schema;
    }
    if (request.extras)
        Object.assign(body, request.extras);
    return body;
}
function vllmUsage(u) {
    return {
        inputTokens: u?.prompt_tokens ?? 0,
        cacheReadTokens: u?.cached_tokens ?? 0,
        cacheCreationTokens: 0,
        outputTokens: u?.completion_tokens ?? 0,
    };
}
function drainSseEvents(buffer) {
    const events = [];
    let cursor = 0;
    while (cursor < buffer.length) {
        const newlineIdx = buffer.indexOf('\n', cursor);
        if (newlineIdx === -1)
            break;
        const line = buffer.slice(cursor, newlineIdx).trimEnd();
        cursor = newlineIdx + 1;
        if (line.startsWith('data:')) {
            events.push(line.slice('data:'.length).trim());
        }
    }
    return { events, remaining: buffer.slice(cursor) };
}
function safeParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function truncate(text, max) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}...`;
}
