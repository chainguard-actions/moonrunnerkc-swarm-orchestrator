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
const spdx_ai_profile_1 = require("../../../src/audit/aibom/spdx-ai-profile");
const ledger_1 = require("../../../src/ledger/ledger");
function seed() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-spdx-'));
    const ledgerPath = path.join(dir, 'ledger.jsonl');
    const outPath = path.join(dir, 'spdx.json');
    const ledger = new ledger_1.HashChainedLedger(ledgerPath, 'audit-spdx-test');
    ledger.append({
        type: 'pr-audit-started',
        prNumber: 7,
        prRepository: 'owner/repo',
        prHeadSha: 'h',
        prBaseSha: 'b',
        detectorsScheduled: ['mock-of-hallucination'],
    }, { aiAgent: { vendor: 'cursor', confidence: 'high', source: 'bot-author' } });
    ledger.append({
        type: 'pr-audit-finding',
        category: 'mock-of-hallucination',
        severity: 'block',
        file: 'x.test.ts',
        line: 1,
        message: 'mocked nonexistent module',
        evidenceSha256: '0'.repeat(64),
    }, { aiAgent: { vendor: 'cursor', confidence: 'high', source: 'bot-author' } });
    ledger.append({
        type: 'pr-audit-completed',
        prNumber: 7,
        prRepository: 'owner/repo',
        pass: false,
        findingCount: 1,
        blockingCount: 1,
        warningCount: 0,
        detectorVersions: { 'mock-of-hallucination': '1.0.0' },
        wallTimeMs: 5,
        detail: 'block',
    });
    return { ledgerPath, outPath };
}
describe('aibom / spdx-ai-profile', () => {
    it('emits a valid SPDX 3.0 AI-Profile document', () => {
        const { ledgerPath, outPath } = seed();
        (0, spdx_ai_profile_1.writeSpdxAiProfileBom)(ledgerPath, outPath, '10.0.0');
        const doc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        assert_1.strict.ok(Array.isArray(doc['@context']));
        assert_1.strict.ok(doc['@context'].some((s) => s.includes('spdx-context.jsonld')));
        assert_1.strict.ok(doc['@context'].some((s) => s.includes('ai-profile-context.jsonld')));
        const graph = doc['@graph'];
        assert_1.strict.ok(Array.isArray(graph));
        const creation = graph.find((e) => e['@type'] === 'CreationInfo');
        assert_1.strict.equal(creation?.specVersion, 'SPDX-3.0');
        assert_1.strict.ok(creation?.profile.includes('AI'));
        const ai = graph.find((e) => e['@type'] === 'AIPackage');
        assert_1.strict.equal(ai?.name, 'cursor');
        const annotation = graph.find((e) => e['@type'] === 'Annotation');
        assert_1.strict.equal(annotation?.annotationType, 'review');
        const rel = graph.find((e) => e['@type'] === 'Relationship');
        assert_1.strict.equal(rel?.relationshipType, 'audited');
    });
});
