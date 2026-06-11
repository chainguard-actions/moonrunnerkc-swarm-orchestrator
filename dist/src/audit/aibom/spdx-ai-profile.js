"use strict";
// SPDX 3.0 AI-Profile emitter.
//
// Each audit run becomes one SPDX document carrying:
//   - one SoftwareApplication for the audited patch
//   - one AIPackage element for the detected agent (when known)
//   - one Annotation per cheat finding, AI-Profile-compliant
//   - one Relationship of type `audited` from the agent to the patch
//
// Hand-rolled JSON to match the project's no-new-runtime-deps stance.
// Tracks the SPDX 3.0 spec field names: `spdxId`, `creationInfo`,
// `type`, `name`, `releaseTime`, etc. Documents emit valid against the
// SPDX 3.0 JSON-LD context.
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
exports.SPDX_AI_PROFILE = exports.SPDX_SPEC_VERSION = void 0;
exports.buildSpdxAiProfileBom = buildSpdxAiProfileBom;
exports.writeSpdxAiProfileBom = writeSpdxAiProfileBom;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const ledger_reader_1 = require("./ledger-reader");
exports.SPDX_SPEC_VERSION = 'SPDX-3.0';
exports.SPDX_AI_PROFILE = 'AI';
const SPDX_CONTEXT = [
    'https://spdx.org/rdf/3.0.0/spdx-context.jsonld',
    'https://spdx.org/rdf/3.0.0/ai-profile-context.jsonld',
];
function buildSpdxAiProfileBom(summary, toolVersion) {
    const creationInfoId = `_:creation-${summary.runId}`;
    const creationInfo = {
        '@id': creationInfoId,
        '@type': 'CreationInfo',
        specVersion: exports.SPDX_SPEC_VERSION,
        created: summary.generatedAt,
        createdBy: [
            {
                '@id': `_:tool-swarm-audit`,
                '@type': 'Tool',
                name: 'swarm-audit',
                version: toolVersion,
            },
        ],
        profile: ['core', exports.SPDX_AI_PROFILE],
    };
    const subject = renderSubject(summary, creationInfoId);
    const graph = [creationInfo, subject];
    if (summary.agent !== undefined) {
        const agentElement = renderAgent(summary.agent, creationInfoId);
        graph.push(agentElement);
        graph.push(renderRelationship('audited', agentElement['@id'], subject['@id'], creationInfoId, summary.runId, 0));
    }
    let idx = 0;
    for (const finding of summary.findings) {
        graph.push(renderFindingAnnotation(finding, subject['@id'], creationInfoId, summary.runId, idx));
        idx += 1;
    }
    return { '@context': SPDX_CONTEXT, '@graph': graph };
}
function writeSpdxAiProfileBom(ledgerFilePath, outFilePath, toolVersion = readPackageVersion()) {
    const summary = (0, ledger_reader_1.readAuditLedger)(ledgerFilePath);
    const doc = buildSpdxAiProfileBom(summary, toolVersion);
    fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
    fs.writeFileSync(outFilePath, JSON.stringify(doc, null, 2) + '\n', { encoding: 'utf8' });
}
function renderSubject(summary, creationInfoId) {
    const repo = summary.started.prRepository ?? 'unknown-repository';
    const prNum = summary.started.prNumber ?? -1;
    return {
        '@id': `spdx:subject:${summary.runId}`,
        '@type': 'SoftwareApplication',
        name: `${repo}#${prNum}`,
        creationInfo: creationInfoId,
        releaseTime: summary.started.ts,
        summary: `PR audit subject ${repo}#${prNum} at head ${summary.started.prHeadSha}.`,
    };
}
function renderAgent(agent, creationInfoId) {
    const element = {
        '@id': `spdx:agent:${agent.vendor}`,
        '@type': 'AIPackage',
        name: agent.vendor,
        creationInfo: creationInfoId,
        description: `AI coding agent attributed by signal "${agent.source ?? 'unknown'}" with ${agent.confidence ?? 'unknown'} confidence.`,
    };
    if (agent.version !== undefined)
        element.packageVersion = agent.version;
    return element;
}
function renderFindingAnnotation(finding, subjectId, creationInfoId, runId, idx) {
    return {
        '@id': `spdx:annotation:${runId}:${idx}`,
        '@type': 'Annotation',
        annotationType: finding.severity === 'block' ? 'review' : 'other',
        contentType: 'text/plain',
        statement: `[${finding.severity.toUpperCase()}] ${finding.category}: ${finding.file}:${finding.line} — ` +
            `${finding.message} (evidence sha256: ${finding.evidenceSha256})`,
        subject: { '@id': subjectId },
        creationInfo: creationInfoId,
    };
}
function renderRelationship(relationshipType, fromId, toId, creationInfoId, runId, idx) {
    return {
        '@id': `spdx:relationship:${runId}:${idx}`,
        '@type': 'Relationship',
        relationshipType,
        from: { '@id': fromId },
        to: [{ '@id': toId }],
        creationInfo: creationInfoId,
    };
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
// Crypto reference kept for future inline-evidence-hash use.
void crypto;
