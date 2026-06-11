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
const stubCompile = () => ({
    extractor: stub_extractor_1.StubExtractor.fromHeuristic(),
});
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-tour-int-'));
}
describe('integration: swarm v8 run --mode tournament', () => {
    it('runs tournaments end-to-end and writes evidence files', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }, null, 2));
        fs.writeFileSync(path.join(work, 'tsconfig.json'), '{}');
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'add a CHANGES.md note',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        const resultPath = path.join(work, 'result.json');
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                if (req.personaId === 'tournament-verifier') {
                    // Score every candidate equally above threshold; first wins.
                    return JSON.stringify({ score: 0.9, rationale: 'looks good' });
                }
                if (req.personaId === 'architect')
                    return '```\nfile body\n```';
                return 'no-op';
            },
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--result', resultPath,
            '--run-id', 'fixed-tour-id',
            '--mode', 'tournament',
            '--candidates', '2',
            // Phase 5: disable the deterministic floor so this test exercises
            // tournament evidence on every obligation, including the file
            // obligation that the auto-tagger would otherwise route to
            // scaffold-template.
            '--no-deterministic',
            // Phase 6: pre-generation would skip the build/test obligations
            // (commands pass on the empty fixture) before the tournament
            // ever runs; opt out so the assertion that every obligation
            // carries tournament evidence holds.
            '--no-pre-generation',
            '--no-streaming',
            '--no-post-merge',
        ], { session });
        assert_1.strict.equal(exit, 0);
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert_1.strict.equal(result.mode, 'tournament');
        assert_1.strict.equal(result.satisfied, 3);
        // Every outcome carries a tournament evidence object.
        for (const o of result.outcomes) {
            assert_1.strict.ok(o.tournament, `${o.type} carries tournament evidence`);
            assert_1.strict.equal(o.tournament?.escalated, false);
            assert_1.strict.ok((o.tournament?.rounds ?? 0) >= 1);
        }
        // Ledger contains tournament-specific entry types.
        const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
        const types = new Set(entries.map((e) => e.type));
        assert_1.strict.ok(types.has('tournament-round-started'));
        assert_1.strict.ok(types.has('tournament-winner-selected'));
        assert_1.strict.ok(types.has('candidate-discarded'));
    });
    it('rejects an invalid --mode value', async () => {
        const work = tmpDir();
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'g',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        const exit = await (0, run_handler_1.handleRun)([contractDir, '--mode', 'bogus']);
        assert_1.strict.equal(exit, 1);
    });
    it('rejects --candidates out of range', async () => {
        const work = tmpDir();
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'g',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        const exit = await (0, run_handler_1.handleRun)([contractDir, '--candidates', '99']);
        assert_1.strict.equal(exit, 1);
    });
});
