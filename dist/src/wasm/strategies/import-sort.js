"use strict";
/**
 * `import-sort` strategy: sort the import section at the top of a
 * TypeScript / JavaScript / Python file alphabetically. When the file
 * doesn't exist this strategy fails (the contract compiler should pair
 * `import-sort` with another strategy or with synthesis for creation
 * obligations); the §8 misclassification recovery path then reroutes
 * the obligation to synthesis.
 *
 * The implementation is deliberately language-aware in a tiny way: it
 * recognizes ESM/CJS imports for TS/JS and `import` lines for Python.
 * The sort is stable, case-insensitive, and preserves blank lines and
 * non-import content below the import block.
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
exports.importSortStrategy = void 0;
exports.sortImports = sortImports;
exports.isImportSortable = isImportSortable;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const wasm_runtime_1 = require("../wasm-runtime");
const TS_JS_IMPORT_RE = /^\s*(?:import\b[\s\S]*?(?:from\s+["'][^"']+["'])?\s*;?|(?:const|let|var)\s+[\s\S]*?=\s*require\([^)]+\)\s*;?)\s*$/;
const PY_IMPORT_RE = /^\s*(?:import\s+\S+|from\s+\S+\s+import\s+.+)\s*$/;
function detectLanguage(relPath) {
    const ext = path.extname(relPath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
        return 'ts-js';
    }
    if (ext === '.py')
        return 'python';
    return null;
}
function planSort(content, language) {
    const lines = content.split('\n');
    const before = [];
    const imports = [];
    const after = [];
    // Phase 1: collect leading non-import lines (preserve license headers,
    // shebangs, top-of-file comments).
    let i = 0;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        if (line.trim() === '') {
            before.push(line);
            i += 1;
            continue;
        }
        if (line.startsWith('#!') || line.startsWith('//') || line.startsWith('/*')) {
            before.push(line);
            i += 1;
            continue;
        }
        if (language === 'python' && (line.startsWith('"""') || line.startsWith('#'))) {
            before.push(line);
            i += 1;
            continue;
        }
        break;
    }
    // Phase 2: collect contiguous import lines.
    const importRe = language === 'python' ? PY_IMPORT_RE : TS_JS_IMPORT_RE;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        if (importRe.test(line)) {
            imports.push(line);
            i += 1;
            continue;
        }
        if (line.trim() === '' && imports.length > 0) {
            // Allow blank lines between imports without ending the block;
            // remember them for re-emission after the sort.
            let j = i;
            while (j < lines.length && (lines[j] ?? '').trim() === '')
                j += 1;
            const peek = lines[j] ?? '';
            if (j < lines.length && importRe.test(peek)) {
                i = j;
                continue;
            }
        }
        break;
    }
    // Phase 3: everything else.
    while (i < lines.length) {
        after.push(lines[i] ?? '');
        i += 1;
    }
    return { before, imports, after, language };
}
function renderSorted(plan) {
    const sortedImports = plan.imports
        .slice()
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const out = [];
    out.push(...plan.before);
    out.push(...sortedImports);
    if (plan.after.length > 0)
        out.push(...plan.after);
    return out.join('\n');
}
/** Pure function: sort a content string. Used by tests. */
function sortImports(content, relPath) {
    const language = detectLanguage(relPath);
    if (language === null) {
        throw new Error(`import-sort: unsupported file type "${relPath}"; expected .ts/.tsx/.js/.jsx/.mjs/.cjs/.py`);
    }
    const plan = planSort(content, language);
    if (plan.imports.length === 0) {
        return content;
    }
    return renderSorted(plan);
}
/** The strategy implementation. */
exports.importSortStrategy = {
    name: 'import-sort',
    description: 'Alphabetize imports at the top of a TS/JS/Python file in place.',
    handles: ['file-must-exist'],
    async execute(ctx) {
        const obligation = ctx.obligation;
        if (obligation.type !== 'file-must-exist') {
            throw new Error(`import-sort only handles file-must-exist; got ${obligation.type}`);
        }
        const relPath = obligation.path;
        const language = detectLanguage(relPath);
        if (language === null) {
            throw new Error(`import-sort: unsupported file type "${relPath}"; expected .ts/.tsx/.js/.jsx/.mjs/.cjs/.py`);
        }
        const abs = (0, wasm_runtime_1.ensureInsideRepoRoot)(ctx.repoRoot, relPath);
        if (!fs.existsSync(abs)) {
            throw new Error(`import-sort: file ${relPath} does not exist; pair the obligation with a creation strategy or use synthesis`);
        }
        const before = fs.readFileSync(abs, 'utf8');
        const after = sortImports(before, relPath);
        if (after === before) {
            return {
                applied: false,
                detail: `${relPath} imports already sorted`,
                filesAffected: [],
            };
        }
        fs.writeFileSync(abs, after, 'utf8');
        return {
            applied: true,
            detail: `sorted imports in ${relPath}`,
            filesAffected: [relPath],
        };
    },
};
/** Auto-tagger helper: should this obligation be tagged `import-sort`? */
function isImportSortable(relPath) {
    return detectLanguage(relPath) !== null;
}
