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
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const diff_snapshot_1 = require("../../src/population/diff-snapshot");
const rollback_1 = require("../../src/population/rollback");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('population/rollback', () => {
    it('happy path: file-must-exist on absent pre-apply unlinks file', async () => {
        const repo = tmpDir('v8-rb-');
        const obligation = { type: 'file-must-exist', path: 'created.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'r1', obligation, 0, '```\nhello\n```');
        assert_1.strict.ok(pre);
        fs.writeFileSync(path.join(repo, 'created.ts'), 'hello\n', 'utf8');
        const postSha = (0, diff_snapshot_1.gitHashObject)(fs.readFileSync(path.join(repo, 'created.ts')));
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 0,
            files: [
                { path: 'created.ts', preBlobSha: 'absent', expectedPostBlobSha: postSha },
            ],
        });
        const rb = await (0, rollback_1.rollbackObligation)(0, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb.success, true);
        assert_1.strict.equal(rb.restoredFiles.length, 1);
        assert_1.strict.equal(rb.restoredFiles[0]?.restoredBlobSha, 'absent');
        assert_1.strict.equal(fs.existsSync(path.join(repo, 'created.ts')), false);
    });
    it('happy path: existing file restored to pre-apply content', async () => {
        const repo = tmpDir('v8-rb-');
        const original = 'original\n';
        fs.writeFileSync(path.join(repo, 'mutated.ts'), original, 'utf8');
        const obligation = { type: 'file-must-exist', path: 'mutated.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'r1', obligation, 1, '```\nnew\n```');
        assert_1.strict.ok(pre);
        fs.writeFileSync(path.join(repo, 'mutated.ts'), 'new\n', 'utf8');
        const postSha = (0, diff_snapshot_1.gitHashObject)(fs.readFileSync(path.join(repo, 'mutated.ts')));
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const files = pre.files.map((f) => ({
            path: f.path,
            preBlobSha: f.preBlobSha,
            expectedPostBlobSha: postSha,
        }));
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 1,
            files,
        });
        const rb = await (0, rollback_1.rollbackObligation)(1, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb.success, true);
        assert_1.strict.equal(rb.restoredFiles.length, 1);
        const restored = fs.readFileSync(path.join(repo, 'mutated.ts'), 'utf8');
        assert_1.strict.equal(restored, original);
        assert_1.strict.equal(rb.restoredFiles[0]?.restoredBlobSha, pre.files[0]?.preBlobSha);
    });
    it('recovery invariant violated: corrupt sidecar detected', async () => {
        const repo = tmpDir('v8-rb-');
        const original = 'original\n';
        fs.writeFileSync(path.join(repo, 'bad.ts'), original, 'utf8');
        const obligation = { type: 'file-must-exist', path: 'bad.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'r1', obligation, 2, '```\nnew\n```');
        assert_1.strict.ok(pre);
        fs.writeFileSync(path.join(repo, 'bad.ts'), 'new\n', 'utf8');
        const postSha = (0, diff_snapshot_1.gitHashObject)(fs.readFileSync(path.join(repo, 'bad.ts')));
        // Corrupt the sidecar so rollback writes garbage.
        const sha = pre.files[0]?.preBlobSha;
        assert_1.strict.ok(sha && sha !== 'absent');
        const sidecar = path.join(repo, '.swarm', 'snapshots', 'r1', '2', sha);
        fs.writeFileSync(sidecar, 'garbage\n');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const files = pre.files.map((f) => ({
            path: f.path,
            preBlobSha: f.preBlobSha,
            expectedPostBlobSha: postSha,
        }));
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 2,
            files,
        });
        const rb = await (0, rollback_1.rollbackObligation)(2, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb.success, false);
        assert_1.strict.equal(rb.failure?.kind, 'recovery-invariant-violated');
        assert_1.strict.equal(rb.failure?.offendingPath, 'bad.ts');
    });
    it('state-mismatch: out-of-band mutation detected', async () => {
        const repo = tmpDir('v8-rb-');
        const original = 'original\n';
        fs.writeFileSync(path.join(repo, 'stale.ts'), original, 'utf8');
        const obligation = { type: 'file-must-exist', path: 'stale.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'r1', obligation, 3, '```\nnew\n```');
        assert_1.strict.ok(pre);
        fs.writeFileSync(path.join(repo, 'stale.ts'), 'new\n', 'utf8');
        const postSha = (0, diff_snapshot_1.gitHashObject)(fs.readFileSync(path.join(repo, 'stale.ts')));
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const files = pre.files.map((f) => ({
            path: f.path,
            preBlobSha: f.preBlobSha,
            expectedPostBlobSha: postSha,
        }));
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 3,
            files,
        });
        // Mutate out-of-band.
        fs.writeFileSync(path.join(repo, 'stale.ts'), 'tampered\n', 'utf8');
        const rb = await (0, rollback_1.rollbackObligation)(3, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb.success, false);
        assert_1.strict.equal(rb.failure?.kind, 'state-mismatch');
        assert_1.strict.equal(rb.failure?.offendingPath, 'stale.ts');
        const onDisk = fs.readFileSync(path.join(repo, 'stale.ts'), 'utf8');
        assert_1.strict.equal(onDisk, 'tampered\n');
    });
    it('idempotency: second rollback is a no-op', async () => {
        const repo = tmpDir('v8-rb-');
        const original = 'original\n';
        fs.writeFileSync(path.join(repo, 'idempotent.ts'), original, 'utf8');
        const obligation = { type: 'file-must-exist', path: 'idempotent.ts' };
        const pre = (0, diff_snapshot_1.snapshotBeforeApply)(repo, 'r1', obligation, 4, '```\nnew\n```');
        assert_1.strict.ok(pre);
        fs.writeFileSync(path.join(repo, 'idempotent.ts'), 'new\n', 'utf8');
        const postSha = (0, diff_snapshot_1.gitHashObject)(fs.readFileSync(path.join(repo, 'idempotent.ts')));
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const files = pre.files.map((f) => ({
            path: f.path,
            preBlobSha: f.preBlobSha,
            expectedPostBlobSha: postSha,
        }));
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 4,
            files,
        });
        const rb1 = await (0, rollback_1.rollbackObligation)(4, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb1.success, true);
        const rb2 = await (0, rollback_1.rollbackObligation)(4, ledger, repo, 'r1', 'per-obligation-falsification');
        assert_1.strict.equal(rb2.success, true);
        assert_1.strict.equal(rb2.restoredFiles[0]?.restoredBlobSha, pre.files[0]?.preBlobSha);
        const onDisk = fs.readFileSync(path.join(repo, 'idempotent.ts'), 'utf8');
        assert_1.strict.equal(onDisk, original);
    });
    it('no-snapshot-found: returns cleanly without touching workspace', async () => {
        const repo = tmpDir('v8-rb-');
        fs.writeFileSync(path.join(repo, 'unchanged.ts'), 'x\n', 'utf8');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const rb = await (0, rollback_1.rollbackObligation)(99, ledger, repo, 'r1', 'post-merge-regression');
        assert_1.strict.equal(rb.success, false);
        assert_1.strict.equal(rb.failure?.kind, 'no-snapshot-found');
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'unchanged.ts'), 'utf8'), 'x\n');
    });
});
