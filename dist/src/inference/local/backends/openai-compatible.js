"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiCompatibleBackend = void 0;
const backend_1 = require("../backend");
/**
 * Backend for any OpenAI-compatible chat completions endpoint. Covers LM
 * Studio, LocalAI, Llamafile-server, llama.cpp's `--api` mode, vLLM's
 * OpenAI-compatible route, and any aggregator that speaks the same wire
 * format. The model id is whatever the server reports; nothing is
 * hardcoded.
 *
 * Grammar support: the backend advertises `json-schema` so the local
 * extractor can request structured output via `response_format` when the
 * server honors it. Servers that don't honor `response_format` simply
 * return prose; the caller falls back to soft-prompt parsing. The backend
 * does not silently retry — it surfaces the body it received.
 */
class OpenAiCompatibleBackend {
    name = 'openai-compatible';
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
        const body = buildChatRequestBody(request, false);
        const json = await this.postJson('/v1/chat/completions', body);
        return parseChatResponse(json);
    }
    async stream(request, observer) {
        const body = buildChatRequestBody(request, true);
        const response = await this.fetchWithTimeout('/v1/chat/completions', body);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`openai-compatible backend stream failed (${response.status}): ${truncate(text, 200)}`);
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('openai-compatible backend stream: response has no body reader');
        }
        const decoder = new TextDecoder('utf-8');
        let partialText = '';
        let buffered = '';
        let aborted = false;
        let usage = (0, backend_1.emptyBackendUsage)();
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffered += decoder.decode(value, { stream: true });
            const events = drainSseEvents(buffered);
            buffered = events.remaining;
            for (const evt of events.events) {
                if (evt === '[DONE]')
                    continue;
                const parsed = safeParseJson(evt);
                if (!parsed)
                    continue;
                const delta = parsed.choices?.[0]?.delta?.content ?? '';
                if (delta.length > 0) {
                    partialText += delta;
                    const keepGoing = observer({ chunk: delta, partialText });
                    if (!keepGoing) {
                        aborted = true;
                        try {
                            await reader.cancel();
                        }
                        catch {
                            // The reader may already be closed; cancellation is best-effort.
                        }
                        break;
                    }
                }
                if (parsed.usage)
                    usage = parsed.usage;
            }
            if (aborted)
                break;
        }
        return {
            text: partialText,
            usage,
            usageEstimated: usage.inputTokens === 0 && usage.outputTokens === 0,
            aborted,
        };
    }
    async postJson(endpoint, body) {
        const response = await this.fetchWithTimeout(endpoint, body);
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`openai-compatible backend ${endpoint} returned ${response.status}: ${truncate(text, 200)}`);
        }
        return safeParseJson(text);
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
exports.OpenAiCompatibleBackend = OpenAiCompatibleBackend;
function buildChatRequestBody(request, stream) {
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
        body.response_format = {
            type: 'json_schema',
            json_schema: { name: 'response', schema: request.grammar.schema, strict: true },
        };
    }
    if (request.extras)
        Object.assign(body, request.extras);
    return body;
}
function parseChatResponse(json) {
    const obj = json;
    const text = obj?.choices?.[0]?.message?.content ?? '';
    const u = obj?.usage ?? {};
    const usage = {
        inputTokens: u.prompt_tokens ?? 0,
        cacheReadTokens: u.prompt_cache_hit_tokens ?? 0,
        cacheCreationTokens: 0,
        outputTokens: u.completion_tokens ?? 0,
    };
    const usageEstimated = usage.inputTokens === 0 && usage.outputTokens === 0;
    return { text, usage, usageEstimated };
}
function drainSseEvents(buffer) {
    // OpenAI-style SSE: `data: <json>\n\n` per event. Some servers omit the
    // blank line between events; we handle both by splitting on either form.
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
