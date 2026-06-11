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
const whole_file_apply_1 = require("../../src/population/whole-file-apply");
function tmpRepo(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('population/whole-file-apply', () => {
    describe('looksLikeWholeFileResponse', () => {
        it('detects a single-block response', () => {
            const text = '<<<FILE src/x.js\nconst a = 1;\nFILE>>>';
            assert_1.strict.equal((0, whole_file_apply_1.looksLikeWholeFileResponse)(text), true);
        });
        it('detects a multi-block response', () => {
            const text = '<<<FILE a.js\nfoo\nFILE>>>\n<<<FILE b.js\nbar\nFILE>>>';
            assert_1.strict.equal((0, whole_file_apply_1.looksLikeWholeFileResponse)(text), true);
        });
        it('rejects a unified diff', () => {
            const text = '--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye';
            assert_1.strict.equal((0, whole_file_apply_1.looksLikeWholeFileResponse)(text), false);
        });
        it('rejects no-op', () => {
            assert_1.strict.equal((0, whole_file_apply_1.looksLikeWholeFileResponse)('no-op'), false);
        });
    });
    describe('parseWholeFileBlocks', () => {
        it('extracts one block with body verbatim', () => {
            const text = '<<<FILE src/x.js\nconst a = 1;\nconst b = 2;\nFILE>>>';
            const blocks = (0, whole_file_apply_1.parseWholeFileBlocks)(text);
            assert_1.strict.equal(blocks.length, 1);
            assert_1.strict.equal(blocks[0].relPath, 'src/x.js');
            assert_1.strict.equal(blocks[0].body, 'const a = 1;\nconst b = 2;');
        });
        it('extracts multiple blocks', () => {
            const text = '<<<FILE a.js\nfoo\nFILE>>>\n<<<FILE sub/b.js\nbar\nbaz\nFILE>>>';
            const blocks = (0, whole_file_apply_1.parseWholeFileBlocks)(text);
            assert_1.strict.equal(blocks.length, 2);
            assert_1.strict.equal(blocks[0].relPath, 'a.js');
            assert_1.strict.equal(blocks[1].relPath, 'sub/b.js');
            assert_1.strict.equal(blocks[1].body, 'bar\nbaz');
        });
        it('throws when a block is not closed', () => {
            const text = '<<<FILE a.js\nfoo\nbar\n';
            assert_1.strict.throws(() => (0, whole_file_apply_1.parseWholeFileBlocks)(text), /never closed/);
        });
        it('ignores prose between blocks', () => {
            const text = 'Here are two files:\n<<<FILE a.js\nfoo\nFILE>>>\nAnd this one:\n<<<FILE b.js\nbar\nFILE>>>';
            const blocks = (0, whole_file_apply_1.parseWholeFileBlocks)(text);
            assert_1.strict.equal(blocks.length, 2);
        });
    });
    describe('applyWholeFileResponse', () => {
        it('writes a single file verbatim', () => {
            const repo = tmpRepo('wf-apply-single-');
            try {
                const text = '<<<FILE src/x.js\nconst a = 1;\nFILE>>>';
                const r = (0, whole_file_apply_1.applyWholeFileResponse)(repo, text);
                assert_1.strict.equal(r.applied, true);
                assert_1.strict.deepEqual(r.changedFiles, ['src/x.js']);
                assert_1.strict.equal(fs.readFileSync(path.join(repo, 'src/x.js'), 'utf8'), 'const a = 1;\n');
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
        it('overwrites an existing file', () => {
            const repo = tmpRepo('wf-apply-overwrite-');
            try {
                fs.writeFileSync(path.join(repo, 'x.js'), 'OLD\n');
                const text = '<<<FILE x.js\nNEW\nFILE>>>';
                (0, whole_file_apply_1.applyWholeFileResponse)(repo, text);
                assert_1.strict.equal(fs.readFileSync(path.join(repo, 'x.js'), 'utf8'), 'NEW\n');
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
        it('refuses to overwrite a protected path', () => {
            const repo = tmpRepo('wf-apply-protected-');
            try {
                fs.writeFileSync(path.join(repo, 'x.js'), 'ORIGINAL\n');
                const text = '<<<FILE x.js\nSTOMP\nFILE>>>';
                const r = (0, whole_file_apply_1.applyWholeFileResponse)(repo, text, {
                    protectedPaths: new Set(['x.js']),
                });
                assert_1.strict.equal(r.applied, false);
                assert_1.strict.match(r.detail, /skipped 1 protected/);
                assert_1.strict.equal(fs.readFileSync(path.join(repo, 'x.js'), 'utf8'), 'ORIGINAL\n');
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
        it('rejects paths that escape repoRoot', () => {
            const repo = tmpRepo('wf-apply-escape-');
            try {
                const text = '<<<FILE ../oops.js\nbad\nFILE>>>';
                assert_1.strict.throws(() => (0, whole_file_apply_1.applyWholeFileResponse)(repo, text), /escapes repo root/);
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
        it('truncation guard rejects a dramatically shortened file', () => {
            const repo = tmpRepo('wf-apply-trunc-');
            try {
                // Big existing file (40 lines).
                const big = Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n');
                fs.writeFileSync(path.join(repo, 'big.js'), big);
                // Persona response replaces with only 3 lines — likely truncation.
                const text = '<<<FILE big.js\nA\nB\nC\nFILE>>>';
                const r = (0, whole_file_apply_1.applyWholeFileResponse)(repo, text);
                assert_1.strict.equal(r.applied, false);
                assert_1.strict.match(r.detail, /truncation guard/);
                // Original preserved.
                assert_1.strict.equal(fs.readFileSync(path.join(repo, 'big.js'), 'utf8'), big);
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
        it('preserves multi-line bodies including blank lines', () => {
            const repo = tmpRepo('wf-apply-blanks-');
            try {
                const body = "const a = 1;\n\nconst b = 2;\n\nmodule.exports = { a, b };";
                const text = `<<<FILE x.js\n${body}\nFILE>>>`;
                (0, whole_file_apply_1.applyWholeFileResponse)(repo, text);
                assert_1.strict.equal(fs.readFileSync(path.join(repo, 'x.js'), 'utf8'), body + '\n');
            }
            finally {
                fs.rmSync(repo, { recursive: true, force: true });
            }
        });
    });
});
