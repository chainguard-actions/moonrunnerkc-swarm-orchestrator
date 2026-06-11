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
const wasm_1 = require("../../src/wasm");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-strat-'));
}
function ctxFor(repo, obligation) {
    return { obligation, repoRoot: repo, scratch: tmpDir(), timeoutMs: 5000 };
}
const fileObl = (relPath) => ({
    type: 'file-must-exist',
    path: relPath,
});
describe('wasm/strategies/scaffold-template', () => {
    it('writes from a basename template (LICENSE)', async () => {
        const repo = tmpDir();
        const result = await wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('LICENSE')));
        assert_1.strict.equal(result.applied, true);
        const body = fs.readFileSync(path.join(repo, 'LICENSE'), 'utf8');
        assert_1.strict.ok(body.startsWith('ISC License'));
    });
    it('writes from an extension template (.md)', async () => {
        const repo = tmpDir();
        const result = await wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('docs/note.md')));
        assert_1.strict.equal(result.applied, true);
        assert_1.strict.ok(fs.existsSync(path.join(repo, 'docs/note.md')));
    });
    it('skips when the file already exists (non-destructive)', async () => {
        const repo = tmpDir();
        const target = path.join(repo, 'README.md');
        fs.writeFileSync(target, 'existing content', 'utf8');
        const result = await wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('README.md')));
        assert_1.strict.equal(result.applied, false);
        assert_1.strict.equal(fs.readFileSync(target, 'utf8'), 'existing content');
    });
    it('throws when no template matches the path', async () => {
        const repo = tmpDir();
        await assert_1.strict.rejects(() => wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('src/code.weird'))), /no template registered/);
    });
    it('rejects path traversal via the sandbox', async () => {
        const repo = tmpDir();
        await assert_1.strict.rejects(() => wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('../escape.md'))), /escapes repoRoot/);
    });
    it('throws on the wrong obligation type', async () => {
        const repo = tmpDir();
        const buildObl = { type: 'build-must-pass', command: 'true' };
        await assert_1.strict.rejects(() => wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, buildObl)), /only handles file-must-exist/);
    });
    it('hasTemplateFor recognizes registered basenames and extensions', () => {
        assert_1.strict.equal((0, wasm_1.hasTemplateFor)('LICENSE'), true);
        assert_1.strict.equal((0, wasm_1.hasTemplateFor)('subdir/LICENSE'), true);
        assert_1.strict.equal((0, wasm_1.hasTemplateFor)('foo.md'), true);
        assert_1.strict.equal((0, wasm_1.hasTemplateFor)('foo.weird'), false);
    });
    it('registerTemplate adds a custom basename template', async () => {
        const repo = tmpDir();
        (0, wasm_1.registerTemplate)({ kind: 'basename', value: 'CUSTOM' }, 'custom body');
        assert_1.strict.equal((0, wasm_1.hasTemplateFor)('CUSTOM'), true);
        const result = await wasm_1.scaffoldTemplateStrategy.execute(ctxFor(repo, fileObl('CUSTOM')));
        assert_1.strict.equal(result.applied, true);
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'CUSTOM'), 'utf8'), 'custom body\n');
    });
    it('listTemplateKeys exposes the registered key set', () => {
        const keys = (0, wasm_1.listTemplateKeys)();
        assert_1.strict.ok(keys.basenames.includes('LICENSE'));
        assert_1.strict.ok(keys.extensions.includes('.md'));
    });
});
describe('wasm/strategies/import-sort', () => {
    it('sortImports alphabetizes a TS import block', () => {
        const before = ["import b from 'b';", "import a from 'a';", '', 'export const x = 1;'].join('\n');
        const after = (0, wasm_1.sortImports)(before, 'src/x.ts');
        assert_1.strict.match(after, /^import a from 'a';\nimport b from 'b';/);
    });
    it('sortImports leaves a file with no imports unchanged', () => {
        const content = 'export const x = 1;\n';
        const after = (0, wasm_1.sortImports)(content, 'src/x.ts');
        assert_1.strict.equal(after, content);
    });
    it('sortImports preserves a leading shebang or comment', () => {
        const before = ['#!/usr/bin/env node', "import b from 'b';", "import a from 'a';"].join('\n');
        const after = (0, wasm_1.sortImports)(before, 'src/x.ts');
        const lines = after.split('\n');
        assert_1.strict.equal(lines[0], '#!/usr/bin/env node');
        assert_1.strict.equal(lines[1], "import a from 'a';");
        assert_1.strict.equal(lines[2], "import b from 'b';");
    });
    it('sortImports handles Python imports', () => {
        const before = ['import zlib', 'import abc', '', 'def main():', '    pass'].join('\n');
        const after = (0, wasm_1.sortImports)(before, 'foo.py');
        assert_1.strict.match(after, /^import abc\nimport zlib/);
    });
    it('sortImports throws on unsupported file types', () => {
        assert_1.strict.throws(() => (0, wasm_1.sortImports)('', 'foo.txt'), /unsupported file type/);
    });
    it('strategy fails fast when the file does not exist', async () => {
        const repo = tmpDir();
        await assert_1.strict.rejects(() => wasm_1.importSortStrategy.execute(ctxFor(repo, fileObl('src/missing.ts'))), /file src\/missing\.ts does not exist/);
    });
    it('strategy applies in place', async () => {
        const repo = tmpDir();
        fs.mkdirSync(path.join(repo, 'src'));
        const file = path.join(repo, 'src/x.ts');
        fs.writeFileSync(file, "import b from 'b';\nimport a from 'a';\n", 'utf8');
        const result = await wasm_1.importSortStrategy.execute(ctxFor(repo, fileObl('src/x.ts')));
        assert_1.strict.equal(result.applied, true);
        const after = fs.readFileSync(file, 'utf8');
        assert_1.strict.match(after, /^import a from 'a';\nimport b from 'b';/);
    });
    it('strategy reports already-sorted as no-op', async () => {
        const repo = tmpDir();
        fs.mkdirSync(path.join(repo, 'src'));
        const file = path.join(repo, 'src/x.ts');
        fs.writeFileSync(file, "import a from 'a';\nimport b from 'b';\n", 'utf8');
        const result = await wasm_1.importSortStrategy.execute(ctxFor(repo, fileObl('src/x.ts')));
        assert_1.strict.equal(result.applied, false);
    });
    it('isImportSortable recognizes the supported extensions', () => {
        assert_1.strict.equal((0, wasm_1.isImportSortable)('foo.ts'), true);
        assert_1.strict.equal((0, wasm_1.isImportSortable)('foo.tsx'), true);
        assert_1.strict.equal((0, wasm_1.isImportSortable)('foo.js'), true);
        assert_1.strict.equal((0, wasm_1.isImportSortable)('foo.py'), true);
        assert_1.strict.equal((0, wasm_1.isImportSortable)('foo.md'), false);
    });
});
describe('wasm/strategies/format-prettier', () => {
    it('formatBody normalizes line endings', () => {
        assert_1.strict.equal((0, wasm_1.formatBody)('a\r\nb\r\n', 'foo.ts'), 'a\nb\n');
    });
    it('formatBody strips trailing whitespace per line', () => {
        assert_1.strict.equal((0, wasm_1.formatBody)('foo   \nbar\t\n', 'foo.ts'), 'foo\nbar\n');
    });
    it('formatBody pretty-prints JSON when the content parses', () => {
        const out = (0, wasm_1.formatBody)('{"b":2,"a":1}', 'pkg.json');
        // JSON.stringify preserves insertion order; we pretty-print as-is.
        assert_1.strict.equal(out, '{\n  "b": 2,\n  "a": 1\n}\n');
    });
    it('formatBody falls back to text rules on bad JSON', () => {
        const out = (0, wasm_1.formatBody)('not json\n', 'pkg.json');
        assert_1.strict.equal(out, 'not json\n');
    });
    it('formatBody converts leading tabs to two spaces', () => {
        assert_1.strict.equal((0, wasm_1.formatBody)('\t\tfoo\n', 'foo.ts'), '    foo\n');
    });
    it('strategy creates a missing file with empty-formatted body', async () => {
        const repo = tmpDir();
        const result = await wasm_1.formatPrettierStrategy.execute(ctxFor(repo, fileObl('a/b.ts')));
        assert_1.strict.equal(result.applied, true);
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'a/b.ts'), 'utf8'), '\n');
    });
    it('strategy is a no-op on already-formatted files', async () => {
        const repo = tmpDir();
        const file = path.join(repo, 'x.ts');
        fs.writeFileSync(file, 'foo\n', 'utf8');
        const result = await wasm_1.formatPrettierStrategy.execute(ctxFor(repo, fileObl('x.ts')));
        assert_1.strict.equal(result.applied, false);
    });
    it('strategy rewrites unformatted files', async () => {
        const repo = tmpDir();
        const file = path.join(repo, 'x.ts');
        fs.writeFileSync(file, 'foo  \r\n', 'utf8');
        const result = await wasm_1.formatPrettierStrategy.execute(ctxFor(repo, fileObl('x.ts')));
        assert_1.strict.equal(result.applied, true);
        assert_1.strict.equal(fs.readFileSync(file, 'utf8'), 'foo\n');
    });
});
