"use strict";
// Coverage erosion: a PR adds a new branch in a source file
// (`if`/`else`/`switch`/`case`) without a matching test addition.
// We approximate without a coverage tool by counting branch-opening
// statements added in source vs. test files; a source-side delta of
// >= 1 with zero test-side additions is flagged.
Object.defineProperty(exports, "__esModule", { value: true });
exports.coverageErosionDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const BRANCH_PATTERNS = [
    /\bif\s*\(/,
    /\belse\s+if\s*\(/,
    /\bswitch\s*\(/,
    /\bcase\s+[^:]+:/,
];
exports.coverageErosionDetector = {
    name: 'coverage-erosion',
    version: VERSION,
    run(ctx) {
        let sourceBranches = 0;
        let testAdds = 0;
        const sourceLocations = [];
        for (const hunk of (0, diff_walker_1.walkHunks)(ctx.files)) {
            const test = (0, diff_walker_1.isTestFile)(hunk.file);
            for (const a of hunk.added) {
                if (test) {
                    testAdds += 1;
                }
                else if (BRANCH_PATTERNS.some((re) => re.test(a.content))) {
                    sourceBranches += 1;
                    sourceLocations.push({ file: hunk.file, line: a.lineNumber, content: a.content });
                }
            }
        }
        if (sourceBranches === 0)
            return [];
        if (testAdds > 0)
            return [];
        return sourceLocations.map((loc) => ({
            category: 'coverage-erosion',
            severity: 'warn',
            message: `Source branch added in ${loc.file} with no compensating test addition in this PR. ` +
                `Likely coverage erosion.`,
            location: { file: loc.file, line: loc.line },
            evidence: `+ ${loc.content.trim()}`,
        }));
    },
};
