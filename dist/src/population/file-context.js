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
exports.appendFileContext = appendFileContext;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// 6 KB ≈ 1500 tokens — covers a typical controller/route file without
// dominating the prompt budget.
const FILE_CONTEXT_MAX_BYTES = 6 * 1024;
const TOTAL_FILE_CONTEXT_MAX_BYTES = 16 * 1024;
// Without inlining current file contents, personas guess at context
// lines and diffs hit "context mismatch" errors (May 2026 eval failure
// mode).
function appendFileContext(lines, repoRoot, paths) {
    let remaining = TOTAL_FILE_CONTEXT_MAX_BYTES;
    const seen = new Set();
    for (const relPath of paths) {
        if (remaining <= 0)
            break;
        if (seen.has(relPath))
            continue;
        seen.add(relPath);
        let abs;
        try {
            abs = path.resolve(repoRoot, relPath);
        }
        catch {
            continue;
        }
        // Defense: reject paths that escape repoRoot via ../
        const rel = path.relative(repoRoot, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel))
            continue;
        if (!fs.existsSync(abs))
            continue;
        let body;
        try {
            body = fs.readFileSync(abs, 'utf8');
        }
        catch {
            continue;
        }
        const truncated = body.length > FILE_CONTEXT_MAX_BYTES;
        const slice = truncated ? body.slice(0, FILE_CONTEXT_MAX_BYTES) : body;
        const byteCost = slice.length + 80;
        if (byteCost > remaining)
            continue;
        remaining -= byteCost;
        lines.push('');
        lines.push(`Current contents of ${relPath} (use these exact lines as diff context):`);
        lines.push('```');
        lines.push(slice + (truncated ? '\n[…truncated…]' : ''));
        lines.push('```');
    }
}
