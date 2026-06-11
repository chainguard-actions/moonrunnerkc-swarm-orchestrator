"use strict";
// Renders an audit result as a GitHub PR-comment body. The PR-comment
// renderer is the user-facing artifact in Phase 1; everything else is
// internal scaffolding. Output is deterministic for a given input — the
// timestamp and ledger link are the only run-specific fields.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPrComment = renderPrComment;
const SEVERITY_ORDER = ['block', 'warn', 'info'];
function renderPrComment(result, options = {}) {
    const headline = result.pass
        ? '# Swarm Audit: PASS'
        : '# Swarm Audit: BLOCK';
    const subtitle = result.pass
        ? '_No blocking cheat patterns detected. Audit obligations are satisfied._'
        : '_Blocking findings below must be addressed before this PR can be merged._';
    const lines = [headline, '', subtitle, ''];
    const agentLine = renderAgentLine(result);
    if (agentLine !== undefined) {
        lines.push(agentLine, '');
    }
    lines.push(renderSummary(result), '');
    for (const severity of SEVERITY_ORDER) {
        const bucket = result.findings.filter((f) => f.severity === severity);
        if (bucket.length === 0)
            continue;
        lines.push(renderSeverityHeader(severity, bucket.length));
        lines.push('');
        for (const finding of bucket) {
            lines.push(renderFinding(finding));
            lines.push('');
        }
    }
    lines.push(renderFooter(result, options));
    return lines.join('\n').trimEnd() + '\n';
}
function renderAgentLine(result) {
    if (result.agent === undefined)
        return undefined;
    const { vendor, version, confidence, source } = result.agent;
    const versionPart = version !== undefined ? ` v${version}` : '';
    return `**Detected agent:** \`${vendor}\`${versionPart} (confidence: ${confidence}, signal: ${source})`;
}
function renderSummary(result) {
    const total = result.findings.length;
    const blocking = result.findings.filter((f) => f.severity === 'block').length;
    const warnings = result.findings.filter((f) => f.severity === 'warn').length;
    const detectorList = Object.entries(result.detectorVersions)
        .map(([name, version]) => `\`${name}@${version}\``)
        .join(', ');
    return [
        `**Findings:** ${total} total — ${blocking} blocking, ${warnings} warnings.`,
        `**Detectors run:** ${detectorList}`,
    ].join('\n');
}
function renderSeverityHeader(severity, count) {
    const label = severity === 'block' ? 'Blocking' : severity === 'warn' ? 'Warning' : 'Informational';
    return `## ${label} (${count})`;
}
function renderFinding(finding) {
    const fileLine = finding.location.endLine !== undefined
        ? `\`${finding.location.file}\`:${finding.location.line}-${finding.location.endLine}`
        : `\`${finding.location.file}\`:${finding.location.line}`;
    return [
        `### \`${finding.category}\` — ${fileLine}`,
        '',
        finding.message,
        '',
        '```diff',
        finding.evidence,
        '```',
    ].join('\n');
}
function renderFooter(result, options) {
    const parts = ['---'];
    const links = [];
    if (options.ledgerUrl !== undefined) {
        links.push(`[Full evidence ledger](${options.ledgerUrl})`);
    }
    if (options.aibomUrl !== undefined) {
        links.push(`[AI-BOM artifact](${options.aibomUrl})`);
    }
    if (options.leaderboardUrl !== undefined) {
        links.push(`[Agent leaderboard](${options.leaderboardUrl})`);
    }
    if (links.length > 0)
        parts.push(links.join(' · '));
    parts.push(`_Generated ${result.generatedAt} by [swarm-audit](https://github.com/moonrunnerkc/swarm-orchestrator)._`);
    return parts.join('\n\n');
}
