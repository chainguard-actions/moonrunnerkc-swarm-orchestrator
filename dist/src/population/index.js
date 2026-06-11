"use strict";
/**
 * Public surface of the v8 population layer. Phase 2 ships:
 *   - The sequential population manager (one persona at a time).
 *   - File-emit applier (architect persona's only synthesis path).
 *   - Mutable state builder consumed by the manager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopulationStateBuilder = exports.runTournament = exports.pickPersonaSlate = exports.DEFAULT_TOURNAMENT_CONFIG = exports.parseUnifiedDiff = exports.looksLikeUnifiedDiff = exports.applyUnifiedDiff = exports.writeFileObligation = exports.extractFencedBody = exports.applyFileEmit = exports.runPopulation = exports.renderDynamicMessage = exports.listPersonaIds = void 0;
var manager_1 = require("./manager");
Object.defineProperty(exports, "listPersonaIds", { enumerable: true, get: function () { return manager_1.listPersonaIds; } });
Object.defineProperty(exports, "renderDynamicMessage", { enumerable: true, get: function () { return manager_1.renderDynamicMessage; } });
Object.defineProperty(exports, "runPopulation", { enumerable: true, get: function () { return manager_1.runPopulation; } });
var diff_applier_1 = require("./diff-applier");
Object.defineProperty(exports, "applyFileEmit", { enumerable: true, get: function () { return diff_applier_1.applyFileEmit; } });
Object.defineProperty(exports, "extractFencedBody", { enumerable: true, get: function () { return diff_applier_1.extractFencedBody; } });
Object.defineProperty(exports, "writeFileObligation", { enumerable: true, get: function () { return diff_applier_1.writeFileObligation; } });
var unified_diff_1 = require("./unified-diff");
Object.defineProperty(exports, "applyUnifiedDiff", { enumerable: true, get: function () { return unified_diff_1.applyUnifiedDiff; } });
Object.defineProperty(exports, "looksLikeUnifiedDiff", { enumerable: true, get: function () { return unified_diff_1.looksLikeUnifiedDiff; } });
Object.defineProperty(exports, "parseUnifiedDiff", { enumerable: true, get: function () { return unified_diff_1.parseUnifiedDiff; } });
var tournament_1 = require("./tournament");
Object.defineProperty(exports, "DEFAULT_TOURNAMENT_CONFIG", { enumerable: true, get: function () { return tournament_1.DEFAULT_TOURNAMENT_CONFIG; } });
Object.defineProperty(exports, "pickPersonaSlate", { enumerable: true, get: function () { return tournament_1.pickPersonaSlate; } });
Object.defineProperty(exports, "runTournament", { enumerable: true, get: function () { return tournament_1.runTournament; } });
var state_1 = require("./state");
Object.defineProperty(exports, "PopulationStateBuilder", { enumerable: true, get: function () { return state_1.PopulationStateBuilder; } });
