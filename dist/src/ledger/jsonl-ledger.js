"use strict";
/**
 * Phase 2 entry point for the JSONL ledger. Phase 4 upgraded the
 * implementation to a hash-chained ledger; the on-disk format is the same
 * (one JSON object per line) and the constructor signature is unchanged,
 * so this file remains the canonical import path for legacy call sites
 * while the new behaviour lives in `ledger.ts`.
 *
 * New code should import `HashChainedLedger` from `./ledger` directly.
 * Tests and back-compat call sites continue to import `JsonlLedger` from
 * here; the alias is intentional and will outlive the v8 transition.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = exports.computeEntryHash = exports.GENESIS_PREV_HASH = exports.ChainTamperedError = exports.verifyChainAt = exports.verifyChainEntries = exports.readEntries = exports.JsonlLedger = void 0;
var ledger_1 = require("./ledger");
Object.defineProperty(exports, "JsonlLedger", { enumerable: true, get: function () { return ledger_1.HashChainedLedger; } });
Object.defineProperty(exports, "readEntries", { enumerable: true, get: function () { return ledger_1.readEntries; } });
Object.defineProperty(exports, "verifyChainEntries", { enumerable: true, get: function () { return ledger_1.verifyChainEntries; } });
Object.defineProperty(exports, "verifyChainAt", { enumerable: true, get: function () { return ledger_1.verifyChainAt; } });
Object.defineProperty(exports, "ChainTamperedError", { enumerable: true, get: function () { return ledger_1.ChainTamperedError; } });
Object.defineProperty(exports, "GENESIS_PREV_HASH", { enumerable: true, get: function () { return ledger_1.GENESIS_PREV_HASH; } });
Object.defineProperty(exports, "computeEntryHash", { enumerable: true, get: function () { return ledger_1.computeEntryHash; } });
Object.defineProperty(exports, "canonicalJson", { enumerable: true, get: function () { return ledger_1.canonicalJson; } });
