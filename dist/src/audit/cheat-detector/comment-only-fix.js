"use strict";
// Comment-only fix: a PR claims to fix something, but the only added
// lines inside source files are comments. The PR title/body cannot be
// read here, so the heuristic is fired only when:
//   * the diff has at least one source-file (non-test) modification
//   * every added line in source files is a comment line (//, #, --, *)
//   * no lines were deleted from source files (excluding pure
//     whitespace) — a pure addition of comments to existing code
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentOnlyFixDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const COMMENT_RE = /^\s*(\/\/|#|--|\/\*|\*|\*\/)/;
exports.commentOnlyFixDetector = {
    name: 'comment-only-fix',
    version: VERSION,
    run(ctx) {
        let sourceAdds = 0;
        let sourceCommentAdds = 0;
        let sourceMeaningfulDels = 0;
        const locations = [];
        for (const hunk of (0, diff_walker_1.walkHunks)(ctx.files)) {
            if ((0, diff_walker_1.isTestFile)(hunk.file))
                continue;
            for (const a of hunk.added) {
                if (a.content.trim().length === 0)
                    continue;
                sourceAdds += 1;
                if (COMMENT_RE.test(a.content)) {
                    sourceCommentAdds += 1;
                    locations.push({ file: hunk.file, line: a.lineNumber, content: a.content });
                }
            }
            for (const d of hunk.deleted) {
                if (d.content.trim().length > 0)
                    sourceMeaningfulDels += 1;
            }
        }
        if (sourceAdds === 0)
            return [];
        if (sourceAdds !== sourceCommentAdds)
            return [];
        if (sourceMeaningfulDels !== 0)
            return [];
        return locations.map((loc) => ({
            category: 'comment-only-fix',
            severity: 'warn',
            message: `Source file ${loc.file} received a comment-only change. ` +
                `If this PR claims to fix or change behavior, the patch does not.`,
            location: { file: loc.file, line: loc.line },
            evidence: `+ ${loc.content.trim()}`,
        }));
    },
};
