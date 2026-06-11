"use strict";
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
exports.canonicalSort = canonicalSort;
exports.canonicalSerialize = canonicalSerialize;
exports.contractHash = contractHash;
exports.contractIdFromHash = contractIdFromHash;
const crypto = __importStar(require("crypto"));
const types_1 = require("./types");
/**
 * Sort obligations into the canonical order used for hashing and on-disk
 * serialization.
 *
 * Order is:
 *   1. By type, in the order declared by `OBLIGATION_TYPES`.
 *   2. Within each type, by the obligation's payload key (path / command /
 *      structured tuple) using JS string comparison.
 *
 * The validator already rejects duplicates within a type, so within-type
 * ties cannot occur in valid input.
 */
function canonicalSort(obligations) {
    const typeOrder = new Map(types_1.OBLIGATION_TYPES.map((t, i) => [t, i]));
    const copy = obligations.slice();
    copy.sort((a, b) => {
        const ta = typeOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER;
        const tb = typeOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER;
        if (ta !== tb)
            return ta - tb;
        return payloadValue(a).localeCompare(payloadValue(b), 'en', { sensitivity: 'variant' });
    });
    return copy;
}
/**
 * Stable per-type payload string used as the within-type sort key. Pure
 * derivation from the obligation fields; no I/O.
 */
function payloadValue(o) {
    switch (o.type) {
        case 'file-must-exist':
            return o.path;
        case 'build-must-pass':
        case 'test-must-pass':
            return o.command;
        case 'function-must-have-signature':
            return `${o.file}|${o.name}|${o.signature}`;
        case 'property-must-hold':
            return `${o.target}|${o.predicate}`;
        case 'import-graph-must-satisfy':
            return `${o.scope}|${o.constraint}`;
        case 'coverage-must-exceed':
            return `${o.scope}|${o.metric}|${o.threshold}`;
        case 'performance-must-not-regress':
            return `${o.benchmark}|${o.baseline}|${o.threshold}`;
    }
}
/**
 * Render an obligation list as canonical JSONL bytes: one obligation per
 * line, lines terminated with LF, no trailing whitespace, properties emitted
 * in a stable order matching the schema declaration order.
 *
 * The output is suitable as the contract.jsonl on-disk format and as the
 * input to `contractHash`.
 */
function canonicalSerialize(obligations) {
    const sorted = canonicalSort(obligations);
    const lines = [];
    for (const o of sorted) {
        lines.push(stableStringifyObligation(o));
    }
    return lines.length === 0 ? '' : lines.join('\n') + '\n';
}
function stableStringifyObligation(o) {
    // Phase 5: emit `deterministicStrategy` last so untagged obligations
    // round-trip to the same bytes Phase 4 produced (back-compat for the
    // contract-hash function and for any ledger entries that captured a
    // pre-Phase-5 contract hash). Phase 7 follows the same convention for
    // the five new types.
    const det = o.deterministicStrategy;
    switch (o.type) {
        case 'file-must-exist': {
            const base = { type: o.type, path: o.path };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'build-must-pass':
        case 'test-must-pass': {
            const base = { type: o.type, command: o.command };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'function-must-have-signature': {
            const base = { type: o.type, file: o.file, name: o.name, signature: o.signature };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'property-must-hold': {
            const base = { type: o.type, predicate: o.predicate, target: o.target };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'import-graph-must-satisfy': {
            const base = { type: o.type, constraint: o.constraint, scope: o.scope };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'coverage-must-exceed': {
            const base = { type: o.type, scope: o.scope, metric: o.metric, threshold: o.threshold };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
        case 'performance-must-not-regress': {
            const base = {
                type: o.type,
                benchmark: o.benchmark,
                baseline: o.baseline,
                threshold: o.threshold,
            };
            return det !== undefined
                ? JSON.stringify({ ...base, deterministicStrategy: det })
                : JSON.stringify(base);
        }
    }
}
/**
 * Sha256 of the canonical JSONL bytes for a given obligation list.
 *
 * Provenance metadata (extractor, model, temperature, prompt hash) is NOT
 * part of the contract hash; only the bytes a verifier needs to enforce the
 * contract are hashed. This matches impl guide §4: "hash-stable: identical
 * input produces identical contract output."
 *
 * @returns full hex digest (lowercase, 64 chars).
 */
function contractHash(obligations) {
    const canonical = canonicalSerialize(obligations);
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
/**
 * Short filesystem-safe contract id derived from the contract hash. 16 hex
 * chars (~64 bits) is enough to disambiguate every contract a single user
 * will ever produce while remaining short enough for directory names.
 */
function contractIdFromHash(hash) {
    if (hash.length < 16) {
        throw new Error(`contract hash "${hash}" is shorter than 16 chars; refusing to derive id`);
    }
    return hash.slice(0, 16);
}
