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
exports.extractImports = extractImports;
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const ts = __importStar(require("typescript"));
/**
 * AST-backed import extractor for the `import-graph-must-satisfy`
 * obligation type.
 *
 * Replaces the v8.0 regex matcher: TypeScript / JavaScript files are
 * parsed with the TypeScript compiler API; Python files are parsed with
 * the `ast` module via a python3 subprocess. Each call returns the list
 * of module specifiers the file imports — relative paths, bare specifiers,
 * package paths, all in the original textual form.
 *
 * The verifier's downstream resolution (mapping a relative spec back to
 * a tracked file, walking the local graph) consumes that string list
 * exactly as the regex matcher used to. This module changes how imports
 * are discovered, not how the constraint is evaluated.
 */
const PY_EXTRACTOR_SOURCE = `
import ast, json, sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    source = f.read()

try:
    tree = ast.parse(source, filename=sys.argv[1])
except SyntaxError as exc:
    print(json.dumps({'error': 'syntax: ' + str(exc), 'specs': []}))
    sys.exit(0)

specs = []

class Visitor(ast.NodeVisitor):
    def visit_Import(self, node):
        for alias in node.names:
            specs.append(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        # Reconstruct the textual form: "." * level + module
        prefix = '.' * (node.level or 0)
        module = node.module or ''
        specs.append(prefix + module)
        self.generic_visit(node)

Visitor().visit(tree)
print(json.dumps({'specs': specs}))
`;
const TS_LIKE_EXTS = new Set(['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs']);
const PY_EXTS = new Set(['.py']);
const DEFAULT_PY_TIMEOUT_MS = 30_000;
/**
 * Extract every import specifier from `body`, picking the right parser
 * based on `absFilePath`'s extension. Returns a flat string list in
 * source order; downstream code is responsible for resolving relative
 * paths and applying constraint-specific rules.
 *
 * Parser failures (Python subprocess unavailable, invalid syntax) return
 * an empty list so the import-graph constraint still falls through to a
 * clear, non-violating verdict on files the parser cannot read; the
 * verifier surfaces parser errors in the obligation detail string when
 * `error` is non-empty.
 */
function extractImports(absFilePath, body, options = {}) {
    const ext = path.extname(absFilePath).toLowerCase();
    if (PY_EXTS.has(ext)) {
        return extractPythonImports(absFilePath, options);
    }
    if (TS_LIKE_EXTS.has(ext) || ext === '') {
        return { specs: extractTypeScriptImports(absFilePath, body) };
    }
    return { specs: extractTypeScriptImports(absFilePath, body) };
}
function extractTypeScriptImports(absFilePath, body) {
    const specs = [];
    const sourceFile = ts.createSourceFile(absFilePath, body, ts.ScriptTarget.Latest, 
    /*setParentNodes*/ true, pickScriptKind(absFilePath));
    function visit(node) {
        // import ... from 'spec';      side-effect import 'spec';
        if (ts.isImportDeclaration(node)) {
            const lit = node.moduleSpecifier;
            if (ts.isStringLiteral(lit))
                specs.push(lit.text);
        }
        // export ... from 'spec';
        else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            const lit = node.moduleSpecifier;
            if (ts.isStringLiteral(lit))
                specs.push(lit.text);
        }
        // import x = require('spec');
        else if (ts.isImportEqualsDeclaration(node)) {
            const ref = node.moduleReference;
            if (ts.isExternalModuleReference(ref) && ts.isStringLiteral(ref.expression)) {
                specs.push(ref.expression.text);
            }
        }
        // require('spec') call expression
        else if (ts.isCallExpression(node)) {
            const callee = node.expression;
            if (ts.isIdentifier(callee) &&
                callee.text === 'require' &&
                node.arguments.length === 1) {
                const arg = node.arguments[0];
                if (arg && ts.isStringLiteral(arg))
                    specs.push(arg.text);
            }
            // import('spec') dynamic import
            if (callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) {
                const arg = node.arguments[0];
                if (arg && ts.isStringLiteral(arg))
                    specs.push(arg.text);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return specs;
}
function extractPythonImports(absFilePath, options) {
    const pythonBin = options.pythonBin ?? process.env.SWARM_PYTHON_BIN ?? 'python3';
    const timeout = options.pythonTimeoutMs ?? DEFAULT_PY_TIMEOUT_MS;
    const result = (0, child_process_1.spawnSync)(pythonBin, ['-c', PY_EXTRACTOR_SOURCE, absFilePath], {
        encoding: 'utf8',
        timeout,
    });
    if (result.error) {
        const code = result.error.code;
        const why = code === 'ENOENT'
            ? `python3 not found on PATH (looked for "${pythonBin}"); install Python 3 or set SWARM_PYTHON_BIN`
            : code === 'ETIMEDOUT'
                ? `python AST parser timed out after ${timeout}ms`
                : result.error.message;
        return { specs: [], error: why };
    }
    if (result.status !== 0) {
        const tail = (result.stderr || result.stdout || '').slice(-512).trim();
        return {
            specs: [],
            error: `python AST parser exited ${result.status ?? 'null'}${tail ? `: ${tail}` : ''}`,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(result.stdout || '{}');
    }
    catch (err) {
        return { specs: [], error: `python AST parser produced non-JSON output: ${err.message}` };
    }
    if (parsed.error)
        return { specs: parsed.specs ?? [], error: parsed.error };
    return { specs: parsed.specs ?? [] };
}
function pickScriptKind(absFilePath) {
    const ext = path.extname(absFilePath).toLowerCase();
    if (ext === '.tsx')
        return ts.ScriptKind.TSX;
    if (ext === '.jsx')
        return ts.ScriptKind.JSX;
    if (ext === '.js' || ext === '.cjs' || ext === '.mjs')
        return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}
