"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const anthropic_extractor_1 = require("../../src/contract/extractor/anthropic-extractor");
const loader_1 = require("../../src/contract/schema/loader");
/**
 * The Anthropic extractor's submit_contract tool input_schema is the
 * authoritative shape Phase-1-and-7 obligations must satisfy when emitted
 * by the production extractor. Failing this test means the extractor's
 * schema and the on-disk contract schema have drifted and a new
 * obligation type can't reach a real contract from a natural-language
 * goal.
 */
const repoContext = {
    repoRoot: '/tmp/example',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    language: 'typescript',
};
function fakeAnthropicClient(toolUse) {
    return {
        messages: {
            create: async () => ({ content: [toolUse] }),
        },
    };
}
/**
 * Cast a fake client through `unknown` into the constructor's options
 * shape. The extractor only ever calls `messages.create()`, so the fake
 * is enough at runtime; static typing wants the full Anthropic surface.
 * `exactOptionalPropertyTypes` in this project rejects `client: undefined`,
 * which a direct cast through `ConstructorParameters[0]['client']` would
 * pull in via the optional-property union; this helper drops the union.
 */
function asExtractorOpts(client) {
    return { client };
}
describe('contract/extractor/anthropic-extractor', () => {
    it('returns every obligation type the model emits via tool-use, including all Phase 7 shapes', async () => {
        const all8 = [
            { type: 'file-must-exist', path: 'src/handler.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
            {
                type: 'function-must-have-signature',
                file: 'src/handler.ts',
                name: 'handler',
                signature: '(req: Request): Promise<Response>',
            },
            {
                type: 'property-must-hold',
                predicate: '! grep -r "eval(" src',
                target: 'no eval() calls in src',
            },
            {
                type: 'import-graph-must-satisfy',
                constraint: 'no-cycles',
                scope: 'src',
            },
            {
                type: 'coverage-must-exceed',
                scope: 'coverage/coverage-summary.json',
                metric: 'lines',
                threshold: 90,
            },
            {
                type: 'performance-must-not-regress',
                benchmark: 'node bench.js',
                baseline: 'bench/baseline.json',
                threshold: 0.1,
            },
        ];
        const fakeClient = fakeAnthropicClient({
            type: 'tool_use',
            name: 'submit_contract',
            input: { obligations: all8 },
        });
        // The fake client doesn't satisfy the full Anthropic SDK shape; the extractor
        // calls only `messages.create()`. Cast through unknown to bypass nominal typing.
        const ext = new anthropic_extractor_1.AnthropicExtractor(asExtractorOpts(fakeClient));
        const out = await ext.extract({ goal: 'demo', repoContext });
        assert_1.strict.equal(out.obligations.length, 8);
        assert_1.strict.deepEqual(out.obligations.map((o) => o.type).sort(), [
            'build-must-pass',
            'coverage-must-exceed',
            'file-must-exist',
            'function-must-have-signature',
            'import-graph-must-satisfy',
            'performance-must-not-regress',
            'property-must-hold',
            'test-must-pass',
        ]);
        // And every emitted obligation must be valid against the on-disk schema.
        const validate = (0, loader_1.obligationValidator)();
        for (const obligation of out.obligations) {
            const ok = validate(obligation);
            assert_1.strict.ok(ok, `extractor emitted ${obligation.type} that fails the on-disk schema: ${JSON.stringify(validate.errors)}`);
        }
    });
    it('records provenance.name = "anthropic" and a non-null prompt sha', async () => {
        const fakeClient = fakeAnthropicClient({
            type: 'tool_use',
            name: 'submit_contract',
            input: {
                obligations: [
                    { type: 'build-must-pass', command: 'npm run build' },
                    { type: 'test-must-pass', command: 'npm test' },
                ],
            },
        });
        const ext = new anthropic_extractor_1.AnthropicExtractor(asExtractorOpts(fakeClient));
        const out = await ext.extract({ goal: 'g', repoContext });
        assert_1.strict.equal(out.provenance.name, 'anthropic');
        assert_1.strict.ok(typeof out.provenance.promptSha256 === 'string' && out.provenance.promptSha256.length === 64);
    });
    it('parses obligations even when the model double-encodes them as a JSON string', async () => {
        // Real failure mode observed against Sonnet: tool_use payload arrives as
        // `{ obligations: "[...json text...]" }` instead of a real array. The
        // extractor must recover by JSON.parsing the string, otherwise the run
        // dies before any work happens.
        const obligations = [
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'test-must-pass', command: 'npm test' },
        ];
        const fakeClient = {
            messages: {
                create: async () => ({
                    content: [
                        {
                            type: 'tool_use',
                            name: 'submit_contract',
                            input: { obligations: JSON.stringify(obligations) },
                        },
                    ],
                }),
            },
        };
        const ext = new anthropic_extractor_1.AnthropicExtractor(asExtractorOpts(fakeClient));
        const out = await ext.extract({ goal: 'g', repoContext });
        assert_1.strict.deepEqual(out.obligations, obligations);
    });
    it('throws a clear error when the model returns no tool_use block', async () => {
        const fakeClient = {
            messages: {
                create: async () => ({ content: [{ type: 'text', text: 'sorry' }] }),
            },
        };
        const ext = new anthropic_extractor_1.AnthropicExtractor(asExtractorOpts(fakeClient));
        await assert_1.strict.rejects(ext.extract({ goal: 'g', repoContext }), /no tool_use block/);
    });
});
