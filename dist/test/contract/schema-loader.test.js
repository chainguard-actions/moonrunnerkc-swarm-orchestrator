"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const loader_1 = require("../../src/contract/schema/loader");
describe('contract/schema/loader', () => {
    beforeEach(() => {
        (0, loader_1.resetSchemaCacheForTest)();
    });
    it('loads the v1 schema with the three Phase 1 + five Phase 7 obligation types', () => {
        const schema = (0, loader_1.loadObligationSchema)();
        const titles = schema.oneOf.map((s) => s.title).sort();
        assert_1.strict.deepEqual(titles, [
            'build-must-pass',
            'coverage-must-exceed',
            'file-must-exist',
            'function-must-have-signature',
            'import-graph-must-satisfy',
            'performance-must-not-regress',
            'property-must-hold',
            'test-must-pass',
        ]);
    });
    it('compiles a validator that accepts file-must-exist', () => {
        const validate = (0, loader_1.obligationValidator)();
        assert_1.strict.equal(validate({ type: 'file-must-exist', path: 'src/a.ts' }), true);
    });
    it('compiles a validator that rejects unknown types', () => {
        const validate = (0, loader_1.obligationValidator)();
        assert_1.strict.equal(validate({ type: 'unknown', path: 'src/a.ts' }), false);
    });
    it('caches the compiled validator across calls', () => {
        const a = (0, loader_1.obligationValidator)();
        const b = (0, loader_1.obligationValidator)();
        assert_1.strict.equal(a, b);
    });
});
