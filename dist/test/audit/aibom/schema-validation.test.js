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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
const cyclonedx_ml_1 = require("../../../src/audit/aibom/cyclonedx-ml");
const spdx_ai_profile_1 = require("../../../src/audit/aibom/spdx-ai-profile");
const ledger_1 = require("../../../src/ledger/ledger");
// Local schemas are intentionally minimal — they assert the shape Swarm
// emits, not full upstream-spec validation. Full upstream-spec validation
// would require committing or fetching the multi-megabyte CycloneDX
// 1.6 + SPDX 3.0 JSON Schemas, which is out of scope for unit tests.
// The schemas here cover the structural invariants downstream tools key
// off of (bomFormat, specVersion, @context, top-level required fields).
const CYCLONEDX_MIN_SCHEMA = {
    type: 'object',
    required: ['bomFormat', 'specVersion', 'serialNumber', 'version', 'metadata', 'components', 'vulnerabilities'],
    properties: {
        bomFormat: { const: 'CycloneDX' },
        specVersion: { const: '1.6' },
        serialNumber: { type: 'string', pattern: '^urn:uuid:' },
        version: { type: 'integer' },
        metadata: {
            type: 'object',
            required: ['timestamp', 'tools', 'component'],
            properties: {
                timestamp: { type: 'string' },
                tools: { type: 'array', minItems: 1 },
                component: { type: 'object' },
            },
        },
        components: {
            type: 'array',
            items: {
                type: 'object',
                required: ['bom-ref', 'type', 'name'],
            },
        },
        vulnerabilities: {
            type: 'array',
            items: {
                type: 'object',
                required: ['bom-ref', 'id', 'source', 'ratings', 'description', 'affects', 'properties'],
            },
        },
        externalReferences: { type: 'array' },
    },
};
const SPDX_MIN_SCHEMA = {
    type: 'object',
    required: ['@context', '@graph'],
    properties: {
        '@context': { type: 'array', minItems: 1 },
        '@graph': {
            type: 'array',
            contains: {
                type: 'object',
                properties: {
                    '@type': { const: 'CreationInfo' },
                    specVersion: { const: 'SPDX-3.0' },
                },
                required: ['@type', 'specVersion'],
            },
        },
    },
};
function seedLedger() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-schema-'));
    const ledgerPath = path.join(outDir, 'ledger.jsonl');
    const ledger = new ledger_1.HashChainedLedger(ledgerPath, 'audit-schema-test');
    ledger.append({
        type: 'pr-audit-started',
        prNumber: 1,
        prRepository: 'o/r',
        prHeadSha: 'a',
        prBaseSha: 'b',
        detectorsScheduled: ['test-relaxation'],
    }, { aiAgent: { vendor: 'claude-code', confidence: 'high', source: 'bot-author' } });
    ledger.append({
        type: 'pr-audit-finding',
        category: 'test-relaxation',
        severity: 'block',
        file: 'foo.test.ts',
        line: 10,
        message: 'strict→loose',
        evidenceSha256: '0'.repeat(64),
    });
    ledger.append({
        type: 'pr-audit-completed',
        prNumber: 1,
        prRepository: 'o/r',
        pass: false,
        findingCount: 1,
        blockingCount: 1,
        warningCount: 0,
        detectorVersions: { 'test-relaxation': '1.0.0' },
        wallTimeMs: 10,
        detail: 'block',
    });
    return { ledgerPath, outDir };
}
describe('aibom / schema validation', () => {
    it('CycloneDX-ML output validates against the structural-invariants schema', () => {
        const { ledgerPath, outDir } = seedLedger();
        const out = path.join(outDir, 'cdx.json');
        (0, cyclonedx_ml_1.writeCycloneDxMlBom)(ledgerPath, out, '10.0.0');
        const ajv = new ajv_1.default({ allErrors: true });
        const validate = ajv.compile(CYCLONEDX_MIN_SCHEMA);
        const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
        const ok = validate(doc);
        assert_1.strict.equal(ok, true, JSON.stringify(validate.errors));
    });
    it('SPDX-AI output validates against the structural-invariants schema', () => {
        const { ledgerPath, outDir } = seedLedger();
        const out = path.join(outDir, 'spdx.json');
        (0, spdx_ai_profile_1.writeSpdxAiProfileBom)(ledgerPath, out, '10.0.0');
        const ajv = new ajv_1.default({ allErrors: true });
        const validate = ajv.compile(SPDX_MIN_SCHEMA);
        const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
        const ok = validate(doc);
        assert_1.strict.equal(ok, true, JSON.stringify(validate.errors));
    });
});
