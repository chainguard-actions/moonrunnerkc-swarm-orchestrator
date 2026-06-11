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
const compiler_1 = require("../../src/contract/compiler");
const serializer_1 = require("../../src/contract/serializer");
const compile_handler_1 = require("../../src/cli/v8/compile-handler");
const resume_handler_1 = require("../../src/cli/v8/resume-handler");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const run_handler_1 = require("../../src/cli/v8/run-handler");
const ledger_1 = require("../../src/ledger/ledger");
const stub_session_1 = require("../../src/session/stub-session");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-resume-int-'));
}
describe('integration: swarm v8 resume', () => {
    it('resumes a partial run and finishes the remaining obligation without redoing satisfied work', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({
            name: 'wf',
            private: true,
            scripts: { build: "node -e ''", test: "node -e ''" },
        }, null, 2));
        fs.writeFileSync(path.join(work, 'tsconfig.json'), '{}');
        // Build a 6-file-must-exist contract directly via finalize() so we
        // get a deterministic obligation count regardless of the goal-parser
        // heuristics. Phase 4 §7 exit criterion: 5/6 then resume.
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'add 6 service health files',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'services/svc-1/health.ts' },
                { type: 'file-must-exist', path: 'services/svc-2/health.ts' },
                { type: 'file-must-exist', path: 'services/svc-3/health.ts' },
                { type: 'file-must-exist', path: 'services/svc-4/health.ts' },
                { type: 'file-must-exist', path: 'services/svc-5/health.ts' },
                { type: 'file-must-exist', path: 'services/svc-6/health.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        // First run: kill after the 5th obligation by capping --max-obligations.
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const session1 = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nfile body\n```' : 'no-op'),
        });
        const result1Path = path.join(work, 'r1.json');
        const exit1 = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--result', result1Path,
            '--run-id', 'partial-run',
            '--max-obligations', '5',
            // Phase 6 features add pre-generation + post-merge passes; this
            // test asserts Phase 4 behavior (memoization), so opt out.
            '--no-streaming',
            '--no-pre-generation',
            '--no-post-merge',
        ], { session: session1 });
        assert_1.strict.equal(exit1, 0);
        const r1 = JSON.parse(fs.readFileSync(result1Path, 'utf8'));
        // Capped at 5 obligations attempted; the run reports just the 5 it
        // attempted (the manager doesn't push outcomes for un-attempted
        // obligations).
        assert_1.strict.equal(r1.satisfied, 5);
        assert_1.strict.equal(r1.failed, 0);
        // Verify the chain on the partial ledger.
        assert_1.strict.doesNotThrow(() => (0, ledger_1.verifyChainAt)(ledgerPath));
        // Resume with a fresh session; should pick up the un-attempted
        // obligations and write a `run-resumed` marker.
        const session2 = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nfile body\n```' : 'no-op'),
        });
        const result2Path = path.join(work, 'r2.json');
        const exit2 = await (0, resume_handler_1.handleResume)([
            'resumed-run',
            '--ledger', ledgerPath,
            '--contract', contractDir,
            '--repo-root', work,
            '--result', result2Path,
            '--no-streaming',
            '--no-pre-generation',
            '--no-post-merge',
        ], { session: session2 });
        assert_1.strict.equal(exit2, 0);
        const r2 = JSON.parse(fs.readFileSync(result2Path, 'utf8'));
        assert_1.strict.equal(r2.resumeOf, 'partial-run');
        // 5 prior-satisfied obligations are memoized; the contract has 8
        // total. Resume's outcomes list contains only the un-attempted
        // obligations (the manager doesn't push outcomes for memoized
        // skips). Together: memoized + freshly-attempted = 8.
        assert_1.strict.equal(r2.memoizedObligations, 5);
        assert_1.strict.equal(r2.memoizedObligations + r2.outcomes.length, contract.obligations.length);
        assert_1.strict.equal(r2.failed, 0);
        // The fresh outcomes cover only the un-attempted obligations.
        assert_1.strict.ok(r2.outcomes.length >= 1);
        // Ledger chain remains valid after resume.
        assert_1.strict.doesNotThrow(() => (0, ledger_1.verifyChainAt)(ledgerPath));
        // Ledger contains the run-resumed marker plus obligation-memoized
        // entries for the prior-satisfied indexes.
        const entries = (0, ledger_1.readEntries)(ledgerPath);
        const types = entries.map((e) => e.type);
        assert_1.strict.ok(types.includes('run-resumed'));
        const memoCount = types.filter((t) => t === 'obligation-memoized').length;
        assert_1.strict.equal(memoCount, 5, 'one memoized entry per prior-satisfied obligation');
    });
    it('aborts when the ledger chain is tampered', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }));
        fs.writeFileSync(path.join(work, 'tsconfig.json'), '{}');
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'add CHANGES.md',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], { extractor: stub_extractor_1.StubExtractor.fromHeuristic() });
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const session1 = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nbody\n```' : 'no-op'),
        });
        await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--run-id', 'orig',
            '--max-obligations', '2',
            '--no-streaming',
            '--no-pre-generation',
            '--no-post-merge',
        ], { session: session1 });
        // Tamper with the ledger: edit a goal field.
        const text = fs.readFileSync(ledgerPath, 'utf8');
        fs.writeFileSync(ledgerPath, text.replace(/"goal":"[^"]*"/, '"goal":"hacked"'));
        const exitTamper = await (0, resume_handler_1.handleResume)([
            'resume-after-tamper',
            '--ledger', ledgerPath,
            '--contract', contractDir,
            '--repo-root', work,
        ], { session: new stub_session_1.StubSession({ projectContext: 'CTX' }) });
        assert_1.strict.equal(exitTamper, 4, 'tamper exit code is 4');
    });
    it('resume rejects argv with no run id', async () => {
        const exit = await (0, resume_handler_1.handleResume)([]);
        assert_1.strict.equal(exit, 1);
    });
    it('resume returns 1 when ledger does not exist', async () => {
        const work = tmpDir();
        const exit = await (0, resume_handler_1.handleResume)([
            'no-such-run',
            '--ledger', path.join(work, 'no-such.jsonl'),
            '--repo-root', work,
        ]);
        assert_1.strict.equal(exit, 1);
    });
});
