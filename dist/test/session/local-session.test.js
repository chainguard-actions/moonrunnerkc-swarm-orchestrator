"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const local_session_1 = require("../../src/session/local-session");
class FakeBackend {
    responseText;
    grammars;
    name = 'fake';
    lastRequest = null;
    streamChunks;
    constructor(responseText, grammars = ['gbnf', 'none'], streamChunks = []) {
        this.responseText = responseText;
        this.grammars = grammars;
        this.streamChunks = streamChunks;
    }
    supportsGrammar() {
        return this.grammars;
    }
    async chat(request) {
        this.lastRequest = request;
        return {
            text: this.responseText,
            usage: { inputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 2 },
            usageEstimated: false,
        };
    }
    async stream(request, observer) {
        this.lastRequest = request;
        let partialText = '';
        let aborted = false;
        for (const chunk of this.streamChunks) {
            partialText += chunk;
            if (!observer({ chunk, partialText })) {
                aborted = true;
                break;
            }
        }
        return {
            text: partialText,
            usage: { inputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 2 },
            usageEstimated: false,
            aborted,
        };
    }
}
function makeRequest(personaId, userMessage = 'do the thing') {
    return {
        personaId,
        personaSystemSuffix: 'persona-suffix',
        sampling: { temperature: 0, maxTokens: 256 },
        userMessage,
    };
}
describe('session — LocalSession', () => {
    it('renders system content as projectContext + persona suffix', async () => {
        const backend = new FakeBackend('no-op');
        const session = new local_session_1.LocalSession({
            projectContext: 'CTX',
            backend,
            model: 'fake-model',
        });
        await session.complete(makeRequest('architect'));
        node_assert_1.strict.ok(backend.lastRequest);
        const sys = backend.lastRequest.messages[0];
        node_assert_1.strict.equal(sys?.role, 'system');
        node_assert_1.strict.ok(sys?.content.startsWith('CTX'));
        node_assert_1.strict.ok(sys?.content.includes('persona-suffix'));
    });
    it('reports gbnf as the resolved grammar when the backend supports it', async () => {
        const backend = new FakeBackend('no-op', ['gbnf']);
        const session = new local_session_1.LocalSession({
            projectContext: 'CTX',
            backend,
            model: 'fake-model',
        });
        await session.complete(makeRequest('architect'));
        node_assert_1.strict.equal(session.providerInfo().grammar, 'gbnf');
        node_assert_1.strict.equal(backend.lastRequest?.grammar?.kind, 'gbnf');
    });
    it('falls back to no grammar when the backend supports none', async () => {
        const backend = new FakeBackend('no-op', ['none']);
        const session = new local_session_1.LocalSession({
            projectContext: 'CTX',
            backend,
            model: 'fake-model',
        });
        await session.complete(makeRequest('architect'));
        node_assert_1.strict.equal(session.providerInfo().grammar, 'none');
        node_assert_1.strict.equal(backend.lastRequest?.grammar?.kind, 'none');
    });
    it('routes models via personaModelMap', async () => {
        const backend = new FakeBackend('no-op');
        const session = new local_session_1.LocalSession({
            projectContext: 'CTX',
            backend,
            model: 'default-model',
            personaModelMap: { architect: 'arch-model' },
        });
        await session.complete(makeRequest('architect'));
        node_assert_1.strict.equal(backend.lastRequest?.model, 'arch-model');
        await session.complete(makeRequest('implementer'));
        node_assert_1.strict.equal(backend.lastRequest?.model, 'default-model');
    });
    it('accumulates usage across calls', async () => {
        const backend = new FakeBackend('no-op');
        const session = new local_session_1.LocalSession({ projectContext: 'CTX', backend, model: 'm' });
        await session.complete(makeRequest('p'));
        await session.complete(makeRequest('p'));
        const total = session.totalUsage();
        node_assert_1.strict.equal(total.inputTokens, 2);
        node_assert_1.strict.equal(total.outputTokens, 4);
    });
    it('forwards stream chunks to the observer in order', async () => {
        const backend = new FakeBackend('', ['gbnf'], ['ab', 'cd', 'ef']);
        const session = new local_session_1.LocalSession({ projectContext: 'CTX', backend, model: 'm' });
        const seen = [];
        const result = await session.stream(makeRequest('p'), (event) => {
            seen.push(event.chunk);
            return { kind: 'continue' };
        });
        node_assert_1.strict.deepEqual(seen, ['ab', 'cd', 'ef']);
        node_assert_1.strict.equal(result.aborted, false);
        node_assert_1.strict.equal(result.response.text, 'abcdef');
    });
    it('honors a mid-stream abort', async () => {
        const backend = new FakeBackend('', ['gbnf'], ['ab', 'cd', 'ef']);
        const session = new local_session_1.LocalSession({ projectContext: 'CTX', backend, model: 'm' });
        const result = await session.stream(makeRequest('p'), () => ({
            kind: 'abort',
            reason: 'test',
        }));
        node_assert_1.strict.equal(result.aborted, true);
        node_assert_1.strict.equal(result.abortReason, 'test');
    });
});
