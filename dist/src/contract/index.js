"use strict";
/**
 * Public surface of the v8 contract module.
 *
 * Phase 1 exports the goal-to-contract pipeline: types, the compiler, the
 * validator, the canonicalizer, the JSONL serializer, the approval flow,
 * and the two extractor implementations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findContractFile = exports.tagSummary = exports.tagObligations = exports.pickStrategyForFile = exports.isKnownBoilerplate = exports.obligationValidator = exports.loadObligationSchema = exports.StubExtractor = exports.DEFAULT_TEMPERATURE = exports.DEFAULT_MAX_TOKENS = exports.DEFAULT_ANTHROPIC_MODEL = exports.AnthropicExtractor = exports.runApproval = exports.ContractRejectedError = exports.writeContract = exports.readContract = exports.parseJsonl = exports.MANIFEST_FILENAME = exports.CONTRACT_FILENAME = exports.contractIdFromHash = exports.contractHash = exports.canonicalSort = exports.canonicalSerialize = exports.validateObligations = exports.finalize = exports.discoverRepoContext = exports.compileGoal = exports.ContractValidationError = exports.OBLIGATION_TYPES = exports.CONTRACT_SCHEMA_VERSION = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "CONTRACT_SCHEMA_VERSION", { enumerable: true, get: function () { return types_1.CONTRACT_SCHEMA_VERSION; } });
Object.defineProperty(exports, "OBLIGATION_TYPES", { enumerable: true, get: function () { return types_1.OBLIGATION_TYPES; } });
var compiler_1 = require("./compiler");
Object.defineProperty(exports, "ContractValidationError", { enumerable: true, get: function () { return compiler_1.ContractValidationError; } });
Object.defineProperty(exports, "compileGoal", { enumerable: true, get: function () { return compiler_1.compileGoal; } });
Object.defineProperty(exports, "discoverRepoContext", { enumerable: true, get: function () { return compiler_1.discoverRepoContext; } });
Object.defineProperty(exports, "finalize", { enumerable: true, get: function () { return compiler_1.finalize; } });
var validator_1 = require("./validator");
Object.defineProperty(exports, "validateObligations", { enumerable: true, get: function () { return validator_1.validateObligations; } });
var canonicalize_1 = require("./canonicalize");
Object.defineProperty(exports, "canonicalSerialize", { enumerable: true, get: function () { return canonicalize_1.canonicalSerialize; } });
Object.defineProperty(exports, "canonicalSort", { enumerable: true, get: function () { return canonicalize_1.canonicalSort; } });
Object.defineProperty(exports, "contractHash", { enumerable: true, get: function () { return canonicalize_1.contractHash; } });
Object.defineProperty(exports, "contractIdFromHash", { enumerable: true, get: function () { return canonicalize_1.contractIdFromHash; } });
var serializer_1 = require("./serializer");
Object.defineProperty(exports, "CONTRACT_FILENAME", { enumerable: true, get: function () { return serializer_1.CONTRACT_FILENAME; } });
Object.defineProperty(exports, "MANIFEST_FILENAME", { enumerable: true, get: function () { return serializer_1.MANIFEST_FILENAME; } });
Object.defineProperty(exports, "parseJsonl", { enumerable: true, get: function () { return serializer_1.parseJsonl; } });
Object.defineProperty(exports, "readContract", { enumerable: true, get: function () { return serializer_1.readContract; } });
Object.defineProperty(exports, "writeContract", { enumerable: true, get: function () { return serializer_1.writeContract; } });
var approval_1 = require("./approval");
Object.defineProperty(exports, "ContractRejectedError", { enumerable: true, get: function () { return approval_1.ContractRejectedError; } });
Object.defineProperty(exports, "runApproval", { enumerable: true, get: function () { return approval_1.runApproval; } });
var anthropic_extractor_1 = require("./extractor/anthropic-extractor");
Object.defineProperty(exports, "AnthropicExtractor", { enumerable: true, get: function () { return anthropic_extractor_1.AnthropicExtractor; } });
Object.defineProperty(exports, "DEFAULT_ANTHROPIC_MODEL", { enumerable: true, get: function () { return anthropic_extractor_1.DEFAULT_ANTHROPIC_MODEL; } });
Object.defineProperty(exports, "DEFAULT_MAX_TOKENS", { enumerable: true, get: function () { return anthropic_extractor_1.DEFAULT_MAX_TOKENS; } });
Object.defineProperty(exports, "DEFAULT_TEMPERATURE", { enumerable: true, get: function () { return anthropic_extractor_1.DEFAULT_TEMPERATURE; } });
var stub_extractor_1 = require("./extractor/stub-extractor");
Object.defineProperty(exports, "StubExtractor", { enumerable: true, get: function () { return stub_extractor_1.StubExtractor; } });
var loader_1 = require("./schema/loader");
Object.defineProperty(exports, "loadObligationSchema", { enumerable: true, get: function () { return loader_1.loadObligationSchema; } });
Object.defineProperty(exports, "obligationValidator", { enumerable: true, get: function () { return loader_1.obligationValidator; } });
var tagger_1 = require("./tagger");
Object.defineProperty(exports, "isKnownBoilerplate", { enumerable: true, get: function () { return tagger_1.isKnownBoilerplate; } });
Object.defineProperty(exports, "pickStrategyForFile", { enumerable: true, get: function () { return tagger_1.pickStrategyForFile; } });
Object.defineProperty(exports, "tagObligations", { enumerable: true, get: function () { return tagger_1.tagObligations; } });
Object.defineProperty(exports, "tagSummary", { enumerable: true, get: function () { return tagger_1.tagSummary; } });
var auto_discover_1 = require("./auto-discover");
Object.defineProperty(exports, "findContractFile", { enumerable: true, get: function () { return auto_discover_1.findContractFile; } });
