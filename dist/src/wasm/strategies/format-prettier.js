"use strict";
/**
 * `format-prettier` strategy: format a file with prettier-style rules.
 *
 * Phase 5 ships an in-process formatter rather than shelling out to the
 * `prettier` binary. The §8 spec carves the formatter wrapper as
 * orchestration (when to run it, which files, on which obligations);
 * the actual formatting can be a native binary OR an in-process
 * transformation of equivalent shape. We pick in-process here because
 * the orchestrator's tests must run on machines without `prettier`
 * installed and because it makes the strategy zero-dependency.
 *
 * Supported rewrites (the deterministic subset that matters for v8
 * obligations):
 *   - normalize line endings to LF;
 *   - strip trailing whitespace from every non-blank line;
 *   - ensure exactly one trailing newline;
 *   - normalize indentation: convert leading tabs to two spaces.
 *   - JSON files: pretty-print with 2-space indent and a trailing LF.
 *
 * When the obligation file does not exist this strategy creates it
 * with empty body (post-format that becomes a single newline). The
 * §8 misclassification recovery path is unused here because every
 * file path is format-eligible.
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
exports.formatPrettierStrategy = void 0;
exports.formatBody = formatBody;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const wasm_runtime_1 = require("../wasm-runtime");
const JSON_LIKE_EXTENSIONS = new Set(['.json', '.jsonc']);
/** Pure function: format a content string. Exported for tests. */
function formatBody(content, relPath) {
    const ext = path.extname(relPath).toLowerCase();
    if (JSON_LIKE_EXTENSIONS.has(ext) && content.trim().length > 0) {
        try {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2) + '\n';
        }
        catch {
            // Fall through to the generic path below; a non-JSON file under
            // a .json extension is unusual but the formatter still tidies it.
        }
    }
    const normalizedEol = content.replace(/\r\n?/g, '\n');
    const tabsToSpaces = normalizedEol.replace(/^(?:\t+)/gm, (m) => '  '.repeat(m.length));
    const trimmed = tabsToSpaces
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/u, ''))
        .join('\n');
    const stripped = trimmed.replace(/\n+$/u, '');
    return stripped + '\n';
}
/** The strategy implementation. */
exports.formatPrettierStrategy = {
    name: 'format-prettier',
    description: 'Format a file with prettier-style rules (LF, trim, 2-space indent, JSON pretty-print).',
    handles: ['file-must-exist'],
    async execute(ctx) {
        const obligation = ctx.obligation;
        if (obligation.type !== 'file-must-exist') {
            throw new Error(`format-prettier only handles file-must-exist; got ${obligation.type}`);
        }
        const relPath = obligation.path;
        const abs = (0, wasm_runtime_1.ensureInsideRepoRoot)(ctx.repoRoot, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
        const after = formatBody(before, relPath);
        if (fs.existsSync(abs) && after === before) {
            return {
                applied: false,
                detail: `${relPath} already formatted`,
                filesAffected: [],
            };
        }
        fs.writeFileSync(abs, after, 'utf8');
        return {
            applied: true,
            detail: fs.existsSync(abs) && before.length > 0
                ? `formatted ${relPath}`
                : `created and formatted ${relPath}`,
            filesAffected: [relPath],
        };
    },
};
