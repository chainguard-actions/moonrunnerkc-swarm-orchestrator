"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const predicates_1 = require("../../src/persona/predicates");
const persona_registry_1 = require("../../src/persona/persona-registry");
function state() {
    return {
        obligations: [
            { type: 'file-must-exist', path: 'src/health.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
        status: ['pending', 'pending', 'pending'],
    };
}
describe('persona/predicates', () => {
    it('unsatisfiedObligationOfType returns the first pending of that type', () => {
        const pred = (0, predicates_1.unsatisfiedObligationOfType)('build-must-pass');
        assert_1.strict.equal(pred(state()), 1);
    });
    it('unsatisfiedObligationOfType skips non-pending', () => {
        const pred = (0, predicates_1.unsatisfiedObligationOfType)('file-must-exist');
        const s = {
            ...state(),
            status: ['satisfied', 'pending', 'pending'],
        };
        assert_1.strict.equal(pred(s), null);
    });
    it('personaTrigger fires only on a type the persona handles', () => {
        const trig = (0, predicates_1.personaTrigger)(persona_registry_1.ARCHITECT_PERSONA);
        assert_1.strict.equal(trig(state()), 0);
        const noFiles = {
            obligations: [
                { type: 'build-must-pass', command: 'b' },
                { type: 'test-must-pass', command: 't' },
            ],
            status: ['pending', 'pending'],
        };
        assert_1.strict.equal(trig(noFiles), null);
    });
    it('selectPersonaForState walks the registry and returns the first match', () => {
        const r = (0, persona_registry_1.createDefaultRegistry)();
        const sel = (0, predicates_1.selectPersonaForState)(r, state());
        assert_1.strict.ok(sel);
        assert_1.strict.equal(sel?.persona.id, persona_registry_1.ARCHITECT_PERSONA.id);
        assert_1.strict.equal(sel?.obligationIndex, 0);
    });
    it('selectPersonaForState falls through to the next persona when the first has no work', () => {
        const r = (0, persona_registry_1.createDefaultRegistry)();
        const s = {
            ...state(),
            status: ['satisfied', 'pending', 'pending'],
        };
        const sel = (0, predicates_1.selectPersonaForState)(r, s);
        assert_1.strict.ok(sel);
        assert_1.strict.equal(sel?.persona.id, persona_registry_1.IMPLEMENTER_PERSONA.id);
        assert_1.strict.equal(sel?.obligationIndex, 1);
    });
    it('selectPersonaForState returns null when nothing is pending', () => {
        const r = (0, persona_registry_1.createDefaultRegistry)();
        const s = {
            ...state(),
            status: ['satisfied', 'satisfied', 'satisfied'],
        };
        assert_1.strict.equal((0, predicates_1.selectPersonaForState)(r, s), null);
    });
    it('verifier persona handles test-must-pass', () => {
        const trig = (0, predicates_1.personaTrigger)(persona_registry_1.VERIFIER_PERSONA);
        const s = {
            ...state(),
            status: ['satisfied', 'satisfied', 'pending'],
        };
        assert_1.strict.equal(trig(s), 2);
    });
});
