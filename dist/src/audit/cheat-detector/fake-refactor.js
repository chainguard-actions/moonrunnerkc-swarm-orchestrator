"use strict";
// Fake refactor: a function or class is renamed in one file but a
// caller (in another file in the same PR or anywhere in the repo) still
// imports or invokes the old name. We approximate by scanning added
// `export function` / `export class` / `export const` declarations
// against deleted ones of the same kind in the same file: a deletion
// of `export function foo` paired with an addition of `export function bar`
// inside the same hunk *and no deletion of `foo(` or `import { foo }`
// elsewhere in the diff* is a probable rename-without-callers.
Object.defineProperty(exports, "__esModule", { value: true });
exports.fakeRefactorDetector = void 0;
const diff_walker_1 = require("./diff-walker");
const VERSION = '1.0.0';
const RENAME_RE = /^export\s+(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
exports.fakeRefactorDetector = {
    name: 'fake-refactor',
    version: VERSION,
    run(ctx) {
        const findings = [];
        const hunks = (0, diff_walker_1.walkHunks)(ctx.files);
        const allDeletedLines = [];
        for (const h of hunks)
            for (const d of h.deleted)
                allDeletedLines.push(d.content);
        for (const hunk of hunks) {
            if ((0, diff_walker_1.isTestFile)(hunk.file))
                continue;
            for (const del of hunk.deleted) {
                const oldName = del.content.match(RENAME_RE)?.[1];
                if (oldName === undefined)
                    continue;
                for (const add of hunk.added) {
                    const newName = add.content.match(RENAME_RE)?.[1];
                    if (newName === undefined || newName === oldName)
                        continue;
                    // Caller update = any line in another file in the diff
                    // mentions oldName (so the import or call was rewritten).
                    const callerUpdated = hunks
                        .filter((h) => h.file !== hunk.file)
                        .some((h) => [...h.added, ...h.deleted].some((line) => line.content.includes(oldName)));
                    if (callerUpdated)
                        continue;
                    findings.push({
                        category: 'fake-refactor',
                        severity: 'block',
                        message: `Function "${oldName}" was renamed to "${newName}" in ${hunk.file} but no caller ` +
                            `import or invocation was updated in this PR.`,
                        location: { file: hunk.file, line: add.lineNumber },
                        evidence: `- ${del.content.trim()}\n+ ${add.content.trim()}`,
                    });
                }
            }
        }
        void allDeletedLines;
        return findings;
    },
};
