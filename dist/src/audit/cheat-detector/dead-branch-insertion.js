"use strict";
// Dead-branch insertion: a PR adds an `if` branch whose condition is a
// literal false (or a tautology) and whose body is unreachable. Most
// often a leftover from an agent's failed planning step.
Object.defineProperty(exports, "__esModule", { value: true });
exports.deadBranchInsertionDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const DEAD_CONDITIONS = [
    /\bif\s*\(\s*false\s*\)/,
    /\bif\s*\(\s*0\s*\)/,
    /\bif\s*\(\s*null\s*\)/,
    /\bif\s*\(\s*undefined\s*\)/,
    /\bif\s*\(\s*1\s*===\s*2\s*\)/,
    /\bif\s*\(\s*true\s*&&\s*false\s*\)/,
];
exports.deadBranchInsertionDetector = {
    name: 'dead-branch-insertion',
    version: VERSION,
    run(ctx) {
        const findings = [];
        for (const hunk of (0, diff_walker_1.walkHunks)(ctx.files)) {
            if ((0, diff_walker_1.isTestFile)(hunk.file))
                continue;
            for (const addition of hunk.added) {
                if ((0, diff_walker_1.isCommentOnlyLine)(addition.content))
                    continue;
                for (const re of DEAD_CONDITIONS) {
                    if (!re.test(addition.content))
                        continue;
                    findings.push({
                        category: 'dead-branch-insertion',
                        severity: 'block',
                        message: `Dead branch inserted in ${hunk.file}: condition is a literal that can never ` +
                            `be true. Body will never execute.`,
                        location: { file: hunk.file, line: addition.lineNumber },
                        evidence: `+ ${addition.content.trim()}`,
                    });
                    break;
                }
            }
        }
        return findings;
    },
};
