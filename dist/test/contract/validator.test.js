"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const validator_1 = require("../../src/contract/validator");
describe('contract/validator', () => {
    it('accepts a minimal valid contract (file + build + test)', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: 'src/health.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, true);
        assert_1.strict.deepEqual(result.errors, []);
    });
    it('accepts a behavioral-only contract (build + test, no file)', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, true);
    });
    it('rejects an empty obligation list', () => {
        const result = (0, validator_1.validateObligations)([]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.equal(result.errors[0]?.code, 'no-obligations');
    });
    it('rejects when build-must-pass is missing', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'missing-build-must-pass'));
    });
    it('accepts a contract without build-must-pass when requireBuild is false', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'test-must-pass', command: 'npm test' },
        ], { requireBuild: false });
        assert_1.strict.equal(result.valid, true);
        assert_1.strict.deepEqual(result.errors, []);
    });
    it('rejects when test-must-pass is missing', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'missing-test-must-pass'));
    });
    it('rejects unknown obligation type', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'something-else', command: 'foo' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'schema'));
    });
    it('rejects absolute paths', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: '/etc/passwd' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'absolute-path'));
    });
    it('rejects empty path', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: '' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        // schema's minLength: 1 catches this; either 'schema' or 'empty-path' is acceptable
        assert_1.strict.ok(result.errors.some((e) => e.code === 'empty-path' || e.code === 'schema'));
    });
    it('rejects empty command', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'build-must-pass', command: '' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'empty-command' || e.code === 'schema'));
    });
    it('rejects duplicate file-must-exist paths', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'duplicate-file-must-exist'));
    });
    it('rejects duplicate build-must-pass commands', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'duplicate-build-must-pass'));
    });
    it('rejects duplicate test-must-pass commands', () => {
        const result = (0, validator_1.validateObligations)([
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'duplicate-test-must-pass'));
    });
    it('rejects non-string types via schema', () => {
        const result = (0, validator_1.validateObligations)([{ type: 42, path: 'a.ts' }]);
        assert_1.strict.equal(result.valid, false);
        assert_1.strict.ok(result.errors.some((e) => e.code === 'schema'));
    });
});
