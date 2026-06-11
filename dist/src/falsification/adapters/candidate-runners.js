"use strict";
// Apply-and-verify drivers for the two obligation surfaces. Both run
// through `applyCandidate` for the write/rollback ceremony and differ
// only in the verifier they invoke:
//   - AST runner: `verifyObligation` against the same checker the
//     producer pipeline uses; candidates may overwrite existing files.
//   - Shell runner: predicate exit drives the verdict; candidates
//     must add NEW files only (existing-path collisions throw).
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAstCandidate = runAstCandidate;
exports.runShellCandidate = runShellCandidate;
exports.checkAstBaseline = checkAstBaseline;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const run_verifier_1 = require("../../verification/run-verifier");
const predicate_runner_1 = require("../../verification/predicate-runner");
/**
 * Apply `candidate` to `workspaceRoot`, run the AST verifier, then
 * roll back. Overwrites existing files via in-memory snapshot.
 */
function runAstCandidate(candidate, obligation, workspaceRoot, adapterLabel) {
    const rollback = applyCandidate(candidate, workspaceRoot, adapterLabel, 'snapshot');
    const verdict = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot: workspaceRoot });
    rollback();
    if (verdict.satisfied)
        return { falsified: false, counterExample: null };
    return {
        falsified: true,
        counterExample: {
            files: candidate.files.map((f) => ({ relPath: f.relPath, bytes: f.bytes })),
            reproducer: `node -e "const {verifyObligation}=require('./dist/src/verification/run-verifier');` +
                `console.log(JSON.stringify(verifyObligation(${JSON.stringify(obligation)},` +
                `{repoRoot:process.cwd()})))"`,
            reproducerOutput: verdict.detail,
            reproducerExitCode: 1,
        },
    };
}
/**
 * Apply `candidate` to `workspaceRoot`, run `predicate`, then remove
 * the candidate's files. Existing-path collisions throw.
 */
function runShellCandidate(candidate, predicate, workspaceRoot, adapterLabel) {
    const rollback = applyCandidate(candidate, workspaceRoot, adapterLabel, 'reject');
    const exec = (0, predicate_runner_1.runPredicate)(predicate, workspaceRoot);
    rollback();
    const falsified = exec.exitCode !== 0;
    const counterExample = falsified
        ? {
            files: candidate.files.map((f) => ({ relPath: f.relPath, bytes: f.bytes })),
            reproducer: predicate,
            reproducerOutput: exec.output,
            reproducerExitCode: exec.exitCode,
        }
        : null;
    return { falsified, counterExample, output: exec.output, exitCode: exec.exitCode };
}
/**
 * Run the AST verifier against the unmodified workspace. The
 * obligation must be satisfied before any candidate is applied, else
 * every candidate trivially "falsifies" and the cost is wasted.
 */
function checkAstBaseline(obligation, workspaceRoot) {
    const verdict = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot: workspaceRoot });
    return { ok: verdict.satisfied, detail: verdict.detail };
}
// Existing-file policy: 'snapshot' captures original bytes for restore;
// 'reject' throws on collision.
function applyCandidate(candidate, workspaceRoot, adapterLabel, onExisting) {
    const snapshots = [];
    const dirsCreated = [];
    for (const f of candidate.files) {
        const abs = path.resolve(workspaceRoot, f.relPath);
        if (!abs.startsWith(workspaceRoot + path.sep) && abs !== workspaceRoot) {
            throw new Error(`${adapterLabel} candidate "${candidate.name}" file "${f.relPath}" resolved outside the workspace root.`);
        }
        const exists = fs.existsSync(abs);
        if (exists && onExisting === 'reject') {
            throw new Error(`${adapterLabel} candidate "${candidate.name}" file "${f.relPath}" already exists at ${abs}. ` +
                `The prompt forbids touching existing files.`);
        }
        let current = path.dirname(abs);
        while (current !== workspaceRoot && current !== path.dirname(current)) {
            if (fs.existsSync(current))
                break;
            dirsCreated.unshift(current);
            current = path.dirname(current);
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        const original = exists ? fs.readFileSync(abs) : null;
        fs.writeFileSync(abs, f.bytes, 'utf8');
        snapshots.push({ absPath: abs, original });
    }
    return () => {
        for (const s of snapshots.slice().reverse()) {
            if (s.original === null)
                fs.rmSync(s.absPath, { force: true });
            else
                fs.writeFileSync(s.absPath, s.original);
        }
        for (const dir of dirsCreated.slice().reverse()) {
            if (dir === workspaceRoot)
                continue;
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
                continue;
            if (fs.readdirSync(dir).length === 0)
                fs.rmdirSync(dir);
        }
    };
}
