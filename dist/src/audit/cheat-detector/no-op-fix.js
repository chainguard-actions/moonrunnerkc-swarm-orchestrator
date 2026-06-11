"use strict";
// No-op-fix: the PR claims to fix a failing test, but the modified
// non-test code has no plausible relationship to the failing test's
// import closure. Approximated without running tests: we collect the
// set of *source files* the PR touches, the set of *test files* the
// PR touches, and the set of *symbols added or modified in source*
// vs *symbols referenced in test changes*. If no test was modified
// (i.e., the fix-claim came from the PR title/body only) we still
// require *some* overlap between modified source filenames and the
// test files' import paths reachable from the repo on disk.
//
// "No overlap" is a high-recall, low-precision signal — useful as a
// warning paired with the PR's stated "fix:" intent.
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
exports.noOpFixDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const SYMBOL_RE = /\b([A-Za-z_][A-Za-z0-9_]{1,})\b/g;
const COMMON_NOISE = new Set([
    'if', 'else', 'return', 'const', 'let', 'var', 'function', 'class', 'true',
    'false', 'null', 'undefined', 'import', 'from', 'export', 'default', 'new',
    'this', 'await', 'async', 'for', 'while', 'switch', 'case', 'break', 'continue',
    'try', 'catch', 'finally', 'throw', 'instanceof', 'typeof', 'void', 'in', 'of',
    'expect', 'it', 'test', 'describe', 'beforeEach', 'afterEach', 'beforeAll',
    'afterAll', 'toBe', 'toEqual', 'toBeDefined', 'toBeTruthy', 'toBeFalsy',
    'mock', 'fn', 'spy', 'string', 'number', 'boolean', 'any', 'object',
]);
exports.noOpFixDetector = {
    name: 'no-op-fix',
    version: VERSION,
    run(ctx) {
        const sourceTouched = [];
        const testTouched = [];
        for (const file of ctx.files) {
            if (!(0, diff_walker_1.shouldInspect)(file))
                continue;
            if ((0, diff_walker_1.fileKind)(file) === 'delete')
                continue;
            const p = (0, diff_walker_1.filePath)(file);
            if ((0, diff_walker_1.isTestFile)(p))
                testTouched.push(p);
            else
                sourceTouched.push(p);
        }
        if (sourceTouched.length === 0 && testTouched.length === 0)
            return [];
        const sourceSymbols = collectSymbolsFromAddedLines(ctx, (p) => !(0, diff_walker_1.isTestFile)(p));
        const testSymbols = collectSymbolsFromAddedLines(ctx, (p) => (0, diff_walker_1.isTestFile)(p));
        const findings = [];
        if (testTouched.length === 0 && sourceTouched.length > 0) {
            const overlapped = testFilesReferencingSource(ctx.repoRoot, sourceTouched);
            if (overlapped.length === 0 && sourceSymbols.size > 0) {
                // PR modifies source but no test imports any of the touched
                // files. Either there is no test for the modified code or the
                // patch missed the failing path.
                for (const file of sourceTouched) {
                    findings.push({
                        category: 'no-op-fix',
                        severity: 'warn',
                        message: `Source file ${file} was modified but no test file in the repository ` +
                            `imports it, directly or transitively. If this PR claimed to fix a ` +
                            `failing test, the fix likely missed the failing code path.`,
                        location: { file, line: 1 },
                        evidence: `(touched: ${sourceTouched.join(', ')})`,
                    });
                }
            }
            return findings;
        }
        if (testTouched.length > 0 && sourceTouched.length === 0) {
            // Tests were modified with no source changes at all. This is the
            // canonical "fix the test, not the bug" pattern.
            for (const file of testTouched) {
                findings.push({
                    category: 'no-op-fix',
                    severity: 'block',
                    message: `Test file ${file} was modified but no source file changed in this PR. ` +
                        `If the PR claims to fix a failing test, the change likely edits the ` +
                        `test rather than the failing implementation.`,
                    location: { file, line: 1 },
                    evidence: `(touched: ${testTouched.join(', ')})`,
                });
            }
            return findings;
        }
        // Both source and tests touched: check symbol overlap.
        const overlap = intersect(sourceSymbols, testSymbols);
        if (overlap.size === 0 && testSymbols.size > 0 && sourceSymbols.size > 0) {
            for (const file of testTouched) {
                findings.push({
                    category: 'no-op-fix',
                    severity: 'warn',
                    message: `Test changes in ${file} share no identifier with the source changes ` +
                        `in this PR. The modified test may not exercise the modified code.`,
                    location: { file, line: 1 },
                    evidence: `(source touched: ${sourceTouched.join(', ')})`,
                });
            }
        }
        return findings;
    },
};
function collectSymbolsFromAddedLines(ctx, predicate) {
    const out = new Set();
    for (const file of ctx.files) {
        if (!(0, diff_walker_1.shouldInspect)(file))
            continue;
        const p = (0, diff_walker_1.filePath)(file);
        if (!predicate(p))
            continue;
        for (const chunk of file.chunks) {
            for (const change of chunk.changes) {
                if (change.type !== 'add')
                    continue;
                for (const sym of extractSymbols(change.content)) {
                    out.add(sym);
                }
            }
        }
    }
    return out;
}
function extractSymbols(line) {
    const out = [];
    let m;
    SYMBOL_RE.lastIndex = 0;
    while ((m = SYMBOL_RE.exec(line)) !== null) {
        const sym = m[1];
        if (sym === undefined)
            continue;
        if (sym.length < 3)
            continue;
        if (COMMON_NOISE.has(sym))
            continue;
        out.push(sym);
    }
    return out;
}
function intersect(a, b) {
    const out = new Set();
    for (const v of a)
        if (b.has(v))
            out.add(v);
    return out;
}
function testFilesReferencingSource(repoRoot, sourceTouched) {
    if (!fs.existsSync(repoRoot))
        return [];
    const allTests = [];
    walkDir(repoRoot, repoRoot, allTests, 0);
    const sourceBasenames = new Set(sourceTouched.map((p) => path.basename(p, path.extname(p))));
    const matched = [];
    for (const testFile of allTests) {
        const text = readSafe(testFile);
        for (const stem of sourceBasenames) {
            if (text.includes(stem)) {
                matched.push(testFile);
                break;
            }
        }
    }
    return matched;
}
function walkDir(repoRoot, dir, out, depth) {
    if (depth > 6)
        return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(repoRoot, full, out, depth + 1);
        }
        else if (entry.isFile()) {
            const rel = path.relative(repoRoot, full);
            if ((0, diff_walker_1.isTestFile)(rel))
                out.push(full);
        }
    }
}
function readSafe(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    }
    catch (err) {
        throw new Error(`no-op-fix: failed to read ${file}: ${err.message}`, { cause: err });
    }
}
