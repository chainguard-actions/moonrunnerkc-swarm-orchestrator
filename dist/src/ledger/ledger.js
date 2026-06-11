"use strict";
// Hash-chained evidence ledger: each entry's entryHash folds in the
// previous entry's hash, so tampering breaks `verifyChain`. Impl guide
// §7 calls for IRONROOT primitives; we use the same sha256-of-canonical-
// JSON pattern so a swap to that npm package is mechanical. Deviation
// in docs/v8-architecture-deviations.md.
//
// Genesis prevHash is 64 hex zeros — string-comparator-safe vs the
// empty-string variant some IRONROOT implementations use.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashChainedLedger = exports.ChainTamperedError = exports.GENESIS_PREV_HASH = void 0;
exports.readEntries = readEntries;
exports.verifyChainEntries = verifyChainEntries;
exports.verifyChainAt = verifyChainAt;
exports.canonicalJson = canonicalJson;
exports.computeEntryHash = computeEntryHash;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.GENESIS_PREV_HASH = '0'.repeat(64);
class ChainTamperedError extends Error {
    lineNumber;
    kind;
    constructor(message, lineNumber, kind) {
        super(message);
        this.name = 'ChainTamperedError';
        this.lineNumber = lineNumber;
        this.kind = kind;
    }
}
exports.ChainTamperedError = ChainTamperedError;
// Each append is fsync-equivalent (appendFileSync); a kill-9 mid-write
// leaves a parseable prefix.
class HashChainedLedger {
    seq = 0;
    lastHash = exports.GENESIS_PREV_HASH;
    filePath;
    runId;
    constructor(filePath, runId) {
        this.filePath = filePath;
        this.runId = runId;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', { encoding: 'utf8' });
            return;
        }
        // Verify before chaining onto an existing file: refusing to chain
        // onto tampered tail is safer than silently accepting it.
        const existing = readEntries(filePath);
        if (existing.length > 0) {
            verifyChainEntries(existing);
            const last = existing[existing.length - 1];
            if (last) {
                this.seq = last.seq + 1;
                this.lastHash = last.entryHash;
            }
        }
    }
    path() {
        return this.filePath;
    }
    run() {
        return this.runId;
    }
    nextSeq() {
        return this.seq;
    }
    tailHash() {
        return this.lastHash;
    }
    // Stamps ts, runId, seq, prevHash, entryHash.
    append(payload) {
        const ts = new Date().toISOString();
        const base = {
            ts,
            runId: this.runId,
            seq: this.seq,
            prevHash: this.lastHash,
            ...payload,
        };
        const entryHash = computeEntryHash(base);
        const final = { ...base, entryHash };
        fs.appendFileSync(this.filePath, JSON.stringify(final) + '\n', { encoding: 'utf8' });
        this.seq += 1;
        this.lastHash = entryHash;
        return final;
    }
    readAll() {
        return readEntries(this.filePath);
    }
    verifyChain() {
        const entries = readEntries(this.filePath);
        verifyChainEntries(entries);
    }
}
exports.HashChainedLedger = HashChainedLedger;
// Does NOT verify the chain — call `verifyChain` for that.
function readEntries(filePath) {
    if (!fs.existsSync(filePath))
        return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        if (line.trim().length === 0)
            continue;
        try {
            const parsed = JSON.parse(line);
            out.push(parsed);
        }
        catch (err) {
            throw new Error(`ledger ${filePath} line ${i + 1} is not valid JSON: ${err.message}`, { cause: err });
        }
    }
    return out;
}
function verifyChainEntries(entries) {
    let expectedPrev = exports.GENESIS_PREV_HASH;
    for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        if (!e)
            continue;
        const lineNumber = i + 1;
        if (typeof e.prevHash !== 'string' || typeof e.entryHash !== 'string') {
            throw new ChainTamperedError(`ledger entry at line ${lineNumber} is missing prevHash/entryHash header fields`, lineNumber, 'malformed-header');
        }
        if (e.prevHash !== expectedPrev) {
            throw new ChainTamperedError(`ledger chain broken at line ${lineNumber}: prevHash ${shortHash(e.prevHash)} does not chain from ${shortHash(expectedPrev)}`, lineNumber, 'prev-hash-mismatch');
        }
        const recomputed = computeEntryHash(stripEntryHash(e));
        if (recomputed !== e.entryHash) {
            throw new ChainTamperedError(`ledger entry at line ${lineNumber} fails entry-hash check: stored ${shortHash(e.entryHash)} but recomputed ${shortHash(recomputed)}`, lineNumber, 'entry-hash-mismatch');
        }
        expectedPrev = e.entryHash;
    }
}
function verifyChainAt(filePath) {
    const entries = readEntries(filePath);
    verifyChainEntries(entries);
}
// RFC 8785 in spirit (without full I-JSON number normalization — the
// ledger never serializes exotic numbers): keys sorted in JS string
// order, arrays preserve order, primitives via JSON.stringify.
function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']';
    }
    const obj = value;
    const keys = Object.keys(obj).sort();
    const body = keys
        .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
        .join(',');
    return '{' + body + '}';
}
// Caller must pass the entry with `entryHash` already stripped.
function computeEntryHash(entry) {
    return crypto.createHash('sha256').update(canonicalJson(entry), 'utf8').digest('hex');
}
function stripEntryHash(entry) {
    const out = {};
    for (const k of Object.keys(entry)) {
        if (k === 'entryHash')
            continue;
        out[k] = entry[k];
    }
    return out;
}
function shortHash(h) {
    return h.length <= 12 ? h : `${h.slice(0, 8)}…${h.slice(-4)}`;
}
