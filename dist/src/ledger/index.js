"use strict";
/**
 * Public surface of the v8 evidence ledger. Phase 4 ships an append-only
 * JSONL ledger with full hash-chain semantics, a memoization layer, and
 * a resume helper that derives population state from a partial run.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeError = exports.deriveResumeState = exports.obligationKey = exports.MemoStore = exports.JsonlLedger = exports.verifyChainEntries = exports.verifyChainAt = exports.readEntries = exports.computeEntryHash = exports.canonicalJson = exports.GENESIS_PREV_HASH = exports.ChainTamperedError = exports.HashChainedLedger = void 0;
var ledger_1 = require("./ledger");
Object.defineProperty(exports, "HashChainedLedger", { enumerable: true, get: function () { return ledger_1.HashChainedLedger; } });
Object.defineProperty(exports, "ChainTamperedError", { enumerable: true, get: function () { return ledger_1.ChainTamperedError; } });
Object.defineProperty(exports, "GENESIS_PREV_HASH", { enumerable: true, get: function () { return ledger_1.GENESIS_PREV_HASH; } });
Object.defineProperty(exports, "canonicalJson", { enumerable: true, get: function () { return ledger_1.canonicalJson; } });
Object.defineProperty(exports, "computeEntryHash", { enumerable: true, get: function () { return ledger_1.computeEntryHash; } });
Object.defineProperty(exports, "readEntries", { enumerable: true, get: function () { return ledger_1.readEntries; } });
Object.defineProperty(exports, "verifyChainAt", { enumerable: true, get: function () { return ledger_1.verifyChainAt; } });
Object.defineProperty(exports, "verifyChainEntries", { enumerable: true, get: function () { return ledger_1.verifyChainEntries; } });
// Back-compat alias used by Phase 2/3 call sites.
var jsonl_ledger_1 = require("./jsonl-ledger");
Object.defineProperty(exports, "JsonlLedger", { enumerable: true, get: function () { return jsonl_ledger_1.JsonlLedger; } });
var memoization_1 = require("./memoization");
Object.defineProperty(exports, "MemoStore", { enumerable: true, get: function () { return memoization_1.MemoStore; } });
Object.defineProperty(exports, "obligationKey", { enumerable: true, get: function () { return memoization_1.obligationKey; } });
var resume_1 = require("./resume");
Object.defineProperty(exports, "deriveResumeState", { enumerable: true, get: function () { return resume_1.deriveResumeState; } });
Object.defineProperty(exports, "ResumeError", { enumerable: true, get: function () { return resume_1.ResumeError; } });
