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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-ledger-'));
    return path.join(dir, 'ledger.jsonl');
}
describe('ledger/JsonlLedger', () => {
    it('appends entries with monotonic sequence and stamps headers', () => {
        const file = tmpFile();
        const led = new jsonl_ledger_1.JsonlLedger(file, 'run-1');
        led.append({
            type: 'run-started',
            contractId: 'c',
            contractHash: 'h',
            obligationCount: 1,
            goal: 'g',
        });
        led.append({
            type: 'obligation-attempted',
            obligationIndex: 0,
            obligationType: 'file-must-exist',
            personaId: 'architect',
        });
        led.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 0,
            totalUsage: (0, types_1.emptyUsage)(),
        });
        const entries = led.readAll();
        assert_1.strict.equal(entries.length, 3);
        assert_1.strict.deepEqual(entries.map((e) => e.seq), [0, 1, 2]);
        for (const e of entries) {
            assert_1.strict.equal(e.runId, 'run-1');
            assert_1.strict.match(e.ts, /^\d{4}-\d{2}-\d{2}T/);
        }
    });
    it('readEntries skips blank lines and surfaces malformed JSON', () => {
        const file = tmpFile();
        fs.writeFileSync(file, ['{"type":"run-started","contractId":"c","contractHash":"h","obligationCount":0,"goal":"g","ts":"t","runId":"r","seq":0}', '', 'not-json'].join('\n'));
        assert_1.strict.throws(() => (0, jsonl_ledger_1.readEntries)(file), /not valid JSON/);
    });
    it('resuming an existing ledger continues the sequence', () => {
        const file = tmpFile();
        const a = new jsonl_ledger_1.JsonlLedger(file, 'r');
        a.append({
            type: 'run-started',
            contractId: 'c',
            contractHash: 'h',
            obligationCount: 0,
            goal: 'g',
        });
        a.append({
            type: 'run-finished',
            satisfied: 0,
            failed: 0,
            totalUsage: (0, types_1.emptyUsage)(),
        });
        const b = new jsonl_ledger_1.JsonlLedger(file, 'r');
        assert_1.strict.equal(b.nextSeq(), 2);
        b.append({
            type: 'run-finished',
            satisfied: 1,
            failed: 0,
            totalUsage: (0, types_1.emptyUsage)(),
        });
        const entries = (0, jsonl_ledger_1.readEntries)(file);
        assert_1.strict.equal(entries.length, 3);
        assert_1.strict.deepEqual(entries.map((e) => e.seq), [0, 1, 2]);
    });
});
