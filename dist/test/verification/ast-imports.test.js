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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ast_imports_1 = require("../../src/verification/ast-imports");
/**
 * Tests for the AST-backed import extractor. These cover shapes the
 * v8.0 regex matcher could not parse — multi-line imports, dynamic
 * `import()` calls, `import x = require(...)` — and shapes that would
 * have produced false positives — `require` inside a string literal,
 * `import` keyword inside a comment.
 */
describe('verification/ast-imports', () => {
    let repoRoot;
    beforeEach(() => {
        repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-imp-'));
    });
    afterEach(() => {
        if (repoRoot)
            fs.rmSync(repoRoot, { recursive: true, force: true });
    });
    function write(rel, body) {
        const abs = path.join(repoRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body, 'utf8');
        return abs;
    }
    it('extracts a multi-line import statement that the regex matcher could miss', () => {
        const abs = write('src/a.ts', [
            'import {',
            '  a,',
            '  b,',
            '  c,',
            "} from './neighbors';",
            '',
        ].join('\n'));
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['./neighbors']);
    });
    it('extracts a dynamic import() call', () => {
        const abs = write('src/b.ts', `const m = await import('./lazy');\n`);
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['./lazy']);
    });
    it('extracts `import x = require(...)` (TypeScript namespace import form)', () => {
        const abs = write('src/c.ts', `import fs = require('fs');\n`);
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['fs']);
    });
    it('does NOT pick up `require("...")` inside a string literal (regex-matcher false positive)', () => {
        const abs = write('src/d.ts', `export const sample = "require('something-evil')";\nexport const real = require('fs');\n`);
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['fs']);
    });
    it('does NOT pick up an import keyword sitting inside a // comment', () => {
        const abs = write('src/e.ts', `// import './ghost';\nimport './real';\n`);
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['./real']);
    });
    it('extracts an `export ... from` re-export', () => {
        const abs = write('src/f.ts', `export { x } from './x';\n`);
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        assert_1.strict.deepEqual(out.specs, ['./x']);
    });
    it('extracts Python `from .pkg import name` and `import a.b` via the python3 ast module', function () {
        const abs = write('src/g.py', ['from .sibling import Foo', 'from ..parent import Bar', 'import os.path', 'import a, b as c', ''].join('\n'));
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        if (out.error && /python3 not found/.test(out.error)) {
            this.skip();
            return;
        }
        // Order: ImportFrom emits "<dots><module>" once; Import emits each alias.
        assert_1.strict.deepEqual(out.specs, ['.sibling', '..parent', 'os.path', 'a', 'b']);
    });
    it('does NOT pick up Python imports inside a string literal or comment', function () {
        const abs = write('src/h.py', [
            '# from .ghost import Bad',
            'doc = "from .ghost import Bad"',
            'from .real import Good',
            '',
        ].join('\n'));
        const body = fs.readFileSync(abs, 'utf8');
        const out = (0, ast_imports_1.extractImports)(abs, body);
        if (out.error && /python3 not found/.test(out.error)) {
            this.skip();
            return;
        }
        assert_1.strict.deepEqual(out.specs, ['.real']);
    });
});
