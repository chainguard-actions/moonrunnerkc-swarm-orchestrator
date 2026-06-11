"use strict";
/**
 * Implementation of `swarm audit` (and `swarm v8 audit`).
 *
 * The v10 auditor entry point. Runs the cheat-detector engine against a
 * unified diff, optionally fingerprints the AI agent that opened the
 * PR, writes findings to the run ledger as v10 audit entries, and (when
 * --emit-aibom is passed) writes a CycloneDX-ML or SPDX-AI artifact.
 *
 * Three input modes are supported:
 *
 *   1. --diff-file <path>     read unified diff from disk
 *   2. --diff-stdin           read unified diff from stdin
 *   3. --pr <url|owner/repo#N> fetch the PR's diff via GitHub API (uses
 *                              GITHUB_TOKEN if available)
 *
 * Exit code:
 *   0 — no blocking findings
 *   1 — at least one blocking finding (the merge gate)
 *   2 — usage error or unrecoverable failure
 */
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
exports.handleAudit = handleAudit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const logger_1 = require("../../logger");
const argv_schema_1 = require("./argv-schema");
const cheat_detector_1 = require("../../audit/cheat-detector");
const pr_source_1 = require("../../audit/pr-source");
const report_comment_1 = require("../../audit/report-comment");
const cyclonedx_ml_1 = require("../../audit/aibom/cyclonedx-ml");
const spdx_ai_profile_1 = require("../../audit/aibom/spdx-ai-profile");
const ledger_1 = require("../../ledger/ledger");
const errors_1 = require("../../errors");
const pr_fetch_1 = require("./pr-fetch");
const logger = (0, logger_1.getLogger)('cli:v8:audit');
const AUDIT_SCHEMA = {
    'diff-file': { type: 'string' },
    'diff-stdin': { type: 'boolean' },
    pr: { type: 'string' },
    'repo-root': { type: 'string' },
    output: { type: 'string' },
    'emit-aibom': { type: 'string' },
    'aibom-out': { type: 'string' },
    'ledger-path': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
};
const USAGE = [
    'usage: swarm audit [<pr-ref>] [flags]',
    '',
    'inputs (exactly one required):',
    '  <pr-ref>                  positional: <owner>/<repo>#<number> or PR URL',
    '  --pr <ref>                same as positional <pr-ref>',
    '  --diff-file <path>        unified diff on disk',
    '  --diff-stdin              read unified diff from stdin',
    '',
    'options:',
    '  --repo-root <path>        repo checkout for manifest / test-import lookups (default: cwd)',
    "  --output <fmt>            text (default) | json | markdown",
    '  --emit-aibom <fmt>        cyclonedx-ml | spdx-ai | both',
    '  --aibom-out <path>        directory for AIBOM artifacts (default: .swarm/aibom)',
    '  --ledger-path <path>      override audit ledger file (default: .swarm/ledger/audit-<runId>.jsonl)',
    '  --help, -h                show this message',
    '',
    'exit codes:',
    '  0 — pass (no blocking findings)',
    '  1 — block (one or more blocking findings)',
    '  2 — usage error or unrecoverable failure',
    '',
].join('\n');
function parseFlags(argv) {
    const { values, positionals } = (0, argv_schema_1.runParseArgs)(argv, AUDIT_SCHEMA);
    const helpRequested = (0, argv_schema_1.readBoolean)(values, 'help');
    if (helpRequested) {
        process.stderr.write(USAGE);
        return makeMinimalFlags(true);
    }
    const flags = {
        diffStdin: (0, argv_schema_1.readBoolean)(values, 'diff-stdin'),
        repoRoot: (0, argv_schema_1.readString)(values, 'repo-root') ?? process.cwd(),
        output: parseOutput((0, argv_schema_1.readString)(values, 'output')),
        aibomPath: (0, argv_schema_1.readString)(values, 'aibom-out') ?? '.swarm/aibom',
        helpRequested: false,
    };
    const diffFile = (0, argv_schema_1.readString)(values, 'diff-file');
    if (diffFile !== undefined)
        flags.diffFile = diffFile;
    const prFlag = (0, argv_schema_1.readString)(values, 'pr');
    const prPositional = positionals[0];
    if (prFlag !== undefined)
        flags.prRef = prFlag;
    else if (prPositional !== undefined)
        flags.prRef = prPositional;
    const aibom = (0, argv_schema_1.readString)(values, 'emit-aibom');
    if (aibom !== undefined)
        flags.emitAibom = parseAibom(aibom);
    const ledgerPath = (0, argv_schema_1.readString)(values, 'ledger-path');
    if (ledgerPath !== undefined)
        flags.ledgerPath = ledgerPath;
    validateFlags(flags);
    return flags;
}
function makeMinimalFlags(helpRequested) {
    return {
        diffStdin: false,
        repoRoot: process.cwd(),
        output: 'text',
        aibomPath: '.swarm/aibom',
        helpRequested,
    };
}
function parseOutput(raw) {
    if (raw === undefined)
        return 'text';
    if (raw === 'text' || raw === 'json' || raw === 'markdown')
        return raw;
    throw new errors_1.SwarmError(`invalid --output value "${raw}"; expected text | json | markdown`, 'AUDIT_USAGE', { remediation: 'Try: --output text | --output json | --output markdown' });
}
function parseAibom(raw) {
    if (raw === 'cyclonedx-ml' || raw === 'spdx-ai' || raw === 'both')
        return raw;
    throw new errors_1.SwarmError(`invalid --emit-aibom value "${raw}"; expected cyclonedx-ml | spdx-ai | both`, 'AUDIT_USAGE', { remediation: 'Try: --emit-aibom cyclonedx-ml' });
}
function validateFlags(flags) {
    const sources = [flags.diffFile, flags.prRef, flags.diffStdin ? 'stdin' : undefined].filter((x) => x !== undefined);
    if (sources.length !== 1) {
        throw new errors_1.SwarmError('exactly one of --diff-file, --diff-stdin, or --pr/<pr-ref> must be provided', 'AUDIT_USAGE', { remediation: 'Try: swarm audit --diff-stdin < my.patch' });
    }
}
async function handleAudit(argv) {
    let flags;
    try {
        flags = parseFlags(argv);
    }
    catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        if (err instanceof errors_1.SwarmError && err.remediation !== undefined) {
            logger.error(err.remediation);
        }
        return 2;
    }
    if (flags.helpRequested)
        return 0;
    return await runAudit(flags);
}
async function runAudit(flags) {
    const startedAt = Date.now();
    const unifiedDiff = await loadDiff(flags);
    const prContext = await loadPrContext(flags);
    const agent = prContext !== undefined ? (0, pr_source_1.detectAgent)(prContext.fingerprintInput) : undefined;
    const auditInput = {
        unifiedDiff,
        repoRoot: flags.repoRoot,
    };
    if (agent !== undefined)
        auditInput.agent = agent;
    if (prContext !== undefined)
        auditInput.pr = prContext.prMetadata;
    const result = (0, cheat_detector_1.runCheatDetectors)(auditInput);
    const wallTimeMs = Date.now() - startedAt;
    const runId = `audit-${crypto.randomUUID()}`;
    const ledgerPath = flags.ledgerPath !== undefined
        ? flags.ledgerPath
        : path.join('.swarm', 'ledger', `${runId}.jsonl`);
    const ledger = new ledger_1.HashChainedLedger(ledgerPath, runId);
    const attribution = agentToLedger(agent);
    ledger.append({
        type: 'pr-audit-started',
        prNumber: prContext?.prMetadata.number ?? null,
        prRepository: prContext?.prMetadata.repository ?? null,
        prHeadSha: prContext?.prMetadata.headSha ?? '',
        prBaseSha: prContext?.prMetadata.baseSha ?? '',
        detectorsScheduled: Object.keys(result.detectorVersions),
    }, attribution !== undefined ? { aiAgent: attribution } : undefined);
    for (const finding of result.findings) {
        const evidenceSha256 = crypto.createHash('sha256').update(finding.evidence).digest('hex');
        const payload = {
            type: 'pr-audit-finding',
            category: finding.category,
            severity: finding.severity,
            file: finding.location.file,
            line: finding.location.line,
            message: finding.message,
            evidenceSha256,
        };
        if (finding.location.endLine !== undefined) {
            payload.endLine = finding.location.endLine;
        }
        ledger.append(payload, attribution !== undefined ? { aiAgent: attribution } : undefined);
    }
    ledger.append({
        type: 'pr-audit-completed',
        prNumber: prContext?.prMetadata.number ?? null,
        prRepository: prContext?.prMetadata.repository ?? null,
        pass: result.pass,
        findingCount: result.findings.length,
        blockingCount: result.findings.filter((f) => f.severity === 'block').length,
        warningCount: result.findings.filter((f) => f.severity === 'warn').length,
        detectorVersions: result.detectorVersions,
        wallTimeMs,
        detail: result.pass
            ? `audit pass — ${result.findings.length} non-blocking finding(s)`
            : `audit block — ${result.findings.filter((f) => f.severity === 'block').length} blocking finding(s)`,
    }, attribution !== undefined ? { aiAgent: attribution } : undefined);
    if (flags.emitAibom !== undefined) {
        await emitAibom(flags.emitAibom, flags.aibomPath, ledgerPath, runId);
    }
    emitOutput(flags.output, result, ledgerPath);
    return result.pass ? 0 : 1;
}
async function loadDiff(flags) {
    if (flags.diffFile !== undefined) {
        if (!fs.existsSync(flags.diffFile)) {
            throw new errors_1.SwarmError(`diff file not found: ${flags.diffFile}`, 'AUDIT_INPUT', {
                remediation: 'Try: check the path or use --pr instead',
            });
        }
        return fs.readFileSync(flags.diffFile, 'utf8');
    }
    if (flags.diffStdin) {
        return readStdin();
    }
    if (flags.prRef !== undefined) {
        const ref = (0, pr_fetch_1.parsePrRef)(flags.prRef);
        return (0, pr_fetch_1.fetchPrDiffViaGithub)(ref);
    }
    throw new errors_1.SwarmError('no diff source available', 'AUDIT_INPUT', {
        remediation: 'Try: --diff-file, --diff-stdin, or --pr <ref>',
    });
}
async function loadPrContext(flags) {
    if (flags.prRef === undefined)
        return undefined;
    const ref = (0, pr_fetch_1.parsePrRef)(flags.prRef);
    return await fetchPrContextViaGithub(ref);
}
async function fetchPrContextViaGithub(ref) {
    // Defer to pr-fetch which knows the @octokit/rest client.
    const fetched = await (await Promise.resolve().then(() => __importStar(require('./pr-fetch')))).fetchPrContext(ref);
    return fetched;
}
function agentToLedger(agent) {
    if (agent === undefined)
        return undefined;
    const out = { vendor: agent.vendor };
    if (agent.version !== undefined)
        out.version = agent.version;
    out.confidence = agent.confidence;
    out.source = agent.source;
    return out;
}
async function emitAibom(format, outDir, ledgerPath, runId) {
    fs.mkdirSync(outDir, { recursive: true });
    if (format === 'cyclonedx-ml' || format === 'both') {
        const target = path.join(outDir, `${runId}.cdx.json`);
        (0, cyclonedx_ml_1.writeCycloneDxMlBom)(ledgerPath, target);
        logger.info(`AIBOM (CycloneDX-ML): ${target}`);
    }
    if (format === 'spdx-ai' || format === 'both') {
        const target = path.join(outDir, `${runId}.spdx.json`);
        (0, spdx_ai_profile_1.writeSpdxAiProfileBom)(ledgerPath, target);
        logger.info(`AIBOM (SPDX-AI): ${target}`);
    }
}
function emitOutput(format, result, ledgerPath) {
    if (format === 'json') {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
    }
    if (format === 'markdown') {
        process.stdout.write((0, report_comment_1.renderPrComment)(result, { ledgerUrl: ledgerPath }));
        return;
    }
    const header = result.pass ? 'PASS' : 'BLOCK';
    const blocking = result.findings.filter((f) => f.severity === 'block').length;
    const warnings = result.findings.filter((f) => f.severity === 'warn').length;
    logger.info(`audit ${header}: ${blocking} blocking, ${warnings} warning (ledger: ${ledgerPath})`);
    for (const finding of result.findings) {
        logger.info(`  [${finding.severity}] ${finding.category}: ${finding.location.file}:${finding.location.line} — ${finding.message}`);
    }
}
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', (err) => reject(new errors_1.SwarmError(`failed to read stdin: ${err.message}`, 'AUDIT_INPUT', { cause: err })));
    });
}
