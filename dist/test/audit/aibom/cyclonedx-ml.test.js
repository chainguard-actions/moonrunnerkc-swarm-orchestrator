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
const cyclonedx_ml_1 = require("../../../src/audit/aibom/cyclonedx-ml");
const ledger_1 = require("../../../src/ledger/ledger");
function seedLedger() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cdx-'));
    const runId = `audit-test-${Date.now()}`;
    const ledgerPath = path.join(dir, 'ledger.jsonl');
    const ledger = new ledger_1.HashChainedLedger(ledgerPath, runId);
    ledger.append({
        type: 'pr-audit-started',
        prNumber: 42,
        prRepository: 'owner/repo',
        prHeadSha: 'abc',
        prBaseSha: 'def',
        detectorsScheduled: ['test-relaxation'],
    }, { aiAgent: { vendor: 'claude-code', confidence: 'high', source: 'bot-author', version: '4.7' } });
    ledger.append({
        type: 'pr-audit-finding',
        category: 'test-relaxation',
        severity: 'block',
        file: 'foo.test.ts',
        line: 12,
        message: 'strict→loose',
        evidenceSha256: '0'.repeat(64),
    }, { aiAgent: { vendor: 'claude-code', confidence: 'high', source: 'bot-author', version: '4.7' } });
    ledger.append({
        type: 'pr-audit-completed',
        prNumber: 42,
        prRepository: 'owner/repo',
        pass: false,
        findingCount: 1,
        blockingCount: 1,
        warningCount: 0,
        detectorVersions: { 'test-relaxation': '1.0.0' },
        wallTimeMs: 10,
        detail: 'audit block',
    }, { aiAgent: { vendor: 'claude-code', confidence: 'high', source: 'bot-author', version: '4.7' } });
    return { ledgerPath, runId };
}
describe('aibom / cyclonedx-ml', () => {
    it('builds a valid CycloneDX 1.6 ML-BOM document', () => {
        const { ledgerPath } = seedLedger();
        const dir = path.dirname(ledgerPath);
        const out = path.join(dir, 'cdx.json');
        (0, cyclonedx_ml_1.writeCycloneDxMlBom)(ledgerPath, out, '10.0.0');
        const text = fs.readFileSync(out, 'utf8');
        const doc = JSON.parse(text);
        assert_1.strict.equal(doc.bomFormat, 'CycloneDX');
        assert_1.strict.equal(doc.specVersion, '1.6');
        assert_1.strict.ok(doc.serialNumber.startsWith('urn:uuid:'));
        assert_1.strict.equal(doc.metadata.tools[0]?.name, 'swarm-audit');
        assert_1.strict.equal(doc.metadata.tools[0]?.version, '10.0.0');
        assert_1.strict.equal(doc.metadata.component.type, 'application');
        assert_1.strict.equal(doc.components[1]?.type, 'machine-learning-model');
        assert_1.strict.equal(doc.components[1]?.name, 'claude-code');
        assert_1.strict.equal(doc.vulnerabilities.length, 1);
        assert_1.strict.equal(doc.vulnerabilities[0]?.ratings[0]?.severity, 'high');
        assert_1.strict.ok(doc.externalReferences[0]?.hashes?.[0]?.alg === 'SHA-256');
    });
    it('builds a document with no findings vulnerability list when the audit passed', () => {
        // Seed with only started+completed (no finding entry).
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cdx-clean-'));
        const ledger = new ledger_1.HashChainedLedger(path.join(dir, 'l.jsonl'), 'audit-pass');
        ledger.append({
            type: 'pr-audit-started',
            prNumber: 1,
            prRepository: 'o/r',
            prHeadSha: 'a',
            prBaseSha: 'b',
            detectorsScheduled: [],
        });
        ledger.append({
            type: 'pr-audit-completed',
            prNumber: 1,
            prRepository: 'o/r',
            pass: true,
            findingCount: 0,
            blockingCount: 0,
            warningCount: 0,
            detectorVersions: {},
            wallTimeMs: 1,
            detail: 'pass',
        });
        const summary = (0, cyclonedx_ml_1.buildCycloneDxMlBom)({
            runId: 'audit-pass',
            started: {},
            findings: [],
            completed: {},
            generatedAt: '2026-05-23T00:00:00.000Z',
        }, path.join(dir, 'l.jsonl'), '10.0.0');
        assert_1.strict.equal(summary.vulnerabilities.length, 0);
    });
});
