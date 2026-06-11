"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const repoContext = {
    repoRoot: '/tmp/example',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    language: 'typescript',
};
describe('contract/extractor/stub-extractor', () => {
    it('fromObligations returns the same fixed list for every input', async () => {
        const ext = stub_extractor_1.StubExtractor.fromObligations([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        const out1 = await ext.extract({ goal: 'goal-one', repoContext });
        const out2 = await ext.extract({ goal: 'goal-two', repoContext });
        assert_1.strict.deepEqual(out1.obligations, out2.obligations);
    });
    it('fromGoalMap looks up by goal and falls back when missing', async () => {
        const ext = stub_extractor_1.StubExtractor.fromGoalMap({
            mapped: [
                { type: 'file-must-exist', path: 'mapped.ts' },
                { type: 'build-must-pass', command: 'mapped-build' },
                { type: 'test-must-pass', command: 'mapped-test' },
            ],
        });
        const hit = await ext.extract({ goal: 'mapped', repoContext });
        assert_1.strict.equal(hit.obligations.find((o) => o.type === 'file-must-exist')?.type, 'file-must-exist');
        const miss = await ext.extract({ goal: 'unmapped goal', repoContext });
        // fallback heuristic always emits build + test
        assert_1.strict.ok(miss.obligations.some((o) => o.type === 'build-must-pass'));
        assert_1.strict.ok(miss.obligations.some((o) => o.type === 'test-must-pass'));
    });
    it('default heuristic uses repoContext build/test commands', async () => {
        const ext = stub_extractor_1.StubExtractor.fromHeuristic();
        const out = await ext.extract({ goal: 'add a thing', repoContext });
        const build = out.obligations.find((o) => o.type === 'build-must-pass');
        const test = out.obligations.find((o) => o.type === 'test-must-pass');
        assert_1.strict.ok(build && build.type === 'build-must-pass' && build.command === 'npm run build');
        assert_1.strict.ok(test && test.type === 'test-must-pass' && test.command === 'npm test');
    });
    it('records provenance.name = "stub"', async () => {
        const ext = stub_extractor_1.StubExtractor.fromHeuristic();
        const out = await ext.extract({ goal: 'g', repoContext });
        assert_1.strict.equal(out.provenance.name, 'stub');
        assert_1.strict.equal(out.provenance.model, null);
        assert_1.strict.equal(out.provenance.temperature, null);
        assert_1.strict.equal(out.provenance.promptSha256, null);
    });
});
