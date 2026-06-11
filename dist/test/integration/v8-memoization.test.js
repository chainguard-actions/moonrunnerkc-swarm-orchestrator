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
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const memoization_1 = require("../../src/ledger/memoization");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-memo-int-'));
}
describe('integration: in-run memoization measurably reduces verifier calls', () => {
    it('saves verifier calls on a goal with repeated patterns (4 health-check files)', async () => {
        const repoRoot = tmpDir();
        // Build a 4-file-must-exist contract — the canonical "add health
        // checks to N services" repeated-pattern goal from impl guide §7.
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'add health checks to 4 services',
            repoContext: { repoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'src/svc-a/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-b/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-c/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-d/health.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        // Architect responds with the same body for every file-must-exist
        // obligation — the natural shape for "repeated patterns." Tournament
        // verifier returns a passing score.
        const responder = (req) => {
            if (req.personaId === 'tournament-verifier') {
                return JSON.stringify({ score: 0.9, rationale: 'looks good' });
            }
            if (req.personaId === 'architect') {
                return '```\nexport function healthCheck() { return 200; }\n```';
            }
            return 'no-op';
        };
        // Baseline run WITHOUT a memoStore: the harness still does the
        // implicit in-round dedup (two identical hashes in the same round
        // share one verifier call), but no cross-obligation memoization.
        const baselineSession = new stub_session_1.StubSession({ projectContext: 'CTX', responder });
        const baselineLedger = new jsonl_ledger_1.JsonlLedger(path.join(repoRoot, 'baseline.jsonl'), 'baseline');
        const baselineResult = await (0, manager_1.runPopulation)({
            contract,
            repoRoot,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session: baselineSession,
            ledger: baselineLedger,
            mode: 'tournament',
        });
        assert_1.strict.equal(baselineResult.satisfied, 6);
        // Memoized run WITH memo store: same workload, but cross-obligation
        // winner-hash matches let later tournaments skip *all* their
        // verifier calls (their candidates' hashes are already on the
        // store).
        const memoRoot = tmpDir();
        const contractMemo = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'add health checks to 4 services',
            repoContext: { repoRoot: memoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'src/svc-a/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-b/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-c/health.ts' },
                { type: 'file-must-exist', path: 'src/svc-d/health.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const memoSession = new stub_session_1.StubSession({ projectContext: 'CTX', responder });
        const memoLedger = new jsonl_ledger_1.JsonlLedger(path.join(memoRoot, 'memo.jsonl'), 'memo');
        const memoStore = new memoization_1.MemoStore([]);
        const memoResult = await (0, manager_1.runPopulation)({
            contract: contractMemo,
            repoRoot: memoRoot,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session: memoSession,
            ledger: memoLedger,
            mode: 'tournament',
            memoStore,
        });
        assert_1.strict.equal(memoResult.satisfied, 6);
        // Memoization saves strictly more verifier calls than the
        // implicit in-round dedup alone — that's the §7 "share work
        // across repeated patterns" criterion.
        assert_1.strict.ok(memoResult.verifierCallsSavedByMemoization > baselineResult.verifierCallsSavedByMemoization, `expected memoized saves (${memoResult.verifierCallsSavedByMemoization}) > baseline saves (${baselineResult.verifierCallsSavedByMemoization})`);
        // Aggregate output-token usage on the memoized run is strictly
        // lower — skipped verifier calls don't bill output tokens.
        assert_1.strict.ok(memoResult.totalUsage.outputTokens < baselineResult.totalUsage.outputTokens, `expected memoized output tokens < baseline (${memoResult.totalUsage.outputTokens} vs ${baselineResult.totalUsage.outputTokens})`);
    });
    it('records winner ingestion so a later identical-hash candidate inherits the verdict', async () => {
        const repoRoot = tmpDir();
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'file-must-exist', path: 'b.ts' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        let architectVerifierCalls = 0;
        const responder = (req) => {
            if (req.personaId === 'tournament-verifier') {
                // Count only verifier calls that score architect candidates,
                // i.e. those targeting a file-must-exist obligation. Build/test
                // obligations score "no-op" responses; we don't care about
                // those for this assertion.
                if (req.userMessage.includes('file-must-exist')) {
                    architectVerifierCalls += 1;
                }
                return JSON.stringify({ score: 0.9, rationale: 'ok' });
            }
            if (req.personaId === 'architect')
                return '```\nbody\n```';
            return 'no-op';
        };
        const session = new stub_session_1.StubSession({ projectContext: 'CTX', responder });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repoRoot, 'ledger.jsonl'), 'r1');
        await (0, manager_1.runPopulation)({
            contract,
            repoRoot,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            mode: 'tournament',
            memoStore: new memoization_1.MemoStore([]),
        });
        // First file-must-exist obligation: 2 candidates, same hash → 1
        // fresh verifier call. Second file-must-exist: 2 candidates, same
        // hash AND matches prior winner → 0 fresh verifier calls. Total
        // architect-side fresh verifier calls = 1.
        assert_1.strict.equal(architectVerifierCalls, 1, `expected exactly 1 fresh verifier call on file-must-exist tournaments, got ${architectVerifierCalls}`);
    });
});
