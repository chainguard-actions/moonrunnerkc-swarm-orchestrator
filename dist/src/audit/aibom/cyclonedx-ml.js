"use strict";
// CycloneDX 1.6 ML-BOM emitter.
//
// Each audit run becomes one CycloneDX document. The audited agent (when
// known) is a `component` of type `machine-learning-model`; each cheat
// finding is encoded as a `vulnerability` with `affects` pointing to the
// agent component. The full evidence ledger is referenced via the
// document's `externalReferences` so a downstream procurement reviewer
// can verify the hash chain.
//
// We hand-roll the JSON rather than pull in a CycloneDX npm package —
// the schema is stable, the document is small, and the project policy
// is "no new runtime deps in Phase 1".
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
exports.CYCLONEDX_FORMAT = exports.CYCLONEDX_SPEC_VERSION = void 0;
exports.buildCycloneDxMlBom = buildCycloneDxMlBom;
exports.writeCycloneDxMlBom = writeCycloneDxMlBom;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const ledger_reader_1 = require("./ledger-reader");
exports.CYCLONEDX_SPEC_VERSION = '1.6';
exports.CYCLONEDX_FORMAT = 'CycloneDX';
const TOOL_NAME = 'swarm-audit';
function buildCycloneDxMlBom(summary, ledgerFilePath, toolVersion) {
    const subject = renderSubjectComponent(summary);
    const components = [subject];
    if (summary.agent !== undefined) {
        components.push(renderAgentComponent(summary.agent));
    }
    const vulnerabilities = summary.findings.map((f, idx) => renderVulnerability(f, idx, subject));
    return {
        bomFormat: exports.CYCLONEDX_FORMAT,
        specVersion: exports.CYCLONEDX_SPEC_VERSION,
        serialNumber: `urn:uuid:${crypto.randomUUID()}`,
        version: 1,
        metadata: {
            timestamp: summary.generatedAt,
            tools: [{ name: TOOL_NAME, vendor: 'moonrunnerkc', version: toolVersion }],
            component: subject,
        },
        components,
        vulnerabilities,
        externalReferences: renderExternalRefs(ledgerFilePath),
    };
}
function writeCycloneDxMlBom(ledgerFilePath, outFilePath, toolVersion = readPackageVersion()) {
    const summary = (0, ledger_reader_1.readAuditLedger)(ledgerFilePath);
    const doc = buildCycloneDxMlBom(summary, ledgerFilePath, toolVersion);
    fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
    fs.writeFileSync(outFilePath, JSON.stringify(doc, null, 2) + '\n', { encoding: 'utf8' });
}
function renderSubjectComponent(summary) {
    const repo = summary.started.prRepository ?? 'unknown-repository';
    const prNum = summary.started.prNumber ?? -1;
    const subject = {
        'bom-ref': `audit:${summary.runId}`,
        type: 'application',
        name: `${repo}#${prNum}`,
        description: `Patch audit subject for PR ${repo}#${prNum} at head ${summary.started.prHeadSha}.`,
    };
    return subject;
}
function renderAgentComponent(agent) {
    const entry = {
        'bom-ref': `agent:${agent.vendor}`,
        type: 'machine-learning-model',
        name: agent.vendor,
        group: 'ai-coding-agent',
        description: `AI coding agent that opened the audited patch (signal: ${agent.source ?? 'unknown'}).`,
        modelCard: {
            properties: [
                { name: 'attribution.confidence', value: agent.confidence ?? 'unknown' },
                { name: 'attribution.source', value: agent.source ?? 'unknown' },
            ],
        },
    };
    if (agent.version !== undefined)
        entry.version = agent.version;
    return entry;
}
function renderVulnerability(finding, idx, subject) {
    return {
        'bom-ref': `finding:${finding.runId}:${finding.seq}`,
        id: `SWARM-${idx + 1}-${finding.category}`,
        source: { name: 'swarm-audit' },
        ratings: [{ severity: mapSeverity(finding.severity) }],
        description: finding.message,
        detail: `Detected cheat pattern: ${finding.category} (severity ${finding.severity}).`,
        affects: [{ ref: subject['bom-ref'] }],
        properties: [
            { name: 'swarm.location.file', value: finding.file },
            { name: 'swarm.location.line', value: String(finding.line) },
            { name: 'swarm.evidence.sha256', value: finding.evidenceSha256 },
            { name: 'swarm.category', value: finding.category },
        ],
    };
}
function mapSeverity(s) {
    if (s === 'block')
        return 'high';
    if (s === 'warn')
        return 'medium';
    return 'info';
}
function renderExternalRefs(ledgerFilePath) {
    const abs = path.resolve(ledgerFilePath);
    if (!fs.existsSync(abs)) {
        return [{ type: 'attestation', url: `file://${abs}` }];
    }
    const content = fs.readFileSync(abs);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    return [
        {
            type: 'attestation',
            url: `file://${abs}`,
            hashes: [{ alg: 'SHA-256', content: sha256 }],
        },
    ];
}
function readPackageVersion() {
    const candidates = [
        path.resolve(__dirname, '..', '..', '..', 'package.json'),
        path.resolve(__dirname, '..', '..', '..', '..', 'package.json'),
    ];
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate))
            continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            if (typeof parsed.version === 'string')
                return parsed.version;
        }
        catch (err) {
            throw new Error(`failed to read package.json at ${candidate}: ${err.message}`, {
                cause: err,
            });
        }
    }
    return '0.0.0';
}
