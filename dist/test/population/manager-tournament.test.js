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
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const compiler_1 = require("../../src/contract/compiler");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function makeContract(repoRoot, filePath) {
    return (0, compiler_1.finalize)({
        schemaVersion: 'v1',
        goal: 'add a thing',
        repoContext: { repoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
        obligations: [
            { type: 'file-must-exist', path: filePath },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
        ],
        extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
    });
}
function buildSession() {
    return new stub_session_1.StubSession({
        projectContext: 'CTX',
        responder: (req) => {
            if (req.personaId === 'tournament-verifier') {
                // Score every candidate equally above threshold so the first one
                // wins deterministically.
                return JSON.stringify({ score: 0.85, rationale: 'looks good' });
            }
            if (req.personaId === 'architect') {
                return '```\nfile body\n```';
            }
            return 'no-op';
        },
    });
}
describe('population/manager — tournament mode', () => {
    it('runs a tournament for every obligation and reports satisfied', async () => {
        const repo = tmpDir('v8-mgrT-');
        const contract = makeContract(repo, 'CHANGES.md');
        const session = buildSession();
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'rT');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            mode: 'tournament',
        });
        assert_1.strict.equal(result.mode, 'tournament');
        assert_1.strict.equal(result.satisfied, 3);
        assert_1.strict.equal(result.failed, 0);
        // Every outcome must have a tournament evidence object.
        for (const o of result.outcomes) {
            assert_1.strict.ok(o.tournament, `obligation ${o.obligationIndex} has tournament evidence`);
            assert_1.strict.equal(o.tournament?.escalated, false);
            assert_1.strict.ok((o.tournament?.rounds.length ?? 0) >= 1);
        }
        // Ledger contains tournament-specific entries.
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(repo, 'ledger.jsonl'));
        const types = entries.map((e) => e.type);
        assert_1.strict.ok(types.includes('tournament-round-started'), 'tournament-round-started present');
        assert_1.strict.ok(types.includes('tournament-winner-selected'), 'tournament-winner-selected present');
    });
    it('marks obligations failed when tournament escalates', async () => {
        const repo = tmpDir('v8-mgrT-');
        const contract = makeContract(repo, 'CHANGES.md');
        // All candidates score below threshold ⇒ escalation.
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                if (req.personaId === 'tournament-verifier') {
                    return JSON.stringify({ score: 0.1, rationale: 'never good' });
                }
                return req.personaId === 'architect' ? '```\nx\n```' : 'no-op';
            },
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'rT');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            mode: 'tournament',
        });
        // file-must-exist escalates because no candidate scored above threshold,
        // so the file is never written and the obligation remains unsatisfied.
        const fileOutcome = result.outcomes.find((o) => o.obligation.type === 'file-must-exist');
        assert_1.strict.ok(fileOutcome);
        assert_1.strict.equal(fileOutcome?.satisfied, false);
        assert_1.strict.equal(fileOutcome?.tournament?.escalated, true);
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(repo, 'ledger.jsonl'));
        assert_1.strict.ok(entries.some((e) => e.type === 'tournament-escalated'));
    });
    it('records both winner and losers for cost attribution', async () => {
        const repo = tmpDir('v8-mgrT-');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: repo, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'a.txt' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        let callCount = 0;
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                if (req.personaId === 'tournament-verifier') {
                    // Alternate scores so one beats the other.
                    callCount += 1;
                    const score = callCount % 2 === 0 ? 0.9 : 0.5;
                    return JSON.stringify({ score, rationale: `r${callCount}` });
                }
                return '```\ncontent\n```';
            },
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'rT');
        await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            mode: 'tournament',
            tournamentConfig: {
                'file-must-exist': {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.2],
                },
            },
        });
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(repo, 'ledger.jsonl'));
        const winners = entries.filter((e) => e.type === 'tournament-winner-selected');
        const discards = entries.filter((e) => e.type === 'candidate-discarded');
        // Three obligations × one winner each = three winners.
        assert_1.strict.equal(winners.length, 3, 'one winner per obligation');
        // For the file-must-exist tournament we forced a 2-candidate round, so
        // at least one loser was discarded.
        assert_1.strict.ok(discards.length >= 1, 'at least one loser discarded');
        // Discard records carry usage data.
        const d = discards[0];
        assert_1.strict.ok(d.usage.outputTokens > 0);
    });
    it('honors a custom tournamentConfig override', async () => {
        const repo = tmpDir('v8-mgrT-');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: repo, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'a.txt' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const session = buildSession();
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'rT');
        await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            mode: 'tournament',
            tournamentConfig: {
                'file-must-exist': {
                    candidatesPerRound: 4,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.3],
                },
            },
        });
        const entries = (0, jsonl_ledger_1.readEntries)(path.join(repo, 'ledger.jsonl'));
        const round0 = entries.find((e) => e.type === 'tournament-round-started');
        assert_1.strict.ok(round0);
        assert_1.strict.equal(round0?.personaIds.length, 4);
    });
});
