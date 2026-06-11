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
const ledger_1 = require("../../src/ledger/ledger");
const types_1 = require("../../src/session/types");
function tmpFile(prefix = 'hash-chain-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    return path.join(dir, 'ledger.jsonl');
}
describe('ledger/hash-chain', () => {
    describe('canonicalJson', () => {
        it('sorts keys deterministically', () => {
            const a = (0, ledger_1.canonicalJson)({ b: 1, a: 2, c: { z: 1, y: 2 } });
            const b = (0, ledger_1.canonicalJson)({ a: 2, c: { y: 2, z: 1 }, b: 1 });
            assert_1.strict.equal(a, b);
            assert_1.strict.equal(a, '{"a":2,"b":1,"c":{"y":2,"z":1}}');
        });
        it('preserves array order', () => {
            const out = (0, ledger_1.canonicalJson)({ arr: [3, 1, 2] });
            assert_1.strict.equal(out, '{"arr":[3,1,2]}');
        });
        it('handles primitives, null, and nested arrays of objects', () => {
            assert_1.strict.equal((0, ledger_1.canonicalJson)(null), 'null');
            assert_1.strict.equal((0, ledger_1.canonicalJson)(42), '42');
            assert_1.strict.equal((0, ledger_1.canonicalJson)('x'), '"x"');
            assert_1.strict.equal((0, ledger_1.canonicalJson)([{ b: 1, a: 2 }, { c: 3 }]), '[{"a":2,"b":1},{"c":3}]');
        });
    });
    describe('append + readAll', () => {
        it('chains the genesis entry from the all-zero digest', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            const entries = led.readAll();
            assert_1.strict.equal(entries.length, 1);
            const first = entries[0];
            assert_1.strict.ok(first);
            assert_1.strict.equal(first.prevHash, ledger_1.GENESIS_PREV_HASH);
            assert_1.strict.equal(first.entryHash.length, 64);
            assert_1.strict.match(first.entryHash, /^[0-9a-f]{64}$/);
        });
        it('chains subsequent entries to the prior entryHash', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            led.append({
                type: 'run-finished',
                satisfied: 0,
                failed: 0,
                totalUsage: (0, types_1.emptyUsage)(),
            });
            const entries = led.readAll();
            assert_1.strict.equal(entries.length, 2);
            assert_1.strict.equal(entries[1]?.prevHash, entries[0]?.entryHash);
        });
        it('verifyChain accepts a valid chain', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
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
                type: 'obligation-satisfied',
                obligationIndex: 0,
                obligationType: 'file-must-exist',
                detail: 'wrote x',
            });
            assert_1.strict.doesNotThrow(() => led.verifyChain());
            assert_1.strict.doesNotThrow(() => (0, ledger_1.verifyChainAt)(file));
        });
    });
    describe('verifyChain — tamper detection', () => {
        it('rejects an edited payload', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 1,
                goal: 'original goal',
            });
            led.append({
                type: 'run-finished',
                satisfied: 0,
                failed: 0,
                totalUsage: (0, types_1.emptyUsage)(),
            });
            // Tamper: edit the goal string in the on-disk file.
            const text = fs.readFileSync(file, 'utf8');
            const tampered = text.replace('"original goal"', '"tampered goal"');
            fs.writeFileSync(file, tampered, 'utf8');
            assert_1.strict.throws(() => (0, ledger_1.verifyChainAt)(file), (err) => err instanceof ledger_1.ChainTamperedError && err.kind === 'entry-hash-mismatch');
        });
        it('rejects a removed entry', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            led.append({
                type: 'run-finished',
                satisfied: 0,
                failed: 0,
                totalUsage: (0, types_1.emptyUsage)(),
            });
            // Tamper: drop the first entry.
            const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);
            fs.writeFileSync(file, lines.slice(1).join('\n') + '\n', 'utf8');
            assert_1.strict.throws(() => (0, ledger_1.verifyChainAt)(file), ledger_1.ChainTamperedError);
        });
        it('rejects a reordered ledger', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            led.append({
                type: 'run-finished',
                satisfied: 0,
                failed: 0,
                totalUsage: (0, types_1.emptyUsage)(),
            });
            const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);
            // Swap entries so prevHash chain is broken.
            fs.writeFileSync(file, [lines[1], lines[0]].join('\n') + '\n', 'utf8');
            assert_1.strict.throws(() => (0, ledger_1.verifyChainAt)(file), ledger_1.ChainTamperedError);
        });
        it('rejects a missing entryHash', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            const text = fs.readFileSync(file, 'utf8');
            // Strip the entryHash field.
            const tampered = text.replace(/,"entryHash":"[0-9a-f]{64}"/, '');
            fs.writeFileSync(file, tampered, 'utf8');
            assert_1.strict.throws(() => (0, ledger_1.verifyChainAt)(file), (err) => err instanceof ledger_1.ChainTamperedError && err.kind === 'malformed-header');
        });
        it('refuses to chain onto a tampered file at construction', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            const text = fs.readFileSync(file, 'utf8');
            const tampered = text.replace(/"goal":"g"/, '"goal":"haxed"');
            fs.writeFileSync(file, tampered, 'utf8');
            assert_1.strict.throws(() => new ledger_1.HashChainedLedger(file, 'r2'), ledger_1.ChainTamperedError);
        });
    });
    describe('resume semantics', () => {
        it('continues seq numbering and chains from the prior tail', () => {
            const file = tmpFile();
            const led1 = new ledger_1.HashChainedLedger(file, 'r1');
            const e1 = led1.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            const e2 = led1.append({
                type: 'run-finished',
                satisfied: 0,
                failed: 0,
                totalUsage: (0, types_1.emptyUsage)(),
            });
            const led2 = new ledger_1.HashChainedLedger(file, 'r2');
            assert_1.strict.equal(led2.nextSeq(), 2);
            const e3 = led2.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g2',
            });
            assert_1.strict.equal(e1.prevHash, ledger_1.GENESIS_PREV_HASH);
            assert_1.strict.equal(e2.prevHash, e1.entryHash);
            assert_1.strict.equal(e3.prevHash, e2.entryHash);
            assert_1.strict.equal(e3.seq, 2);
            assert_1.strict.doesNotThrow(() => (0, ledger_1.verifyChainAt)(file));
        });
    });
    describe('computeEntryHash determinism', () => {
        it('produces the same hash regardless of key order in source', () => {
            const a = (0, ledger_1.computeEntryHash)({ b: 1, a: 2, ts: 't', runId: 'r', seq: 0, prevHash: 'p' });
            const b = (0, ledger_1.computeEntryHash)({ ts: 't', a: 2, prevHash: 'p', b: 1, runId: 'r', seq: 0 });
            assert_1.strict.equal(a, b);
        });
    });
    describe('readEntries', () => {
        it('skips blank lines and tolerates trailing newline', () => {
            const file = tmpFile();
            const led = new ledger_1.HashChainedLedger(file, 'r1');
            led.append({
                type: 'run-started',
                contractId: 'c',
                contractHash: 'h',
                obligationCount: 0,
                goal: 'g',
            });
            const text = fs.readFileSync(file, 'utf8');
            fs.writeFileSync(file, '\n\n' + text + '\n\n', 'utf8');
            const entries = (0, ledger_1.readEntries)(file);
            assert_1.strict.equal(entries.length, 1);
        });
        it('verifyChainEntries accepts an empty ledger', () => {
            assert_1.strict.doesNotThrow(() => (0, ledger_1.verifyChainEntries)([]));
        });
    });
});
