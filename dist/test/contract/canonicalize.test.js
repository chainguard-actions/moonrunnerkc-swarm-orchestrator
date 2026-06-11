"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const canonicalize_1 = require("../../src/contract/canonicalize");
describe('contract/canonicalize', () => {
    describe('canonicalSort', () => {
        it('orders types as file-must-exist, build-must-pass, test-must-pass', () => {
            const input = [
                { type: 'test-must-pass', command: 'npm test' },
                { type: 'build-must-pass', command: 'npm run build' },
                { type: 'file-must-exist', path: 'src/health.ts' },
            ];
            const sorted = (0, canonicalize_1.canonicalSort)(input);
            assert_1.strict.deepEqual(sorted.map((o) => o.type), ['file-must-exist', 'build-must-pass', 'test-must-pass']);
        });
        it('orders within type lexicographically by payload', () => {
            const input = [
                { type: 'file-must-exist', path: 'b.ts' },
                { type: 'file-must-exist', path: 'a.ts' },
            ];
            const sorted = (0, canonicalize_1.canonicalSort)(input);
            assert_1.strict.deepEqual(sorted.map((o) => (o.type === 'file-must-exist' ? o.path : '')), ['a.ts', 'b.ts']);
        });
        it('does not mutate the input array', () => {
            const input = [
                { type: 'test-must-pass', command: 'npm test' },
                { type: 'file-must-exist', path: 'a.ts' },
            ];
            const before = JSON.stringify(input);
            (0, canonicalize_1.canonicalSort)(input);
            assert_1.strict.equal(JSON.stringify(input), before);
        });
    });
    describe('canonicalSerialize', () => {
        it('emits one obligation per line, terminated with LF', () => {
            const out = (0, canonicalize_1.canonicalSerialize)([
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'build-must-pass', command: 'npm run build' },
                { type: 'test-must-pass', command: 'npm test' },
            ]);
            assert_1.strict.equal(out, '{"type":"file-must-exist","path":"a.ts"}\n' +
                '{"type":"build-must-pass","command":"npm run build"}\n' +
                '{"type":"test-must-pass","command":"npm test"}\n');
        });
        it('produces identical bytes regardless of input order (canonical)', () => {
            const a = [
                { type: 'test-must-pass', command: 'npm test' },
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'build-must-pass', command: 'npm run build' },
            ];
            const b = [
                { type: 'build-must-pass', command: 'npm run build' },
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'test-must-pass', command: 'npm test' },
            ];
            assert_1.strict.equal((0, canonicalize_1.canonicalSerialize)(a), (0, canonicalize_1.canonicalSerialize)(b));
        });
        it('emits empty string for empty input', () => {
            assert_1.strict.equal((0, canonicalize_1.canonicalSerialize)([]), '');
        });
    });
    describe('contractHash', () => {
        it('returns a 64-char lowercase hex string', () => {
            const hash = (0, canonicalize_1.contractHash)([{ type: 'file-must-exist', path: 'a.ts' }]);
            assert_1.strict.match(hash, /^[0-9a-f]{64}$/);
        });
        it('is order-independent (canonical-form hash)', () => {
            const a = [
                { type: 'test-must-pass', command: 'npm test' },
                { type: 'file-must-exist', path: 'a.ts' },
            ];
            const b = [
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'test-must-pass', command: 'npm test' },
            ];
            assert_1.strict.equal((0, canonicalize_1.contractHash)(a), (0, canonicalize_1.contractHash)(b));
        });
        it('changes when an obligation changes', () => {
            const a = (0, canonicalize_1.contractHash)([{ type: 'file-must-exist', path: 'a.ts' }]);
            const b = (0, canonicalize_1.contractHash)([{ type: 'file-must-exist', path: 'b.ts' }]);
            assert_1.strict.notEqual(a, b);
        });
    });
    describe('contractIdFromHash', () => {
        it('returns the first 16 hex chars', () => {
            const hash = '0123456789abcdef' + 'f'.repeat(48);
            assert_1.strict.equal((0, canonicalize_1.contractIdFromHash)(hash), '0123456789abcdef');
        });
        it('throws for short input', () => {
            assert_1.strict.throws(() => (0, canonicalize_1.contractIdFromHash)('short'), /shorter than 16 chars/);
        });
    });
});
