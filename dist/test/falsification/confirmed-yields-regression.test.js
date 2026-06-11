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
const cli_falsifier_1 = require("../../src/falsification/adapters/cli-falsifier");
const codex_1 = require("../../src/falsification/adapters/profiles/codex");
const run_predicate_1 = require("./shared/run-predicate");
/**
 * Regression fixtures captured from the strongest confirmed real failures
 * found in run-1 of the Phase 1 dev gate
 * (`evidence/phase1-dev-gate/run-1/`). One per stratum: A1.1 (real
 * `eval(source)` call), B1.1 (literal `.env` at repo root), C3.1 (real
 * `<script>` tag in HTML under `templates/`). Each test reproduces the
 * property violation against the dev-gate fixture, asserts the predicate
 * fires (exit non-zero), and asserts `CodexFalsifier` classifies it as a
 * counter-example with `falsePositives = 0`.
 *
 * `CodexFalsifier` is exercised through `invocationOverride` so the test
 * does not require the real codex binary. The candidate's `bytes` payload
 * mirrors the file content recorded in `inspection.md`.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'evidence', 'fixtures', 'phase-1-gate');
const REGRESSION_FIXTURES = [
    {
        id: 'A1.1',
        stratum: 'A',
        target: 'no eval() in src/falsification',
        predicate: "! grep -rn 'eval(' src/falsification --include='*.ts'",
        files: [
            {
                relPath: 'src/falsification/adversarial/direct-eval-call.ts',
                bytes: 'export function run(source: string): unknown {\n  return eval(source);\n}\n',
            },
        ],
        source: 'evidence/phase1-dev-gate/run-1/inspection.md §A1.1',
    },
    {
        id: 'B1.1',
        stratum: 'B',
        target: 'no .env file at repo root',
        predicate: "! find . -maxdepth 1 -name '.env' -type f 2>/dev/null | grep -q .",
        files: [
            {
                relPath: '.env',
                bytes: 'APP_ENV=test\n',
            },
        ],
        source: 'evidence/phase1-dev-gate/run-1/inspection.md §B1.1',
    },
    {
        id: 'C3.1',
        stratum: 'C',
        target: 'no <script> tag in templates/',
        predicate: "! grep -rln '<script>' templates/ 2>/dev/null | grep -q .",
        files: [
            {
                relPath: 'templates/adversarial-literal/index.html',
                bytes: "<!doctype html>\n<html><body><script>alert('x')</script></body></html>\n",
            },
        ],
        source: 'evidence/phase1-dev-gate/run-1/inspection.md §C3.1',
    },
];
function makeWorkspaceFromFixture() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-confirmed-yields-'));
    const ws = path.join(tmp, 'workspace');
    fs.cpSync(FIXTURE_ROOT, ws, { recursive: true });
    return ws;
}
function applyCandidateFiles(ws, files) {
    const written = [];
    for (const f of files) {
        const abs = path.resolve(ws, f.relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.bytes, 'utf8');
        written.push(abs);
    }
    return written;
}
function fakeCodexStdoutFor(candidate) {
    // Codex's prompt mandates exactly 3 candidates; the parser rejects anything
    // else (see codex-output-parser.ts). The first candidate replays this
    // regression's payload; the remaining two are inert files that do not flip
    // the predicate, so the falsifier records 1 confirmed and 2 false-positives.
    const repro = {
        name: `regression-${candidate.id}`,
        rationale: `replays ${candidate.id} from ${candidate.source}`,
        files: candidate.files.map((f) => ({ relPath: f.relPath, bytes: f.bytes })),
    };
    const inert1 = {
        name: `inert-${candidate.id}-a`,
        rationale: 'inert payload to satisfy CODEX_CANDIDATE_COUNT=3',
        files: [{ relPath: `regression-test/inert-a.txt`, bytes: 'inert\n' }],
    };
    const inert2 = {
        name: `inert-${candidate.id}-b`,
        rationale: 'inert payload to satisfy CODEX_CANDIDATE_COUNT=3',
        files: [{ relPath: `regression-test/inert-b.txt`, bytes: 'inert\n' }],
    };
    return [
        '```json',
        JSON.stringify({ candidates: [repro, inert1, inert2] }),
        '```',
        'tokens used: input=100 output=100 total=200',
    ].join('\n');
}
describe('Phase 1 confirmed-yields regression fixtures', () => {
    for (const candidate of REGRESSION_FIXTURES) {
        describe(`${candidate.id} (stratum ${candidate.stratum}) — ${candidate.target}`, () => {
            it('predicate exits 0 against the bare fixture (sanity)', () => {
                const ws = makeWorkspaceFromFixture();
                try {
                    const r = (0, run_predicate_1.runPredicate)(candidate.predicate, ws);
                    assert_1.strict.equal(r.exitCode, 0, `bare fixture must satisfy the predicate before applying the candidate. ` +
                        `Got exit=${r.exitCode} output=${r.output.slice(0, 200)}`);
                }
                finally {
                    fs.rmSync(path.dirname(ws), { recursive: true, force: true });
                }
            });
            it('reproduces the property violation: predicate fires after applying the candidate', () => {
                const ws = makeWorkspaceFromFixture();
                try {
                    applyCandidateFiles(ws, candidate.files);
                    const r = (0, run_predicate_1.runPredicate)(candidate.predicate, ws);
                    assert_1.strict.notEqual(r.exitCode, 0, `applying ${candidate.id} should flip the predicate. Got exit=${r.exitCode}`);
                }
                finally {
                    fs.rmSync(path.dirname(ws), { recursive: true, force: true });
                }
            });
            it('CodexFalsifier classifies the candidate as a confirmed counter-example', async () => {
                const ws = makeWorkspaceFromFixture();
                try {
                    const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile, {
                        authMethodOverride: () => 'api',
                        invocationOverride: async () => ({
                            stdout: fakeCodexStdoutFor(candidate),
                            stderr: 'model: o4-mini',
                            exitCode: 0,
                            wallClockMs: 10,
                        }),
                    });
                    const obligation = {
                        type: 'property-must-hold',
                        predicate: candidate.predicate,
                        target: candidate.target,
                    };
                    const input = {
                        patchSha: '0000000000000000000000000000000000000000',
                        obligation,
                        contextRefs: [],
                        timeBudgetMs: 30_000,
                        workspaceRoot: ws,
                    };
                    const outcome = await adapter.falsify(input);
                    assert_1.strict.equal(outcome.result.kind, 'counter-example-input', `expected counter-example-input, got ${outcome.result.kind}`);
                    if (outcome.result.kind === 'counter-example-input') {
                        assert_1.strict.equal(outcome.result.inputs.length, 1, 'expected exactly 1 confirmed yield');
                        const confirmed = outcome.result.inputs[0];
                        assert_1.strict.equal(confirmed.reproducerExitCode !== 0, true);
                        assert_1.strict.equal(confirmed.reproducer, candidate.predicate);
                        const relPaths = confirmed.files.map((f) => f.relPath).sort();
                        const expectedPaths = candidate.files.map((f) => f.relPath).sort();
                        assert_1.strict.deepEqual(relPaths, expectedPaths);
                    }
                    // The two inert candidates are recorded as false positives, not
                    // dropped silently.
                    assert_1.strict.equal(outcome.cost.counterExamplesFound, 1);
                    assert_1.strict.equal(outcome.cost.falsePositives, 2);
                }
                finally {
                    fs.rmSync(path.dirname(ws), { recursive: true, force: true });
                }
            });
        });
    }
});
