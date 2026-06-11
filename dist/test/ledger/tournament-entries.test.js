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
const types_1 = require("../../src/session/types");
function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-tour-'));
    return path.join(dir, 'ledger.jsonl');
}
describe('ledger — Phase 3 tournament entry types', () => {
    it('round-trips tournament-round-started entries', () => {
        const file = tmpFile();
        const led = new jsonl_ledger_1.JsonlLedger(file, 'rT');
        led.append({
            type: 'tournament-round-started',
            obligationIndex: 1,
            obligationType: 'file-must-exist',
            roundIndex: 0,
            roundCap: 3,
            personaIds: ['architect', 'implementer'],
            temperatures: [0.2, 0.5],
        });
        const entries = (0, jsonl_ledger_1.readEntries)(file);
        assert_1.strict.equal(entries.length, 1);
        const e = entries[0];
        assert_1.strict.equal(e.type, 'tournament-round-started');
        assert_1.strict.deepEqual(e.personaIds, ['architect', 'implementer']);
        assert_1.strict.deepEqual(e.temperatures, [0.2, 0.5]);
        assert_1.strict.equal(e.roundCap, 3);
    });
    it('round-trips candidate-discarded with usage and rationale', () => {
        const file = tmpFile();
        const led = new jsonl_ledger_1.JsonlLedger(file, 'rT');
        led.append({
            type: 'candidate-discarded',
            obligationIndex: 0,
            roundIndex: 0,
            candidateIndex: 1,
            personaId: 'architect',
            responseSha256: 'abc',
            score: 0.4,
            rationale: 'too short',
            usage: { ...(0, types_1.emptyUsage)(), outputTokens: 5 },
            model: 'haiku-x',
        });
        const e = (0, jsonl_ledger_1.readEntries)(file)[0];
        assert_1.strict.equal(e.type, 'candidate-discarded');
        assert_1.strict.equal(e.score, 0.4);
        assert_1.strict.equal(e.rationale, 'too short');
        assert_1.strict.equal(e.usage.outputTokens, 5);
        assert_1.strict.equal(e.model, 'haiku-x');
    });
    it('round-trips tournament-winner-selected', () => {
        const file = tmpFile();
        const led = new jsonl_ledger_1.JsonlLedger(file, 'rT');
        led.append({
            type: 'tournament-winner-selected',
            obligationIndex: 0,
            roundIndex: 1,
            candidateIndex: 0,
            personaId: 'implementer',
            responseSha256: 'deadbeef',
            score: 0.9,
            rationale: 'looks good',
        });
        const e = (0, jsonl_ledger_1.readEntries)(file)[0];
        assert_1.strict.equal(e.type, 'tournament-winner-selected');
        assert_1.strict.equal(e.personaId, 'implementer');
        assert_1.strict.equal(e.roundIndex, 1);
        assert_1.strict.equal(e.score, 0.9);
    });
    it('round-trips tournament-escalated', () => {
        const file = tmpFile();
        const led = new jsonl_ledger_1.JsonlLedger(file, 'rT');
        led.append({
            type: 'tournament-escalated',
            obligationIndex: 2,
            obligationType: 'build-must-pass',
            roundsRun: 3,
            bestScore: 0.4,
            detail: 'all candidates fell short',
        });
        const e = (0, jsonl_ledger_1.readEntries)(file)[0];
        assert_1.strict.equal(e.type, 'tournament-escalated');
        assert_1.strict.equal(e.roundsRun, 3);
        assert_1.strict.equal(e.bestScore, 0.4);
    });
});
