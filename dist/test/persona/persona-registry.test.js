"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const persona_registry_1 = require("../../src/persona/persona-registry");
describe('persona/PersonaRegistry', () => {
    it('createDefaultRegistry exposes the eight Phase 7 personas in order', () => {
        const r = (0, persona_registry_1.createDefaultRegistry)();
        const ids = r.list().map((p) => p.id);
        assert_1.strict.deepEqual(ids, [...persona_registry_1.DEFAULT_PERSONA_IDS]);
        assert_1.strict.equal(ids.length, 8);
    });
    it('register rejects duplicate ids', () => {
        const r = new persona_registry_1.PersonaRegistry();
        r.register(persona_registry_1.ARCHITECT_PERSONA);
        assert_1.strict.throws(() => r.register(persona_registry_1.ARCHITECT_PERSONA), /already registered/);
    });
    it('replace overwrites without throwing', () => {
        const r = new persona_registry_1.PersonaRegistry([persona_registry_1.ARCHITECT_PERSONA]);
        const updated = { ...persona_registry_1.ARCHITECT_PERSONA, role: 'updated' };
        r.replace(updated);
        assert_1.strict.equal(r.require('architect').role, 'updated');
    });
    it('require throws on missing persona with helpful message', () => {
        const r = new persona_registry_1.PersonaRegistry([persona_registry_1.ARCHITECT_PERSONA]);
        assert_1.strict.throws(() => r.require('nope'), /known: architect/);
    });
    it('each default persona handles a distinct obligation type (Phase 7: 8 types)', () => {
        const r = (0, persona_registry_1.createDefaultRegistry)();
        const types = r.list().flatMap((p) => p.handles);
        assert_1.strict.deepEqual([...types].sort(), [
            'build-must-pass',
            'coverage-must-exceed',
            'file-must-exist',
            'function-must-have-signature',
            'import-graph-must-satisfy',
            'performance-must-not-regress',
            'property-must-hold',
            'test-must-pass',
        ]);
        // Each persona claims at least one type, and no type is double-claimed
        // by the default registry.
        assert_1.strict.equal(new Set(types).size, types.length);
    });
    it('each default persona has a non-empty system suffix and explicit sampling', () => {
        const all = [
            persona_registry_1.ARCHITECT_PERSONA,
            persona_registry_1.IMPLEMENTER_PERSONA,
            persona_registry_1.VERIFIER_PERSONA,
            persona_registry_1.SECURITY_REVIEWER_PERSONA,
            persona_registry_1.DEPENDENCY_AUDITOR_PERSONA,
            persona_registry_1.DOCUMENTATION_WRITER_PERSONA,
            persona_registry_1.MIGRATION_SPECIALIST_PERSONA,
            persona_registry_1.TEST_AUTHOR_PERSONA,
        ];
        for (const p of all) {
            assert_1.strict.ok(p.systemSuffix.length > 0, `${p.id} systemSuffix non-empty`);
            assert_1.strict.ok(p.sampling.maxTokens > 0, `${p.id} maxTokens > 0`);
            assert_1.strict.ok(typeof p.sampling.temperature === 'number');
            assert_1.strict.ok(['haiku', 'sonnet', 'opus'].includes(p.tier));
            assert_1.strict.ok(p.handles.length > 0, `${p.id} handles at least one obligation type`);
        }
    });
});
