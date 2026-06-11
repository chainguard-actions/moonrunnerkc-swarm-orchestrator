"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsatisfiedObligationOfType = unsatisfiedObligationOfType;
exports.personaTrigger = personaTrigger;
exports.selectPersonaForState = selectPersonaForState;
/**
 * Factory for the Phase 2 predicate: "fire when there is an unsatisfied
 * obligation of type X." Returns the index of the first matching pending
 * obligation, or null when none.
 */
function unsatisfiedObligationOfType(type) {
    return (state) => {
        for (let i = 0; i < state.obligations.length; i += 1) {
            const o = state.obligations[i];
            const s = state.status[i];
            if (!o || s === undefined)
                continue;
            if (s === 'pending' && o.type === type)
                return i;
        }
        return null;
    };
}
/**
 * For each obligation type the persona handles, build a Phase 2 trigger
 * predicate. Combined trigger: fires on any obligation with a type the
 * persona handles. Used by `selectPersonaForState` to walk the registry.
 */
function personaTrigger(persona) {
    const predicates = persona.handles.map(unsatisfiedObligationOfType);
    return (state) => {
        for (const p of predicates) {
            const idx = p(state);
            if (idx !== null)
                return idx;
        }
        return null;
    };
}
/**
 * Walk the registry and return the first persona whose trigger predicate
 * fires for the given state. Phase 2 sequentializes execution, so we walk
 * in registration order and take the first match. Returns null when no
 * persona's predicate fires (i.e. all obligations are non-pending).
 */
function selectPersonaForState(registry, state) {
    for (const persona of registry.list()) {
        const idx = personaTrigger(persona)(state);
        if (idx !== null) {
            return { persona, obligationIndex: idx };
        }
    }
    return null;
}
