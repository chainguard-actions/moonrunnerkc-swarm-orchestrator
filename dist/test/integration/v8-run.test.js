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
const compile_handler_1 = require("../../src/cli/v8/compile-handler");
const run_handler_1 = require("../../src/cli/v8/run-handler");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const stub_session_1 = require("../../src/session/stub-session");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const stubExtractor = () => stub_extractor_1.StubExtractor.fromHeuristic();
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-run-int-'));
}
describe('integration: swarm v8 run', () => {
    it('compiles a contract, runs it against a stub session, and writes evidence files', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }, null, 2));
        fs.writeFileSync(path.join(work, 'tsconfig.json'), '{}');
        const contractDir = path.join(work, 'contract');
        // Compile
        const compileExit = await (0, compile_handler_1.handleCompile)([
            'add a CHANGES.md note',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], { extractor: stubExtractor() });
        assert_1.strict.equal(compileExit, 0);
        // Run
        const resultPath = path.join(work, 'result.json');
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nhello world\n```' : 'no-op'),
        });
        const runExit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--result', resultPath,
            '--run-id', 'fixed-run-id',
            // Phase 6 features change session-call shape (pre-gen skips
            // commands, post-merge re-runs); this Phase 2 test asserts the
            // baseline call pattern, so opt out.
            '--no-streaming',
            '--no-pre-generation',
            '--no-post-merge',
        ], { session });
        assert_1.strict.equal(runExit, 0);
        // Result file
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert_1.strict.equal(result.satisfied, 3);
        assert_1.strict.equal(result.failed, 0);
        assert_1.strict.equal(result.runId, 'fixed-run-id');
        // Cache hit rate is in [0, 1].
        assert_1.strict.ok(result.cacheHitRate >= 0 && result.cacheHitRate <= 1);
        // 3 calls: 1 cache write + 2 cache reads ⇒ rate > 0.
        assert_1.strict.ok(result.cacheHitRate > 0);
        // Ledger file
        const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
        assert_1.strict.ok(entries.length >= 1 + 3 * 3 + 1); // run-started + 3 × (attempted, candidate, satisfied) + run-finished
        assert_1.strict.equal(entries[0]?.type, 'run-started');
        const lastEntry = entries[entries.length - 1];
        assert_1.strict.equal(lastEntry?.type, 'run-finished');
    });
    it('exits 2 when at least one obligation fails verification', async () => {
        const work = tmpDir();
        // Declare scripts so the stub extractor emits both build-must-pass and
        // test-must-pass; the override below relies on the build line existing.
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ scripts: { build: 'echo build', test: 'echo test' } }));
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'add a thing',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], { extractor: stubExtractor() });
        // Override the contract on disk to use a failing build command, then re-write
        // the manifest so the contract reader still validates.
        const fail = fs.readFileSync(path.join(contractDir, 'contract.jsonl'), 'utf8');
        fs.writeFileSync(path.join(contractDir, 'contract.jsonl'), fail
            .replace(/"build-must-pass","command":"[^"]+"/, '"build-must-pass","command":"false"')
            .replace(/"test-must-pass","command":"[^"]+"/, '"test-must-pass","command":"true"'));
        // The hash recorded in the manifest no longer matches; readContract validates
        // the obligation list, not the hash, so this still loads. Phase 4 will add
        // hash-chain enforcement.
        const session = new stub_session_1.StubSession({
            projectContext: '',
            responder: () => '```\nx\n```',
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 'ledger.jsonl'),
            '--run-id', 'r2',
        ], { session });
        assert_1.strict.equal(exit, 2);
    });
    it('rejects unknown flags with exit 1', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), '{}');
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'goal',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], { extractor: stubExtractor() });
        const exit = await (0, run_handler_1.handleRun)([contractDir, '--bogus']);
        assert_1.strict.equal(exit, 1);
    });
});
