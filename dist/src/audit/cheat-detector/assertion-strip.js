"use strict";
// Assertion-strip: like test-relaxation but specifically for the
// "deleted assertion, added nothing equivalent" case across a *whole
// file*, not just one chunk. If the file's net assertion count went
// down, every removed assertion is reported.
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertionStripDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const ASSERTION_PATTERNS = [
    /\bexpect\s*\(/,
    /\bassert\b/,
    /\bshould\b/,
    /\bt\.Fatal\b/,
    /\bt\.Error\b/,
    /\bt\.Errorf\b/,
    /\bExpect\s*\(/,
];
exports.assertionStripDetector = {
    name: 'assertion-strip',
    version: VERSION,
    run(ctx) {
        const findings = [];
        const perFile = new Map();
        for (const hunk of (0, diff_walker_1.walkHunks)(ctx.files)) {
            if (!(0, diff_walker_1.isTestFile)(hunk.file))
                continue;
            const bucket = perFile.get(hunk.file) ?? { added: 0, removed: 0, removals: [] };
            for (const a of hunk.added)
                if (isAssertion(a.content))
                    bucket.added += 1;
            for (const d of hunk.deleted) {
                if (isAssertion(d.content)) {
                    bucket.removed += 1;
                    bucket.removals.push({ line: d.lineNumber, content: d.content });
                }
            }
            perFile.set(hunk.file, bucket);
        }
        for (const [file, stats] of perFile) {
            const net = stats.removed - stats.added;
            if (net <= 0)
                continue;
            for (const removal of stats.removals.slice(0, net)) {
                findings.push({
                    category: 'assertion-strip',
                    severity: 'block',
                    message: `Net assertion count for ${file} dropped by ${net} after this PR. ` +
                        `Assertions were removed without equivalents added back.`,
                    location: { file, line: removal.line },
                    evidence: `- ${removal.content.trim()}`,
                });
            }
        }
        return findings;
    },
};
function isAssertion(line) {
    return ASSERTION_PATTERNS.some((re) => re.test(line));
}
