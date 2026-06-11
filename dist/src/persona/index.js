"use strict";
/**
 * Public surface of the v8 persona layer. Phase 2 ships:
 *   - `PersonaSpec` and `PersonaSampling` types.
 *   - `PersonaRegistry` and the three default personas (architect, implementer, verifier).
 *   - The Phase 2 trigger-predicate evaluator.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCandidate = exports.renderVerifierPrompt = exports.parseVerifierScore = exports.clampScore = exports.TOURNAMENT_VERIFIER_PERSONA = exports.unsatisfiedObligationOfType = exports.selectPersonaForState = exports.personaTrigger = exports.createDefaultRegistry = exports.VERIFIER_PERSONA = exports.TEST_AUTHOR_PERSONA = exports.SECURITY_REVIEWER_PERSONA = exports.PersonaRegistry = exports.MIGRATION_SPECIALIST_PERSONA = exports.IMPLEMENTER_PERSONA = exports.DOCUMENTATION_WRITER_PERSONA = exports.DEPENDENCY_AUDITOR_PERSONA = exports.DEFAULT_PERSONA_IDS = exports.ARCHITECT_PERSONA = void 0;
var persona_registry_1 = require("./persona-registry");
Object.defineProperty(exports, "ARCHITECT_PERSONA", { enumerable: true, get: function () { return persona_registry_1.ARCHITECT_PERSONA; } });
Object.defineProperty(exports, "DEFAULT_PERSONA_IDS", { enumerable: true, get: function () { return persona_registry_1.DEFAULT_PERSONA_IDS; } });
Object.defineProperty(exports, "DEPENDENCY_AUDITOR_PERSONA", { enumerable: true, get: function () { return persona_registry_1.DEPENDENCY_AUDITOR_PERSONA; } });
Object.defineProperty(exports, "DOCUMENTATION_WRITER_PERSONA", { enumerable: true, get: function () { return persona_registry_1.DOCUMENTATION_WRITER_PERSONA; } });
Object.defineProperty(exports, "IMPLEMENTER_PERSONA", { enumerable: true, get: function () { return persona_registry_1.IMPLEMENTER_PERSONA; } });
Object.defineProperty(exports, "MIGRATION_SPECIALIST_PERSONA", { enumerable: true, get: function () { return persona_registry_1.MIGRATION_SPECIALIST_PERSONA; } });
Object.defineProperty(exports, "PersonaRegistry", { enumerable: true, get: function () { return persona_registry_1.PersonaRegistry; } });
Object.defineProperty(exports, "SECURITY_REVIEWER_PERSONA", { enumerable: true, get: function () { return persona_registry_1.SECURITY_REVIEWER_PERSONA; } });
Object.defineProperty(exports, "TEST_AUTHOR_PERSONA", { enumerable: true, get: function () { return persona_registry_1.TEST_AUTHOR_PERSONA; } });
Object.defineProperty(exports, "VERIFIER_PERSONA", { enumerable: true, get: function () { return persona_registry_1.VERIFIER_PERSONA; } });
Object.defineProperty(exports, "createDefaultRegistry", { enumerable: true, get: function () { return persona_registry_1.createDefaultRegistry; } });
var predicates_1 = require("./predicates");
Object.defineProperty(exports, "personaTrigger", { enumerable: true, get: function () { return predicates_1.personaTrigger; } });
Object.defineProperty(exports, "selectPersonaForState", { enumerable: true, get: function () { return predicates_1.selectPersonaForState; } });
Object.defineProperty(exports, "unsatisfiedObligationOfType", { enumerable: true, get: function () { return predicates_1.unsatisfiedObligationOfType; } });
var verifier_persona_1 = require("./verifier-persona");
Object.defineProperty(exports, "TOURNAMENT_VERIFIER_PERSONA", { enumerable: true, get: function () { return verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA; } });
Object.defineProperty(exports, "clampScore", { enumerable: true, get: function () { return verifier_persona_1.clampScore; } });
Object.defineProperty(exports, "parseVerifierScore", { enumerable: true, get: function () { return verifier_persona_1.parseVerifierScore; } });
Object.defineProperty(exports, "renderVerifierPrompt", { enumerable: true, get: function () { return verifier_persona_1.renderVerifierPrompt; } });
Object.defineProperty(exports, "scoreCandidate", { enumerable: true, get: function () { return verifier_persona_1.scoreCandidate; } });
