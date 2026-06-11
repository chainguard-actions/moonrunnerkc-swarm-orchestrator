"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const tagger_1 = require("../../src/contract/tagger");
const registry_1 = require("../../src/wasm/registry");
const available = new Set(registry_1.DEFAULT_STRATEGY_NAMES);
describe('contract/tagger', () => {
    it('tags a known-boilerplate file-must-exist with scaffold-template', () => {
        const obligations = [
            { type: 'file-must-exist', path: 'LICENSE' },
            { type: 'file-must-exist', path: '.gitignore' },
            { type: 'file-must-exist', path: 'docs/note.md' },
        ];
        const tagged = (0, tagger_1.tagObligations)(obligations, {
            availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES,
        });
        for (const o of tagged) {
            assert_1.strict.equal(o.deterministicStrategy, 'scaffold-template');
        }
    });
    it('does not tag file-must-exist for paths without a template', () => {
        const obligations = [
            { type: 'file-must-exist', path: 'src/code.ts' },
            { type: 'file-must-exist', path: 'odd/path.weird' },
        ];
        const tagged = (0, tagger_1.tagObligations)(obligations, {
            availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES,
        });
        for (const o of tagged) {
            assert_1.strict.equal(o.deterministicStrategy, undefined);
        }
    });
    it('does not tag build-must-pass or test-must-pass obligations', () => {
        const obligations = [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ];
        const tagged = (0, tagger_1.tagObligations)(obligations, {
            availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES,
        });
        for (const o of tagged) {
            assert_1.strict.equal(o.deterministicStrategy, undefined);
        }
    });
    it('preserves an existing deterministicStrategy tag', () => {
        const obligations = [
            { type: 'file-must-exist', path: 'LICENSE', deterministicStrategy: 'format-prettier' },
        ];
        const tagged = (0, tagger_1.tagObligations)(obligations, {
            availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES,
        });
        assert_1.strict.equal(tagged[0]?.deterministicStrategy, 'format-prettier');
    });
    it('skips strategies that are not in the available set', () => {
        const obligations = [{ type: 'file-must-exist', path: 'LICENSE' }];
        const tagged = (0, tagger_1.tagObligations)(obligations, { availableStrategies: [] });
        assert_1.strict.equal(tagged[0]?.deterministicStrategy, undefined);
    });
    it('does not mutate the input array', () => {
        const obligations = [{ type: 'file-must-exist', path: 'LICENSE' }];
        const before = JSON.stringify(obligations);
        (0, tagger_1.tagObligations)(obligations, { availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES });
        assert_1.strict.equal(JSON.stringify(obligations), before);
    });
    it('tagSummary reports counts and per-strategy breakdown', () => {
        const before = [
            { type: 'file-must-exist', path: 'LICENSE' },
            { type: 'file-must-exist', path: 'src/code.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
        ];
        const after = (0, tagger_1.tagObligations)(before, { availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES });
        const summary = (0, tagger_1.tagSummary)(before, after);
        assert_1.strict.equal(summary.tagged, 1);
        assert_1.strict.equal(summary.untagged, 2);
        assert_1.strict.equal(summary.byStrategy['scaffold-template'], 1);
    });
    it('tagSummary throws on length mismatch', () => {
        assert_1.strict.throws(() => (0, tagger_1.tagSummary)([], [{ type: 'file-must-exist', path: 'a' }]), /parallel arrays/);
    });
    it('pickStrategyForFile returns scaffold-template for boilerplate', () => {
        assert_1.strict.equal((0, tagger_1.pickStrategyForFile)('LICENSE', available), 'scaffold-template');
        assert_1.strict.equal((0, tagger_1.pickStrategyForFile)('subdir/CHANGELOG.md', available), 'scaffold-template');
    });
    it('pickStrategyForFile returns null for unmatched paths', () => {
        assert_1.strict.equal((0, tagger_1.pickStrategyForFile)('src/code.ts', available), null);
    });
    it('isKnownBoilerplate matches templated basenames and extensions', () => {
        assert_1.strict.equal((0, tagger_1.isKnownBoilerplate)('LICENSE'), true);
        assert_1.strict.equal((0, tagger_1.isKnownBoilerplate)('foo/LICENSE'), true);
        assert_1.strict.equal((0, tagger_1.isKnownBoilerplate)('docs/note.md'), true);
        assert_1.strict.equal((0, tagger_1.isKnownBoilerplate)('src/code.weird'), false);
    });
});
