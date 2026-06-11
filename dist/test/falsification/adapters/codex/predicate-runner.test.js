"use strict";
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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const candidate_runners_1 = require("../../../../src/falsification/adapters/candidate-runners");
const predicate_runner_1 = require("../../../../src/verification/predicate-runner");
function runCandidateAgainstPredicate(c, p, w) {
    return (0, candidate_runners_1.runShellCandidate)(c, p, w, 'Codex');
}
/**
 * Unit tests for the predicate runner. These exercise the real
 * filesystem and the real shell predicate execution path; the only
 * fixture is a fresh temp workspace per test so each candidate runs in
 * isolation.
 */
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-predicate-runner-'));
}
function candidate(relPath, bytes) {
    return {
        name: 'unit-candidate',
        rationale: 'unit test',
        files: [{ relPath, bytes }],
    };
}
describe('runCandidateAgainstPredicate', () => {
    it('reports falsified when the candidate makes the predicate fail', () => {
        const ws = makeWorkspace();
        try {
            // predicate: assert no file under leak/ contains "FORBIDDEN".
            // candidate writes such a file → predicate exits non-zero → falsified.
            const predicate = '! grep -r "FORBIDDEN" leak 2>/dev/null';
            const result = runCandidateAgainstPredicate(candidate('leak/contraband.txt', 'this contains FORBIDDEN'), predicate, ws);
            assert_1.strict.equal(result.falsified, true);
            assert_1.strict.notEqual(result.exitCode, 0);
            assert_1.strict.ok(result.counterExample);
            assert_1.strict.equal(result.counterExample.files[0].relPath, 'leak/contraband.txt');
            assert_1.strict.equal(result.counterExample.reproducer, predicate);
            // file should be cleaned up after running
            assert_1.strict.equal(fs.existsSync(path.join(ws, 'leak/contraband.txt')), false);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('reports false positive when the candidate does not falsify', () => {
        const ws = makeWorkspace();
        try {
            // predicate stays satisfied — file content lacks the forbidden token.
            const predicate = '! grep -r "FORBIDDEN" allowed 2>/dev/null';
            const result = runCandidateAgainstPredicate(candidate('allowed/safe.txt', 'no token here'), predicate, ws);
            assert_1.strict.equal(result.falsified, false);
            assert_1.strict.equal(result.exitCode, 0);
            assert_1.strict.equal(result.counterExample, null);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('rejects a candidate that names an existing path', () => {
        const ws = makeWorkspace();
        try {
            fs.writeFileSync(path.join(ws, 'pre-existing.txt'), 'do not overwrite me', 'utf8');
            assert_1.strict.throws(() => runCandidateAgainstPredicate(candidate('pre-existing.txt', 'overwriting attempt'), 'true', ws), /already exists/);
            assert_1.strict.equal(fs.readFileSync(path.join(ws, 'pre-existing.txt'), 'utf8'), 'do not overwrite me');
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('rejects paths that resolve outside the workspace root', () => {
        const ws = makeWorkspace();
        try {
            // The output parser blocks "..", but the runner has its own boundary
            // check as defense-in-depth; this asserts the boundary check fires
            // when fed a path that resolves outside ws.
            const escape = {
                name: 'escape',
                rationale: 'attempts to write outside workspace',
                files: [{ relPath: '/tmp/swarm-escape-target', bytes: 'no' }],
            };
            assert_1.strict.throws(() => runCandidateAgainstPredicate(escape, 'true', ws), /outside the workspace root|already exists/);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('preserves the baseline contract: predicate must pass against an unmodified workspace', () => {
        const ws = makeWorkspace();
        try {
            // Empty workspace + "no FORBIDDEN here" predicate → exit 0 → baseline ok.
            const okBaseline = (0, predicate_runner_1.checkPredicateBaseline)('! grep -r "FORBIDDEN" . 2>/dev/null', ws);
            assert_1.strict.equal(okBaseline.ok, true);
            assert_1.strict.equal(okBaseline.exitCode, 0);
            // Plant the forbidden token; baseline must now report not-ok so callers
            // can short-circuit before invoking the codex CLI.
            fs.writeFileSync(path.join(ws, 'tainted.txt'), 'FORBIDDEN', 'utf8');
            const taintedBaseline = (0, predicate_runner_1.checkPredicateBaseline)('! grep -r "FORBIDDEN" . 2>/dev/null', ws);
            assert_1.strict.equal(taintedBaseline.ok, false);
            assert_1.strict.notEqual(taintedBaseline.exitCode, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('removes empty directories the candidate created', () => {
        const ws = makeWorkspace();
        try {
            const result = runCandidateAgainstPredicate(candidate('nested/dir/payload.txt', 'content'), 'true', ws);
            assert_1.strict.equal(result.falsified, false);
            assert_1.strict.equal(fs.existsSync(path.join(ws, 'nested/dir/payload.txt')), false);
            assert_1.strict.equal(fs.existsSync(path.join(ws, 'nested/dir')), false);
            assert_1.strict.equal(fs.existsSync(path.join(ws, 'nested')), false);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
});
