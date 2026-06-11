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
exports.extractFencedBody = extractFencedBody;
exports.writeFileObligation = writeFileObligation;
exports.applyFileEmit = applyFileEmit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parse a fenced code block out of an assistant response. Tolerates
 * leading/trailing prose. Returns the body content (without the fences).
 * Returns null when no fenced block is found.
 */
function extractFencedBody(text) {
    const fence = /```[a-zA-Z0-9_+\-.]*\n([\s\S]*?)```/m;
    const match = text.match(fence);
    if (!match)
        return null;
    // The captured group ends with the newline before the closing fence; trim
    // exactly one trailing newline to keep file content faithful.
    return match[1] !== undefined ? match[1].replace(/\n$/, '') : null;
}
/**
 * Write a file body to the obligation's target path. Idempotent: writes
 * even if the file already exists (the population manager decides whether
 * to skip already-satisfied obligations via the predicate evaluator).
 */
function writeFileObligation(repoRoot, relPath, body) {
    if (path.isAbsolute(relPath)) {
        return {
            applied: false,
            writtenPath: null,
            detail: `target path ${relPath} is absolute; v8 contracts use repo-relative paths`,
        };
    }
    const abs = path.join(repoRoot, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    // Ensure file ends with a single trailing newline.
    const normalized = body.endsWith('\n') ? body : body + '\n';
    fs.writeFileSync(abs, normalized, 'utf8');
    return { applied: true, writtenPath: abs, detail: `wrote ${relPath}` };
}
/**
 * Persona response → on-disk file. Phase 2's only synthesis path: the
 * architect persona writes a single file when the obligation is
 * file-must-exist. Returns whether the apply step succeeded; the caller
 * runs verifier separately.
 */
function applyFileEmit(repoRoot, relPath, responseText) {
    const body = extractFencedBody(responseText);
    if (body === null) {
        // Treat the entire response as the file body when no fence is present.
        // This matches stub-session output, which never emits fences but is the
        // primary integration-test path for Phase 2.
        return writeFileObligation(repoRoot, relPath, responseText);
    }
    return writeFileObligation(repoRoot, relPath, body);
}
