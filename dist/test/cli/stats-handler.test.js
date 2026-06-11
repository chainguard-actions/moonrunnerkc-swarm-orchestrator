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
const stats_handler_1 = require("../../src/cli/v8/stats-handler");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function captureStdout(fn) {
    const chunks = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => {
        chunks.push(typeof s === 'string' ? s : Buffer.from(s).toString('utf8'));
        return true;
    };
    return fn()
        .then((result) => ({ result, stdout: chunks.join('') }))
        .finally(() => {
        process.stdout.write = orig;
    });
}
describe('cli/v8 stats-handler', () => {
    it('aggregates rollback, falsification, and file-touch counts from a ledger', async () => {
        const repo = tmpDir('v8-stats-');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-stats-1');
        ledger.append({
            type: 'run-started',
            contractId: 'c1',
            contractHash: 'h1',
            obligationCount: 3,
            goal: 'g',
        });
        ledger.append({
            type: 'obligation-attempted',
            obligationIndex: 0,
            obligationType: 'file-must-exist',
            personaId: 'architect',
        });
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 0,
            files: [{ path: 'a.ts', preBlobSha: 'sha1', expectedPostBlobSha: 'sha2' }],
        });
        ledger.append({
            type: 'falsification-call',
            obligationIndex: 0,
            obligationType: 'file-must-exist',
            adapterName: 'fake',
            resultKind: 'counter-example-input',
            counterExamplesFound: 1,
            wallClockMs: 1,
            dollarsBilled: 0,
            dollarsApiEquivalent: 0,
            detail: 'x',
        });
        ledger.append({
            type: 'obligation-rolled-back',
            obligationIndex: 0,
            trigger: 'per-obligation-falsification',
            success: true,
            restoredFiles: [{ path: 'a.ts', restoredBlobSha: 'sha1' }],
            detail: 'rolled back 1 file(s)',
        });
        ledger.append({
            type: 'obligation-attempted',
            obligationIndex: 1,
            obligationType: 'build-must-pass',
            personaId: 'implementer',
        });
        ledger.append({
            type: 'workspace-snapshot',
            obligationIndex: 1,
            files: [{ path: 'b.ts', preBlobSha: 'sha3', expectedPostBlobSha: 'sha4' }],
        });
        ledger.append({
            type: 'obligation-rolled-back',
            obligationIndex: 1,
            trigger: 'post-merge-regression',
            success: true,
            restoredFiles: [{ path: 'b.ts', restoredBlobSha: 'sha3' }],
            detail: 'rolled back 1 file(s)',
        });
        ledger.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 1,
            totalUsage: {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
            },
        });
        const { result, stdout } = await captureStdout(() => (0, stats_handler_1.handleStats)(['run-stats-1', '--ledger', path.join(repo, 'ledger.jsonl'), '--json']));
        assert_1.strict.equal(result, 0);
        const parsed = JSON.parse(stdout);
        assert_1.strict.equal(parsed.mode, 'single');
        assert_1.strict.equal(parsed.rollbackCount, 2);
        assert_1.strict.equal(parsed.rollbackByTrigger['per-obligation-falsification'], 1);
        assert_1.strict.equal(parsed.rollbackByTrigger['post-merge-regression'], 1);
        assert_1.strict.equal(parsed.rollbackByObligationType['file-must-exist'], 1);
        assert_1.strict.equal(parsed.rollbackByObligationType['build-must-pass'], 1);
        assert_1.strict.equal(parsed.falsificationCount, 1);
        assert_1.strict.equal(parsed.falsificationByAdapter['fake'], 1);
        assert_1.strict.equal(parsed.falsificationByObligationType['file-must-exist'], 1);
        const fileNames = parsed.topFiles.map(([p]) => p).sort();
        assert_1.strict.deepEqual(fileNames, ['a.ts', 'b.ts']);
    });
    it('plain output reflects rollback counts visibly to operators', async () => {
        const repo = tmpDir('v8-stats-');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-stats-plain');
        ledger.append({
            type: 'run-started',
            contractId: 'c1',
            contractHash: 'h1',
            obligationCount: 1,
            goal: 'g',
        });
        ledger.append({
            type: 'obligation-rolled-back',
            obligationIndex: 0,
            trigger: 'per-obligation-falsification',
            success: true,
            restoredFiles: [],
            detail: 'r',
        });
        ledger.append({
            type: 'run-finished',
            satisfied: 0,
            failed: 1,
            totalUsage: {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
            },
        });
        const { result, stdout } = await captureStdout(() => (0, stats_handler_1.handleStats)(['run-stats-plain', '--ledger', path.join(repo, 'ledger.jsonl')]));
        assert_1.strict.equal(result, 0);
        assert_1.strict.match(stdout, /Rollbacks: 1/);
        assert_1.strict.match(stdout, /per-obligation-falsification: 1/);
    });
    it('infers tournament mode from tournament-round-started entries', async () => {
        const repo = tmpDir('v8-stats-');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-stats-tourn');
        ledger.append({
            type: 'run-started',
            contractId: 'c1',
            contractHash: 'h1',
            obligationCount: 1,
            goal: 'g',
        });
        ledger.append({
            type: 'tournament-round-started',
            obligationIndex: 0,
            obligationType: 'build-must-pass',
            roundIndex: 0,
            roundCap: 3,
            personaIds: ['implementer'],
            temperatures: [0.2],
        });
        ledger.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 0,
            totalUsage: {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
            },
        });
        const { stdout } = await captureStdout(() => (0, stats_handler_1.handleStats)(['run-stats-tourn', '--ledger', path.join(repo, 'ledger.jsonl'), '--json']));
        const parsed = JSON.parse(stdout);
        assert_1.strict.equal(parsed.mode, 'tournament');
    });
    it('breaks out falsification attempts vs counter-examples vs dispatcher-errors', async () => {
        const repo = tmpDir('v8-stats-falsify-');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-stats-falsify');
        ledger.append({
            type: 'run-started',
            contractId: 'c1',
            contractHash: 'h1',
            obligationCount: 1,
            goal: 'g',
        });
        ledger.append({
            type: 'obligation-attempted',
            obligationIndex: 0,
            obligationType: 'property-must-hold',
            personaId: 'security-reviewer',
        });
        // 1 successful counter-example from codex
        ledger.append({
            type: 'falsification-call',
            obligationIndex: 0,
            obligationType: 'property-must-hold',
            adapterName: 'codex',
            resultKind: 'counter-example-input',
            counterExamplesFound: 1,
            wallClockMs: 100,
            dollarsBilled: 0,
            dollarsApiEquivalent: 0,
            detail: 'found',
        });
        // 2 dispatcher errors from codex
        ledger.append({
            type: 'falsification-call',
            obligationIndex: 0,
            obligationType: 'property-must-hold',
            adapterName: 'codex',
            resultKind: 'dispatcher-error',
            counterExamplesFound: 0,
            wallClockMs: 0,
            dollarsBilled: 0,
            dollarsApiEquivalent: 0,
            detail: 'binary not found',
        });
        ledger.append({
            type: 'falsification-call',
            obligationIndex: 0,
            obligationType: 'property-must-hold',
            adapterName: 'codex',
            resultKind: 'dispatcher-error',
            counterExamplesFound: 0,
            wallClockMs: 0,
            dollarsBilled: 0,
            dollarsApiEquivalent: 0,
            detail: 'binary not found',
        });
        ledger.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 0,
            totalUsage: {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
            },
        });
        const { stdout } = await captureStdout(() => (0, stats_handler_1.handleStats)(['run-stats-falsify', '--ledger', path.join(repo, 'ledger.jsonl')]));
        // Plain-text output should distinguish attempted from counter-examples
        // from dispatcher-errors and surface the warning.
        assert_1.strict.match(stdout, /attempted:\s*3/);
        assert_1.strict.match(stdout, /counter-examples:\s*1/);
        assert_1.strict.match(stdout, /dispatcher-errors:\s*2/);
        assert_1.strict.match(stdout, /WARNING:.*falsifier dispatch.*failed/);
        assert_1.strict.match(stdout, /codex:.*counter-examples=1.*errors=2/);
    });
    it('reports zero rollbacks for an empty ledger', async () => {
        const repo = tmpDir('v8-stats-');
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'run-stats-2');
        ledger.append({
            type: 'run-started',
            contractId: 'c2',
            contractHash: 'h2',
            obligationCount: 1,
            goal: 'g',
        });
        ledger.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 0,
            totalUsage: {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
            },
        });
        const { result, stdout } = await captureStdout(() => (0, stats_handler_1.handleStats)(['run-stats-2', '--ledger', path.join(repo, 'ledger.jsonl'), '--json']));
        assert_1.strict.equal(result, 0);
        const parsed = JSON.parse(stdout);
        assert_1.strict.equal(parsed.rollbackCount, 0);
    });
});
