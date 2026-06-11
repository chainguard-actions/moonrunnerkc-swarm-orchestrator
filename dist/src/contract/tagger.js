"use strict";
/**
 * Phase 5 contract auto-tagger. Inspects each obligation and, when a
 * registered deterministic strategy can plausibly satisfy it, attaches
 * the `deterministicStrategy` tag. The tagger is conservative: it only
 * tags when the strategy's preconditions are visible from the
 * obligation alone (e.g., "the path is a known boilerplate file"). When
 * no clear signal exists, the obligation stays untagged and falls
 * through to synthesis.
 *
 * The tagger never overrides an existing tag; user-edited contracts
 * with explicit tags pass through unchanged. The §8 misclassification
 * recovery path covers the case where a tag turns out to be wrong:
 * the strategy fails, the obligation reroutes to synthesis, the
 * ledger captures the failure for later analysis.
 */
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
exports.tagObligations = tagObligations;
exports.pickStrategyForFile = pickStrategyForFile;
exports.tagSummary = tagSummary;
exports.isKnownBoilerplate = isKnownBoilerplate;
const path = __importStar(require("path"));
const strategy_constants_1 = require("../shared-wasm/strategy-constants");
/**
 * Tag every obligation in the list. Returns a new array; input is
 * never mutated. Each obligation either gets a `deterministicStrategy`
 * filled in (when the heuristic fires AND the strategy is registered)
 * or is returned untouched.
 */
function tagObligations(obligations, options) {
    const available = new Set(options.availableStrategies);
    return obligations.map((o) => tagOne(o, available));
}
function tagOne(o, available) {
    if (o.deterministicStrategy !== undefined)
        return o;
    if (o.type !== 'file-must-exist')
        return o;
    const candidate = pickStrategyForFile(o.path, available);
    if (candidate === null)
        return o;
    return { ...o, deterministicStrategy: candidate };
}
/**
 * Pick the most specific strategy that fits a `file-must-exist` path.
 * Priority order:
 *   1. `scaffold-template` if a registered template basename / extension
 *      matches the path. This covers boilerplate (LICENSE, .gitignore,
 *      README.md, CHANGELOG.md, .editorconfig, plain .md/.txt scaffolds).
 *
 * `import-sort` and `format-prettier` are NOT auto-tagged on the
 * file-must-exist path: import-sort needs an existing file to be
 * useful, and format-prettier on a brand-new file with empty content
 * just produces an empty newline, which the user almost never wants by
 * default. Both remain available for explicit tagging via contract
 * editing.
 */
function pickStrategyForFile(relPath, available) {
    if (available.has('scaffold-template') && (0, strategy_constants_1.hasTemplateFor)(relPath)) {
        return 'scaffold-template';
    }
    return null;
}
/**
 * Diagnostic helper. Returns counts of how many obligations got tagged
 * and how many were left for synthesis. Used by the CLI to surface a
 * one-line summary after compilation.
 */
function tagSummary(before, after) {
    if (before.length !== after.length) {
        throw new Error(`tagSummary expects parallel arrays; before.length=${before.length} after.length=${after.length}`);
    }
    const byStrategy = {};
    let tagged = 0;
    for (let i = 0; i < after.length; i += 1) {
        const a = after[i];
        if (!a)
            continue;
        if (a.deterministicStrategy !== undefined) {
            tagged += 1;
            byStrategy[a.deterministicStrategy] = (byStrategy[a.deterministicStrategy] ?? 0) + 1;
        }
    }
    return { tagged, untagged: after.length - tagged, byStrategy };
}
/** Pure helper: is this filename a known auto-taggable boilerplate? */
function isKnownBoilerplate(relPath) {
    return (0, strategy_constants_1.hasTemplateFor)(path.basename(relPath));
}
