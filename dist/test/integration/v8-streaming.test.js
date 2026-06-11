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
const run_handler_1 = require("../../src/cli/v8/run-handler");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const stub_session_1 = require("../../src/session/stub-session");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-stream-int-'));
}
describe('integration: v8 streaming + pre-gen + post-merge (Phase 6)', () => {
    it('aborts a doomed obligation mid-generation (§9 exit (a))', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'add a doomed file',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'src/doomed.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            // Architect emits a forbidden import early; rest of the response
            // would create a viable file but the streaming verifier should
            // abort before that body is generated. Build/test personas
            // return safe content so their streams complete normally.
            responder: (req) => {
                if (req.personaId === 'architect') {
                    return [
                        "import doomed from 'doomed-pkg'",
                        'export const x = 1',
                        'export const y = 2',
                        'export const z = 3',
                    ].join('\n');
                }
                return 'no-op';
            },
            streamChunkSize: 4,
        });
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const resultPath = path.join(work, 'r.json');
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--result', resultPath,
            '--run-id', 'streaming-1',
            '--no-deterministic',
            '--no-pre-generation',
            '--no-post-merge',
            '--forbid-import', 'doomed-pkg',
        ], { session });
        // Stream aborted on the doomed obligation → obligation failed.
        // Build + test obligations succeed (commands "true" pass).
        assert_1.strict.equal(exit, 2);
        const r = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert_1.strict.equal(r.streamingAbortedCandidates, 1);
        assert_1.strict.ok(r.streamingCharsBeforeAbort > 0);
        assert_1.strict.equal(r.failed, 1);
        assert_1.strict.equal(r.satisfied, 2);
        const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
        const types = entries.map((e) => e.type);
        assert_1.strict.ok(types.includes('candidate-stream-aborted'));
        const aborted = entries.find((e) => e.type === 'candidate-stream-aborted');
        assert_1.strict.ok(aborted);
        if (aborted && aborted.type === 'candidate-stream-aborted') {
            assert_1.strict.match(aborted.reason, /forbidden import "doomed-pkg"/);
            assert_1.strict.ok(aborted.abortedAtChars > 0);
        }
    });
    it('saves tokens by aborting early vs. completing the full response', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'add a doomed file',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'src/doomed.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        const longBody = "import doomed from 'doomed-pkg'\n" +
            Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`).join('\n');
        // Streaming: architect emits doomed import early so the verifier
        // aborts mid-stream; implementer/verifier respond with no-op so
        // their streams settle normally without inflating output tokens.
        const responder = (req) => req.personaId === 'architect' ? longBody : 'no-op';
        const sStream = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder,
            streamChunkSize: 4,
        });
        const exitStream = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 's.jsonl'),
            '--result', path.join(work, 's.json'),
            '--run-id', 'stream',
            '--no-deterministic',
            '--no-pre-generation',
            '--no-post-merge',
            '--forbid-import', 'doomed-pkg',
        ], { session: sStream });
        assert_1.strict.equal(exitStream, 2);
        const sStreamResult = JSON.parse(fs.readFileSync(path.join(work, 's.json'), 'utf8'));
        const streamOut = sStreamResult.totalUsage.outputTokens;
        // Non-streaming baseline: same responder, no streaming, full response
        // generated (and obligation fails downstream, but the FULL output is
        // billed).
        const sFull = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder,
            streamChunkSize: 4,
        });
        const work2 = tmpDir();
        const contractDir2 = path.join(work2, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir2, contract);
        fs.writeFileSync(path.join(work2, 'package.json'), '{}');
        await (0, run_handler_1.handleRun)([
            contractDir2,
            '--repo-root', work2,
            '--ledger', path.join(work2, 'f.jsonl'),
            '--result', path.join(work2, 'f.json'),
            '--run-id', 'full',
            '--no-deterministic',
            '--no-pre-generation',
            '--no-post-merge',
            '--no-streaming',
        ], { session: sFull });
        const sFullResult = JSON.parse(fs.readFileSync(path.join(work2, 'f.json'), 'utf8'));
        const fullOut = sFullResult.totalUsage.outputTokens;
        // The aborted run must spend strictly fewer output tokens than the
        // non-streaming baseline. This is the §9 "Token savings on aborted
        // generations measurable in run output" criterion.
        assert_1.strict.ok(streamOut < fullOut, `streaming output tokens (${streamOut}) should be < non-streaming (${fullOut})`);
    });
    it('pre-generation skips obligations the workspace already satisfies (§9 pre-gen formalization)', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'README.md'), '# already-here');
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'README.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        const seenPersonas = [];
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                seenPersonas.push(req.personaId);
                return 'no-op';
            },
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 'pre.jsonl'),
            '--result', path.join(work, 'pre.json'),
            '--run-id', 'pre',
            '--no-deterministic',
        ], { session });
        assert_1.strict.equal(exit, 0);
        const r = JSON.parse(fs.readFileSync(path.join(work, 'pre.json'), 'utf8'));
        assert_1.strict.equal(r.preVerifiedObligations, 3);
        // Pre-gen handled every obligation; no LLM dispatch happened.
        assert_1.strict.equal(seenPersonas.length, 0);
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(work, 'pre.jsonl'));
        const preTypes = entries.filter((e) => e.type === 'obligation-pre-verified');
        assert_1.strict.equal(preTypes.length, 3);
    });
    it('post-merge catches the cross-obligation integration failure (§9 exit (c))', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        // Obligation 0: file 'config' must exist (the architect creates it).
        // Obligation 1: build asserts the file content matches "value=B".
        // The architect persona writes "value=A". Per-obligation verifies
        // both pass on apply (file exists; build runs separately later
        // against the freshly-written file content). Post-merge re-runs
        // both end-to-end and catches the integration failure.
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'config' },
                { type: 'build-must-pass', command: 'grep -q value=B config' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                if (req.personaId === 'architect')
                    return 'value=A';
                // implementer (build-must-pass) — pretend to no-op; build will
                // fail at apply-time and at post-merge.
                return 'no-op';
            },
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 'pm.jsonl'),
            '--result', path.join(work, 'pm.json'),
            '--run-id', 'pm-fail',
            '--no-deterministic',
            '--no-pre-generation',
            '--no-streaming',
        ], { session });
        // Build fails per-obligation AND post-merge.
        assert_1.strict.equal(exit, 2);
        const r = JSON.parse(fs.readFileSync(path.join(work, 'pm.json'), 'utf8'));
        assert_1.strict.ok(r.postMerge !== null);
        assert_1.strict.equal(r.postMerge?.passed, false);
        assert_1.strict.ok((r.postMerge?.failedCount ?? 0) >= 1);
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(work, 'pm.jsonl'));
        const pm = entries.find((e) => e.type === 'post-merge-verified');
        assert_1.strict.ok(pm);
        if (pm && pm.type === 'post-merge-verified') {
            assert_1.strict.equal(pm.passed, false);
            assert_1.strict.equal(pm.obligationCount, 3);
        }
    });
    it('post-merge passes on a clean run', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: work, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'NOTES.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const contractDir = path.join(work, '.swarm', 'contracts', contract.manifest.contractId);
        (0, serializer_1.writeContract)(contractDir, contract);
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '# notes' : 'no-op'),
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 'pm.jsonl'),
            '--result', path.join(work, 'pm.json'),
            '--run-id', 'pm-pass',
            '--no-deterministic',
            '--no-pre-generation',
            '--no-streaming',
        ], { session });
        assert_1.strict.equal(exit, 0);
        const r = JSON.parse(fs.readFileSync(path.join(work, 'pm.json'), 'utf8'));
        assert_1.strict.ok(r.postMerge !== null);
        assert_1.strict.equal(r.postMerge?.passed, true);
        assert_1.strict.equal(r.postMerge?.failedCount, 0);
    });
});
