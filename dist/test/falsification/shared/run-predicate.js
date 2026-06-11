"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPredicate = runPredicate;
const child_process_1 = require("child_process");
/**
 * Shared `runPredicate` helper used by the per-phase fixture-contamination
 * tests and the confirmed-yields regression test. Three identical copies
 * existed at one point; the duplicate-blocks quality gate flagged them
 * during the audit-and-corrections sweep (DECISIONS.md 2026-05-09) and
 * the helper was extracted into this file.
 *
 * Returns the exit code and combined stdout+stderr; never throws on a
 * non-zero exit (the obligations being tested deliberately exercise both
 * branches of the predicate).
 */
function runPredicate(predicate, cwd) {
    try {
        const stdout = (0, child_process_1.execSync)(predicate, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { exitCode: 0, output: stdout };
    }
    catch (cause) {
        const err = cause;
        const status = typeof err.status === 'number' ? err.status : 1;
        const stdout = typeof err.stdout === 'string' ? err.stdout : '';
        const stderr = typeof err.stderr === 'string' ? err.stderr : '';
        return { exitCode: status, output: `${stdout}${stderr}` };
    }
}
