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
const child_process_1 = require("child_process");
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const loader_1 = require("../../../benchmarks/falsification-corpus/loader");
describe('falsification corpus loader', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falsification-corpus-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('loads verification-run entries from real git branch merges', async () => {
        const fixture = createVerificationRunFixture();
        const entries = await (0, loader_1.loadCorpus)(fixture.corpusRoot);
        assert_1.strict.equal(entries.length, 1);
        assert_1.strict.equal(entries[0].id, 'round2-codex-slugify-step-1');
        assert_1.strict.equal(entries[0].source, 'verification-run');
        assert_1.strict.equal(entries[0].goalText, 'Fix the sample bug');
        assert_1.strict.equal(entries[0].repoPath, fixture.repoPath);
        assert_1.strict.equal(entries[0].baseCommit, fixture.baseCommit);
        assert_1.strict.equal(entries[0].patchCommit, fixture.mergeCommit);
        assert_1.strict.deepEqual(entries[0].agentIdentity, { cli: 'codex', model: 'gpt-5.4' });
        assert_1.strict.equal(entries[0].transcriptPath, fixture.sharePath);
        assert_1.strict.equal(entries[0].metadata.capturedAt, '2026-04-29T00:00:00.000Z');
        assert_1.strict.equal(entries[0].metadata.runDir, fixture.runDir);
        assert_1.strict.equal(entries[0].metadata.stepNumber, 1);
    });
    it('halts with actionable issues when expected step artifacts are missing', async () => {
        const fixture = createVerificationRunFixture({ omitVerification: true });
        await assert_1.strict.rejects(() => (0, loader_1.loadCorpus)(fixture.corpusRoot), (error) => {
            assert_1.strict.ok(error instanceof loader_1.CorpusLoaderError);
            assert_1.strict.equal(error.issues.length, 1);
            assert_1.strict.equal(error.issues[0].phase, 'step-1');
            assert_1.strict.match(error.issues[0].reason, /missing verification report/);
            assert_1.strict.match(error.message, /Restore verification\/step-N-verification\.md/);
            return true;
        });
    });
    function createVerificationRunFixture(options = {}) {
        const corpusRoot = path.join(tmpDir, 'verification-runs');
        const repoPath = path.join(corpusRoot, 'round-2-target', 'codex-slugify');
        const branchName = 'swarm/swarm-2026-04-29T00-00-00-001Z/step-1-worker';
        fs.mkdirSync(repoPath, { recursive: true });
        git(repoPath, ['init', '-b', 'master']);
        git(repoPath, ['config', 'user.name', 'Falsification Corpus Test']);
        git(repoPath, ['config', 'user.email', 'corpus-test@example.com']);
        write(path.join(repoPath, 'index.js'), 'module.exports = () => "old";\n');
        commitAll(repoPath, 'initial');
        git(repoPath, ['switch', '-c', branchName]);
        write(path.join(repoPath, 'index.js'), 'module.exports = () => "new";\n');
        commitAll(repoPath, 'fix sample bug');
        git(repoPath, ['switch', 'master']);
        const runDir = path.join(repoPath, 'runs', 'swarm-2026-04-29T00-00-00-000Z');
        const sharePath = path.join(runDir, 'steps', 'step-1', 'share.md');
        writeRunArtifacts(runDir, sharePath, branchName, options.omitVerification === true);
        git(repoPath, ['merge', '--no-ff', branchName, '-m', `Merge ${branchName}`]);
        const mergeCommit = git(repoPath, ['rev-parse', 'HEAD']);
        return {
            corpusRoot,
            repoPath,
            runDir,
            sharePath,
            baseCommit: git(repoPath, ['rev-parse', `${mergeCommit}^1`]),
            mergeCommit,
        };
    }
    function writeRunArtifacts(runDir, sharePath, branchName, omitVerification) {
        write(path.join(runDir, 'session-state.json'), JSON.stringify({
            graph: { goal: 'Fix the sample bug', steps: [{ stepNumber: 1 }] },
            branchMap: { '1': branchName },
            transcripts: { '1': sharePath },
        }));
        write(path.join(runDir, 'metrics.json'), JSON.stringify({ executionId: 'swarm-2026-04-29T00-00-00-001Z' }));
        write(path.join(runDir, 'cost-attribution.json'), JSON.stringify({ modelUsed: 'gpt-5.4' }));
        write(sharePath, '# Agent Session Transcript\n');
        if (!omitVerification) {
            write(path.join(runDir, 'verification', 'step-1-verification.md'), '# Verification Report\n');
        }
    }
});
function write(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}
function git(repoPath, args) {
    return (0, child_process_1.execFileSync)('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}
function commitAll(repoPath, message) {
    git(repoPath, ['add', '.']);
    git(repoPath, [
        '-c',
        'user.name=Falsification Corpus Test',
        '-c',
        'user.email=falsification-corpus@example.test',
        'commit',
        '-m',
        message,
    ]);
}
