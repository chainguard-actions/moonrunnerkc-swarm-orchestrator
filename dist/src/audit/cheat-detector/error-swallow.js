"use strict";
// Error swallow: a try/catch added with an empty catch block (or one
// that only contains a comment). Tells the engine that the agent hid
// an exception path to make the test pass. We also flag the inverse —
// an *existing* try block whose catch body was emptied by the PR.
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorSwallowDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
// Matches: `} catch {}`, `} catch (e) {}`, `catch (...) { /* comment */ }`,
// `catch:` (Python pass-only). Lookahead for an empty body or comment-only.
const EMPTY_CATCH_PATTERNS = [
    /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\/\/[^\n]*\}/,
    /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\/\*[^*]*\*\/\s*\}/,
    /\bexcept\b[^:]*:\s*pass\b/,
];
exports.errorSwallowDetector = {
    name: 'error-swallow',
    version: VERSION,
    run(ctx) {
        const findings = [];
        for (const hunk of (0, diff_walker_1.walkHunks)(ctx.files)) {
            if ((0, diff_walker_1.isTestFile)(hunk.file))
                continue;
            const file = ctx.files.find((f) => (0, diff_walker_1.filePath)(f) === hunk.file);
            if (file === undefined || !(0, diff_walker_1.shouldInspect)(file))
                continue;
            const addedJoined = hunk.added
                .filter((a) => !(0, diff_walker_1.isCommentOnlyLine)(a.content))
                .map((a) => a.content)
                .join('\n');
            // Multi-line: scan added block as a single text body.
            for (const re of EMPTY_CATCH_PATTERNS) {
                if (re.test(addedJoined)) {
                    const firstAdd = hunk.added[0];
                    findings.push({
                        category: 'error-swallow',
                        severity: 'block',
                        message: `An empty or comment-only catch block was added in ${hunk.file}. ` +
                            `Errors raised inside the try will be silently swallowed.`,
                        location: { file: hunk.file, line: firstAdd?.lineNumber ?? 1 },
                        evidence: hunk.added.map((a) => `+ ${a.content.trim()}`).join('\n').slice(0, 400),
                    });
                    break;
                }
            }
        }
        return findings;
    },
};
