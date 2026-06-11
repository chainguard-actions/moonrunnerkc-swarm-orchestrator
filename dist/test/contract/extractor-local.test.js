"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const local_extractor_1 = require("../../src/contract/extractor/local-extractor");
class FakeBackend {
    responseText;
    grammars;
    name = 'fake';
    lastRequest = null;
    constructor(responseText, grammars = ['json-schema', 'none']) {
        this.responseText = responseText;
        this.grammars = grammars;
    }
    supportsGrammar() {
        return this.grammars;
    }
    async chat(request) {
        this.lastRequest = request;
        return {
            text: this.responseText,
            usage: { inputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 1 },
            usageEstimated: false,
        };
    }
    async stream(_request, _observer) {
        throw new Error('not used in these tests');
    }
}
const REPO_CTX = {
    repoRoot: '/tmp',
    buildCommand: null,
    testCommand: null,
    language: 'unknown',
};
describe('contract/extractor — LocalExtractor', () => {
    it('parses a JSON-only response into obligations', async () => {
        const backend = new FakeBackend(JSON.stringify({ obligations: [{ type: 'test-must-pass', command: 'npm test' }] }));
        const extractor = new local_extractor_1.LocalExtractor({ backend, model: 'fake-model' });
        const out = await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
        node_assert_1.strict.equal(out.obligations.length, 1);
        node_assert_1.strict.equal(out.provenance.name, 'local');
        node_assert_1.strict.equal(out.provenance.model, 'fake-model');
        node_assert_1.strict.ok(backend.lastRequest);
        node_assert_1.strict.equal(backend.lastRequest.grammar?.kind, 'json-schema');
    });
    it('strips a leading ```json fence when present', async () => {
        const fenced = '```json\n' +
            JSON.stringify({ obligations: [{ type: 'test-must-pass', command: 'npm test' }] }) +
            '\n```';
        const backend = new FakeBackend(fenced);
        const extractor = new local_extractor_1.LocalExtractor({ backend, model: 'fake-model' });
        const out = await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
        node_assert_1.strict.equal(out.obligations.length, 1);
    });
    it('skips grammar when the backend does not support json-schema', async () => {
        const backend = new FakeBackend(JSON.stringify({ obligations: [{ type: 'test-must-pass', command: 'npm test' }] }), ['gbnf']);
        const extractor = new local_extractor_1.LocalExtractor({ backend, model: 'fake-model' });
        await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
        node_assert_1.strict.ok(backend.lastRequest);
        node_assert_1.strict.equal(backend.lastRequest.grammar, undefined);
    });
    it('throws a corrective error when the backend returns non-JSON', async () => {
        const backend = new FakeBackend('Here is your contract...');
        const extractor = new local_extractor_1.LocalExtractor({ backend, model: 'fake-model' });
        await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /not valid JSON/);
    });
    it('throws when the JSON lacks an obligations array', async () => {
        const backend = new FakeBackend(JSON.stringify({ data: [] }));
        const extractor = new local_extractor_1.LocalExtractor({ backend, model: 'fake-model' });
        await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /without an obligations array/);
    });
});
