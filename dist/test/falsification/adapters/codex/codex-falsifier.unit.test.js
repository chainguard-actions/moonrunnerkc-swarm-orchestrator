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
const cli_falsifier_1 = require("../../../../src/falsification/adapters/cli-falsifier");
const codex_1 = require("../../../../src/falsification/adapters/profiles/codex");
/**
 * Unit tests for `CodexFalsifier` paths that do not require the real
 * codex binary. Spawning is replaced with `invocationOverride` and auth
 * detection with `authMethodOverride`. The integration test
 * (`codex-falsifier.integration.test.ts`) covers the real-CLI path.
 */
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-codex-falsifier-unit-'));
}
function makeCandidateStdout(usageLine) {
    // Codex prompt mandates exactly CODEX_CANDIDATE_COUNT=3 candidates; the
    // output parser rejects anything else.
    const candidates = Array.from({ length: 3 }, (_, i) => ({
        name: `c-${i}`,
        rationale: 'introduces forbidden token',
        files: [{ relPath: `c-${i}/leak.txt`, bytes: 'FORBIDDEN_TOKEN_UNIT' }],
    }));
    return [
        '```json',
        JSON.stringify({ candidates }),
        '```',
        usageLine,
    ].join('\n');
}
function smokeInput(workspaceRoot) {
    return {
        patchSha: '0000000000000000000000000000000000000000',
        obligation: {
            type: 'property-must-hold',
            predicate: '! grep -r "FORBIDDEN_TOKEN_UNIT" . 2>/dev/null',
            target: 'no FORBIDDEN_TOKEN_UNIT in workspace',
        },
        contextRefs: [],
        timeBudgetMs: 5_000,
        workspaceRoot,
    };
}
describe('CodexFalsifier unit paths', () => {
    it('preserves full stderr on Error.cause when codex exits non-zero', async () => {
        const stderr4kb = 'X'.repeat(4096);
        const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile, {
            authMethodOverride: () => 'api',
            invocationOverride: async () => ({
                stdout: '',
                stderr: stderr4kb,
                exitCode: 7,
                wallClockMs: 10,
            }),
        });
        const ws = makeWorkspace();
        try {
            await adapter.falsify(smokeInput(ws));
            assert_1.strict.fail('expected falsify() to throw');
        }
        catch (err) {
            assert_1.strict.ok(err instanceof Error);
            assert_1.strict.match(err.message, /codex exec failed with exit code 7/);
            assert_1.strict.match(err.message, /…\[truncated\]/);
            const cause = err.cause;
            assert_1.strict.ok(cause !== undefined, 'expected Error.cause to be populated');
            assert_1.strict.equal(cause.exitCode, 7);
            assert_1.strict.equal(cause.stderr.length, 4096);
            assert_1.strict.equal(cause.stderr, stderr4kb);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('returns baseline-predicate-failed without invoking codex when workspace is pre-tainted', async () => {
        let codexCalled = false;
        const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile, {
            authMethodOverride: () => 'api',
            invocationOverride: async () => {
                codexCalled = true;
                return { stdout: '', stderr: '', exitCode: 0, wallClockMs: 0 };
            },
        });
        const ws = makeWorkspace();
        try {
            // Plant the forbidden token so the baseline predicate fails.
            fs.writeFileSync(path.join(ws, 'tainted.txt'), 'FORBIDDEN_TOKEN_UNIT', 'utf8');
            const outcome = await adapter.falsify(smokeInput(ws));
            assert_1.strict.equal(codexCalled, false, 'codex must not be invoked when baseline fails');
            assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            if (outcome.result.kind === 'no-falsification-found') {
                assert_1.strict.equal(outcome.result.reason, 'baseline-predicate-failed');
                assert_1.strict.equal(outcome.result.attempts, 0);
            }
            assert_1.strict.equal(outcome.cost.dollarsBilled, 0);
            assert_1.strict.equal(outcome.cost.dollarsTokenEstimate, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('reports dollarsBilled=0 under chatgpt auth but populates dollarsTokenEstimate', async () => {
        const fakeStdout = makeCandidateStdout('tokens used: input=1000 output=2000 total=3000');
        const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout: fakeStdout,
                stderr: 'model: o4-mini',
                exitCode: 0,
                wallClockMs: 50,
            }),
        });
        const ws = makeWorkspace();
        try {
            const outcome = await adapter.falsify(smokeInput(ws));
            assert_1.strict.equal(outcome.cost.authMethod, 'chatgpt');
            assert_1.strict.equal(outcome.cost.dollarsBilled, 0, 'flat-rate auth must not charge per-token');
            assert_1.strict.ok(outcome.cost.dollarsTokenEstimate > 0, 'token estimate should still be computed');
            // Backward-compat alias.
            assert_1.strict.equal(outcome.cost.dollarsSpent, outcome.cost.dollarsTokenEstimate);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('reports dollarsBilled === dollarsTokenEstimate under api auth', async () => {
        const fakeStdout = makeCandidateStdout('tokens used: input=500 output=1500 total=2000');
        const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile, {
            authMethodOverride: () => 'api',
            invocationOverride: async () => ({
                stdout: fakeStdout,
                stderr: 'model: o4-mini',
                exitCode: 0,
                wallClockMs: 50,
            }),
        });
        const ws = makeWorkspace();
        try {
            const outcome = await adapter.falsify(smokeInput(ws));
            assert_1.strict.equal(outcome.cost.authMethod, 'api');
            assert_1.strict.ok(outcome.cost.dollarsBilled > 0);
            assert_1.strict.equal(outcome.cost.dollarsBilled, outcome.cost.dollarsTokenEstimate);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
});
