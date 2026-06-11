"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCorpusIssue = createCorpusIssue;
exports.formatIssueMessage = formatIssueMessage;
/** Creates a structured corpus-loader issue with remediation guidance. */
function createCorpusIssue(runDir, phase, reason, remediation) {
    return { runDir, phase, reason, remediation };
}
/** Formats loader issues for a halting error message. */
function formatIssueMessage(issues) {
    return [
        `Corpus loader found ${issues.length} invalid verification-run artifact(s):`,
        ...issues.map(item => `${item.runDir} [${item.phase}]: ${item.reason} Remediation: ${item.remediation}`),
    ].join('\n');
}
