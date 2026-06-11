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
const unified_diff_1 = require("../../src/population/unified-diff");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('population/unified-diff', () => {
    describe('looksLikeUnifiedDiff', () => {
        it('detects standard unified diffs', () => {
            const diff = '--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n';
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)(diff), true);
        });
        it('detects fenced diffs', () => {
            const diff = '```diff\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n```';
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)(diff), true);
        });
        it('rejects fenced code that is not a diff', () => {
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)('```\nhello\n```'), false);
        });
        it('rejects no-op text', () => {
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)('no-op'), false);
        });
        it('detects a diff preceded by prose preamble', () => {
            const diff = 'Here is the patch:\n\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n';
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)(diff), true);
        });
        it('detects a diff preceded by multi-paragraph prose', () => {
            const diff = [
                'I analyzed the obligation.',
                '',
                'The predicate requires the route to be registered.',
                '',
                '--- a/x',
                '+++ b/x',
                '@@ -1,1 +1,2 @@',
                ' hi',
                '+bye',
            ].join('\n');
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)(diff), true);
        });
        it('detects a diff wrapped in ```diff fences with extra whitespace', () => {
            const diff = '\n```diff\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n```\n';
            assert_1.strict.equal((0, unified_diff_1.looksLikeUnifiedDiff)(diff), true);
        });
    });
    describe('stripDiffPreamble', () => {
        it('returns the input unchanged when no diff header is present', () => {
            const text = 'Just some prose with no diff header.';
            assert_1.strict.equal((0, unified_diff_1.stripDiffPreamble)(text), text);
        });
        it('strips a leading "Here is the diff:" prose line', () => {
            const diff = 'Here is the diff:\n\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n';
            const out = (0, unified_diff_1.stripDiffPreamble)(diff);
            assert_1.strict.ok(out.startsWith('--- a/x\n'), `expected diff to start with --- a/x; got: ${out.slice(0, 60)}`);
        });
        it('strips ```diff fences', () => {
            const diff = '```diff\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n hi\n+bye\n```';
            const out = (0, unified_diff_1.stripDiffPreamble)(diff);
            assert_1.strict.ok(out.startsWith('--- a/x\n'));
        });
    });
    describe('parseUnifiedDiff', () => {
        it('parses a single-file create patch', () => {
            const diff = [
                '--- /dev/null',
                '+++ b/new.txt',
                '@@ -0,0 +1,2 @@',
                '+line one',
                '+line two',
            ].join('\n');
            const patches = (0, unified_diff_1.parseUnifiedDiff)(diff);
            assert_1.strict.equal(patches.length, 1);
            const p = patches[0];
            assert_1.strict.ok(p);
            assert_1.strict.equal(p.isCreate, true);
            assert_1.strict.equal(p.newPath, 'new.txt');
            assert_1.strict.equal(p.hunks.length, 1);
        });
        it('parses a modify patch with multiple hunks', () => {
            const diff = [
                '--- a/x.txt',
                '+++ b/x.txt',
                '@@ -1,2 +1,2 @@',
                '-old1',
                '+new1',
                ' shared',
                '@@ -10,1 +10,2 @@',
                ' anchor',
                '+new10',
            ].join('\n');
            const patches = (0, unified_diff_1.parseUnifiedDiff)(diff);
            assert_1.strict.equal(patches.length, 1);
            const p = patches[0];
            assert_1.strict.ok(p);
            assert_1.strict.equal(p.isCreate, false);
            assert_1.strict.equal(p.isDelete, false);
            assert_1.strict.equal(p.hunks.length, 2);
        });
        it('throws on missing +++ header', () => {
            const diff = '--- a/x\n@@ -1,1 +1,1 @@\n hi\n';
            assert_1.strict.throws(() => (0, unified_diff_1.parseUnifiedDiff)(diff), /\+\+\+/);
        });
        it('throws on malformed hunk header', () => {
            const diff = '--- a/x\n+++ b/x\n@@ malformed @@\n hi\n';
            assert_1.strict.throws(() => (0, unified_diff_1.parseUnifiedDiff)(diff), /malformed hunk/);
        });
        it('handles git-style "diff --git" preamble lines', () => {
            const diff = [
                'diff --git a/x.txt b/x.txt',
                'index abc..def 100644',
                '--- a/x.txt',
                '+++ b/x.txt',
                '@@ -1,1 +1,1 @@',
                '-old',
                '+new',
            ].join('\n');
            const patches = (0, unified_diff_1.parseUnifiedDiff)(diff);
            assert_1.strict.equal(patches.length, 1);
        });
    });
    describe('applyUnifiedDiff with prose preamble', () => {
        it('applies a diff even when the persona prefixes it with prose', () => {
            const repo = tmpDir('v8-diff-prose-');
            const diff = [
                'Here is the patch:',
                '',
                '--- /dev/null',
                '+++ b/new.txt',
                '@@ -0,0 +1,1 @@',
                '+hello',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true, `expected applied=true; detail: ${r.detail}`);
            assert_1.strict.deepEqual(r.changedFiles, ['new.txt']);
            assert_1.strict.equal(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), 'hello\n');
        });
        it('applies a diff wrapped in ```diff fences', () => {
            const repo = tmpDir('v8-diff-fenced-');
            const diff = [
                '```diff',
                '--- /dev/null',
                '+++ b/new.txt',
                '@@ -0,0 +1,1 @@',
                '+hello',
                '```',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true, `expected applied=true; detail: ${r.detail}`);
            assert_1.strict.equal(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), 'hello\n');
        });
    });
    describe('applyUnifiedDiff', () => {
        it('creates a new file from a /dev/null patch', () => {
            const repo = tmpDir('v8-diff-');
            const diff = [
                '--- /dev/null',
                '+++ b/new.txt',
                '@@ -0,0 +1,2 @@',
                '+hello',
                '+world',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true);
            assert_1.strict.deepEqual(r.changedFiles, ['new.txt']);
            assert_1.strict.equal(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), 'hello\nworld\n');
        });
        it('modifies an existing file', () => {
            const repo = tmpDir('v8-diff-');
            fs.writeFileSync(path.join(repo, 'x.txt'), 'one\ntwo\nthree\n');
            const diff = [
                '--- a/x.txt',
                '+++ b/x.txt',
                '@@ -1,3 +1,3 @@',
                ' one',
                '-two',
                '+TWO',
                ' three',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true);
            assert_1.strict.equal(fs.readFileSync(path.join(repo, 'x.txt'), 'utf8'), 'one\nTWO\nthree\n');
        });
        it('skips patches whose target is in protectedPaths and applies the rest', () => {
            const repo = tmpDir('v8-diff-');
            // Pre-existing architect-owned file we want to keep intact.
            const protectedPath = 'test/architect-owned.test.js';
            const protectedAbs = path.join(repo, protectedPath);
            fs.mkdirSync(path.dirname(protectedAbs), { recursive: true });
            fs.writeFileSync(protectedAbs, "import 'a';\n// architect body\n");
            // Multi-file diff: one patch targets the protected path (overwrite
            // attempt) and a second targets an unrelated path.
            const diff = [
                '--- /dev/null',
                '+++ b/' + protectedPath,
                '@@ -0,0 +1,1 @@',
                '+stomped',
                '--- /dev/null',
                '+++ b/notes.txt',
                '@@ -0,0 +1,1 @@',
                '+ok',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff, {
                protectedPaths: new Set([protectedPath]),
            });
            assert_1.strict.equal(r.applied, true);
            assert_1.strict.deepEqual(r.changedFiles, ['notes.txt']);
            assert_1.strict.match(r.detail, /skipped 1/);
            // Architect's body intact.
            assert_1.strict.equal(fs.readFileSync(protectedAbs, 'utf8'), "import 'a';\n// architect body\n");
            // Unrelated file written.
            assert_1.strict.equal(fs.readFileSync(path.join(repo, 'notes.txt'), 'utf8'), 'ok\n');
        });
        it('allows modify-in-place patches against protected paths (additive edits)', () => {
            const repo = tmpDir('v8-diff-protect-modify-');
            const protectedPath = 'src/controllers/user.controller.js';
            const protectedAbs = path.join(repo, protectedPath);
            fs.mkdirSync(path.dirname(protectedAbs), { recursive: true });
            fs.writeFileSync(protectedAbs, "const a = 1;\nconst b = 2;\n");
            // A modify-in-place patch — adds a new line. The architect's
            // body is preserved (no overwrite), the new line is appended.
            const diff = [
                '--- a/' + protectedPath,
                '+++ b/' + protectedPath,
                '@@ -1,2 +1,3 @@',
                ' const a = 1;',
                ' const b = 2;',
                '+const c = 3;',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff, {
                protectedPaths: new Set([protectedPath]),
            });
            assert_1.strict.equal(r.applied, true, `expected applied=true; detail: ${r.detail}`);
            assert_1.strict.deepEqual(r.changedFiles, [protectedPath]);
            // The original lines are still there AND the new line was added.
            const after = fs.readFileSync(protectedAbs, 'utf8');
            assert_1.strict.match(after, /const a = 1;/);
            assert_1.strict.match(after, /const b = 2;/);
            assert_1.strict.match(after, /const c = 3;/);
        });
        it('still blocks create patches that target protected paths', () => {
            const repo = tmpDir('v8-diff-protect-create-');
            const protectedPath = 'src/controllers/user.controller.js';
            const protectedAbs = path.join(repo, protectedPath);
            fs.mkdirSync(path.dirname(protectedAbs), { recursive: true });
            fs.writeFileSync(protectedAbs, '// architect body\n');
            // A CREATE patch attempts to overwrite — the architect's body
            // would be replaced. Must be blocked.
            const diff = [
                '--- /dev/null',
                '+++ b/' + protectedPath,
                '@@ -0,0 +1,1 @@',
                '+stomped',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff, {
                protectedPaths: new Set([protectedPath]),
            });
            assert_1.strict.equal(r.applied, false);
            assert_1.strict.match(r.detail, /skipped 1/);
            assert_1.strict.equal(fs.readFileSync(protectedAbs, 'utf8'), '// architect body\n');
        });
        it('deletes a file when +++ /dev/null', () => {
            const repo = tmpDir('v8-diff-');
            const target = path.join(repo, 'goodbye.txt');
            fs.writeFileSync(target, 'bye\n');
            const diff = [
                '--- a/goodbye.txt',
                '+++ /dev/null',
                '@@ -1,1 +0,0 @@',
                '-bye',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true);
            assert_1.strict.equal(fs.existsSync(target), false);
        });
        it('treats "no-op" as a non-applying success', () => {
            const repo = tmpDir('v8-diff-');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, 'no-op');
            assert_1.strict.equal(r.applied, false);
            assert_1.strict.equal(r.detail, 'no-op');
        });
        it('refuses non-diff text', () => {
            const repo = tmpDir('v8-diff-');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, 'this is prose, not a diff');
            assert_1.strict.equal(r.applied, false);
            assert_1.strict.match(r.detail, /not a unified diff/);
        });
        it('throws on context mismatch', () => {
            const repo = tmpDir('v8-diff-');
            fs.writeFileSync(path.join(repo, 'x.txt'), 'real content\n');
            const diff = [
                '--- a/x.txt',
                '+++ b/x.txt',
                '@@ -1,1 +1,1 @@',
                '-different content',
                '+new content',
            ].join('\n');
            assert_1.strict.throws(() => (0, unified_diff_1.applyUnifiedDiff)(repo, diff), /context mismatch/);
        });
        it('refuses absolute paths', () => {
            const repo = tmpDir('v8-diff-');
            const diff = [
                '--- /dev/null',
                '+++ /etc/passwd',
                '@@ -0,0 +1,1 @@',
                '+evil',
            ].join('\n');
            assert_1.strict.throws(() => (0, unified_diff_1.applyUnifiedDiff)(repo, diff), /escapes repo root|absolute/);
        });
        it('handles multi-file patches in a single response', () => {
            const repo = tmpDir('v8-diff-');
            const diff = [
                '--- /dev/null',
                '+++ b/a.txt',
                '@@ -0,0 +1,1 @@',
                '+a',
                '--- /dev/null',
                '+++ b/b.txt',
                '@@ -0,0 +1,1 @@',
                '+b',
            ].join('\n');
            const r = (0, unified_diff_1.applyUnifiedDiff)(repo, diff);
            assert_1.strict.equal(r.applied, true);
            assert_1.strict.deepEqual(r.changedFiles.sort(), ['a.txt', 'b.txt']);
        });
    });
});
