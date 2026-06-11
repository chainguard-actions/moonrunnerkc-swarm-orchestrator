"use strict";
// Reads a v10 audit ledger file and projects it into the shape the
// CycloneDX-ML and SPDX-AI emitters consume. Kept independent of the
// emitters so changes to AIBOM specs don't ripple into ledger code.
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAuditLedger = readAuditLedger;
const ledger_1 = require("../../ledger/ledger");
const errors_1 = require("../../errors");
function readAuditLedger(filePath) {
    const entries = (0, ledger_1.readEntries)(filePath);
    if (entries.length === 0) {
        throw new errors_1.SwarmError(`audit ledger ${filePath} is empty`, 'AIBOM_LEDGER_EMPTY', {
            remediation: 'Try: re-run `swarm audit` to produce a ledger',
        });
    }
    const started = entries.find((e) => e.type === 'pr-audit-started');
    const completed = entries.find((e) => e.type === 'pr-audit-completed');
    if (started === undefined || completed === undefined) {
        throw new errors_1.SwarmError(`audit ledger ${filePath} is missing pr-audit-started / pr-audit-completed entries`, 'AIBOM_LEDGER_INCOMPLETE', { remediation: 'Try: regenerate the ledger by re-running `swarm audit`' });
    }
    const findings = entries.filter((e) => e.type === 'pr-audit-finding');
    const summary = {
        runId: started.runId,
        started,
        findings,
        completed,
        generatedAt: completed.ts,
    };
    const agent = pickAgent(entries);
    if (agent !== undefined)
        summary.agent = agent;
    return summary;
}
function pickAgent(entries) {
    for (const e of entries) {
        if (e.aiAgent !== undefined)
            return e.aiAgent;
    }
    return undefined;
}
