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
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('population/manager rollback integration', () => {
    it('single-mode falsification path restores workspace to pre-run state', async () => {
        const repo = tmpDir('v8-mgr-rb-');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: {
                repoRoot: repo,
                buildCommand: 'true',
                testCommand: 'true',
                language: 'typescript',
            },
            obligations: [
                { type: 'file-must-exist', path: 'CHANGES.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                if (req.personaId === 'architect')
                    return '```\nhello\n```';
                return 'no-op';
            },
        });
        const registry = (0, persona_registry_1.createDefaultRegistry)();
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-rb-1');
        const preState = fs.readdirSync(repo);
        const fakeAdapter = {
            name: 'fake',
            handles: ['file-must-exist', 'build-must-pass', 'test-must-pass'],
            falsify: async () => ({
                result: {
                    kind: 'counter-example-input',
                    obligationType: 'file-must-exist',
                    inputs: [{
                            files: [],
                            reproducer: 'always fails',
                            reproducerOutput: '',
                            reproducerExitCode: 1,
                        }],
                },
                cost: {
                    adapterName: 'fake',
                    obligationType: 'file-must-exist',
                    wallClockMs: 1,
                    dollarsSpent: 0,
                    authMethod: 'api',
                    dollarsBilled: 0,
                    dollarsTokenEstimate: 0,
                    dollarsApiEquivalent: 0,
                    counterExamplesFound: 1,
                    falsePositives: 0,
                },
            }),
        };
        const fakeRegistry = {
            forObligation: () => [fakeAdapter],
        };
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry,
            session,
            ledger,
            runId: 'run-rb-1',
            falsifiers: 'on',
            adapterRegistry: fakeRegistry,
        });
        assert_1.strict.equal(result.failed > 0, true);
        const entries = ledger.readAll();
        assert_1.strict.ok(entries.some((e) => e.type === 'obligation-rolled-back'));
        const postState = fs.readdirSync(repo);
        assert_1.strict.deepEqual(postState, preState);
    });
    it('post-merge regression path restores workspace for applied obligations', async () => {
        const repo = tmpDir('v8-mgr-pm-');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: {
                repoRoot: repo,
                buildCommand: 'true',
                testCommand: 'true',
                language: 'typescript',
            },
            obligations: [
                { type: 'build-must-pass', command: 'test -f one.ts' },
                { type: 'build-must-pass', command: 'test ! -f one.ts' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req, callIndex) => {
                if (req.personaId === 'implementer') {
                    if (callIndex === 0) {
                        return [
                            '--- /dev/null',
                            '+++ b/one.ts',
                            '@@ -0,0 +1,1 @@',
                            '+one',
                        ].join('\n');
                    }
                    if (callIndex === 1) {
                        return [
                            '--- a/one.ts',
                            '+++ /dev/null',
                            '@@ -1,1 +0,0 @@',
                            '-one',
                        ].join('\n');
                    }
                }
                return 'no-op';
            },
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-pm-1');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            runId: 'run-pm-1',
            postMerge: true,
        });
        // Obligation 0 passes during synthesis (one.ts created), obligation 1
        // passes during synthesis (one.ts deleted). Post-merge re-checks
        // obligation 0: one.ts no longer exists, so it fails. This triggers
        // rollback of all applied obligations in reverse order.
        assert_1.strict.equal(result.postMerge?.passed, false);
        const entries = ledger.readAll();
        assert_1.strict.ok(entries.some((e) => e.type === 'obligation-rolled-back'));
        // Obligation 0's rollback removes one.ts (its pre-apply state was absent).
        // The manager rolls back every satisfied obligation, restoring the
        // pre-run workspace state.
        assert_1.strict.equal(fs.existsSync(path.join(repo, 'one.ts')), false);
    });
});
