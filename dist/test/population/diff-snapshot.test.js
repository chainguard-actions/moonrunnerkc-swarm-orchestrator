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
const diff_snapshot_1 = require("../../src/population/diff-snapshot");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('population/diff-snapshot', () => {
    it('file-must-exist against a non-existent path records preBlobSha absent', () => {
        const repo = tmpDir('v8-snap-');
        const obligation = { type: 'file-must-exist', path: 'new-file.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 0, '```\nhello\n```');
        assert_1.strict.ok(pre);
        assert_1.strict.equal(pre.files.length, 1);
        assert_1.strict.equal(pre.files[0]?.path, 'new-file.ts');
        assert_1.strict.equal(pre.files[0]?.preBlobSha, 'absent');
    });
    it('file-must-exist against an existing file matches git hash-object', () => {
        const repo = tmpDir('v8-snap-');
        const content = 'existing content\n';
        fs.writeFileSync(path.join(repo, 'old-file.ts'), content, 'utf8');
        const obligation = { type: 'file-must-exist', path: 'old-file.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 1, '```\nnew\n```');
        assert_1.strict.ok(pre);
        assert_1.strict.equal(pre.files.length, 1);
        const gitSha = require('child_process')
            .execSync('git hash-object --stdin', { input: content, cwd: repo })
            .toString()
            .trim();
        assert_1.strict.equal(pre.files[0]?.preBlobSha, gitSha);
    });
    it('unified diff touching three files enumerates all three', () => {
        const repo = tmpDir('v8-snap-');
        const diff = [
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,1 +1,2 @@',
            ' x',
            '+y',
            '--- a/src/b.ts',
            '+++ b/src/b.ts',
            '@@ -1,1 +1,2 @@',
            ' a',
            '+b',
            '--- a/src/c.ts',
            '+++ b/src/c.ts',
            '@@ -1,1 +1,2 @@',
            ' p',
            '+q',
        ].join('\n');
        fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
        fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'x\n', 'utf8');
        fs.writeFileSync(path.join(repo, 'src', 'b.ts'), 'a\n', 'utf8');
        fs.writeFileSync(path.join(repo, 'src', 'c.ts'), 'p\n', 'utf8');
        const obligation = { type: 'build-must-pass', command: 'true' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 2, diff);
        assert_1.strict.ok(pre);
        assert_1.strict.equal(pre.files.length, 3);
        const paths = pre.files.map((f) => f.path).sort();
        assert_1.strict.deepEqual(paths, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });
    it('response of literal no-op returns null', () => {
        const repo = tmpDir('v8-snap-');
        const obligation = { type: 'build-must-pass', command: 'true' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 0, 'no-op');
        assert_1.strict.equal(pre, null);
    });
    it('response that is neither no-op nor unified diff returns null', () => {
        const repo = tmpDir('v8-snap-');
        const obligation = { type: 'build-must-pass', command: 'true' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 0, 'just some prose');
        assert_1.strict.equal(pre, null);
    });
    it('sidecar directory contains original pre-apply bytes', () => {
        const repo = tmpDir('v8-snap-');
        const content = Buffer.from('binary\x00data\n');
        fs.writeFileSync(path.join(repo, 'target.bin'), content);
        const obligation = { type: 'file-must-exist', path: 'target.bin' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'run-1', obligation, 3, '```\nnew\n```');
        assert_1.strict.ok(pre);
        const sha = pre.files[0]?.preBlobSha;
        assert_1.strict.ok(sha && sha !== 'absent');
        const sidecar = path.join(repo, '.swarm', 'snapshots', 'run-1', '3', sha);
        assert_1.strict.ok(fs.existsSync(sidecar));
        const sidecarBytes = fs.readFileSync(sidecar);
        assert_1.strict.ok(content.equals(sidecarBytes));
    });
});
