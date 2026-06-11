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
const adapters_1 = require("../../../src/falsification/adapters");
const codex_1 = require("../../../src/falsification/adapters/profiles/codex");
/**
 * Phase 0 deliverable, satisfied by Phase 1: a real integration test
 * that asserts an adapter implementation conforms to the
 * `FalsifierAdapter` contract. The test exercises a `CodexFalsifier`
 * with a fake invocation that returns a syntactically valid Codex
 * response — this verifies the adapter's *parsing/dispatch/result*
 * contract end-to-end without spawning the real binary. The actual CLI
 * is exercised in
 * `test/falsification/adapters/codex/codex-falsifier.integration.test.ts`
 * (env-gated).
 */
function isKebabCase(name) {
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-adapter-conformance-'));
}
function smokeInput(workspaceRoot) {
    return {
        patchSha: '0000000000000000000000000000000000000000',
        obligation: {
            type: 'property-must-hold',
            predicate: '! grep -r "FORBIDDEN_TOKEN_CONFORMANCE" . 2>/dev/null',
            target: 'no FORBIDDEN_TOKEN_CONFORMANCE in workspace',
        },
        contextRefs: [],
        timeBudgetMs: 5_000,
        workspaceRoot,
    };
}
function assertResultShapeIsValid(result) {
    switch (result.kind) {
        case 'counter-example-input':
            assert_1.strict.equal(typeof result.obligationType, 'string');
            assert_1.strict.ok(Array.isArray(result.inputs));
            for (const input of result.inputs) {
                assert_1.strict.equal(typeof input.reproducer, 'string');
                assert_1.strict.equal(typeof input.reproducerOutput, 'string');
                assert_1.strict.equal(typeof input.reproducerExitCode, 'number');
                assert_1.strict.ok(Array.isArray(input.files));
                for (const file of input.files) {
                    assert_1.strict.equal(typeof file.relPath, 'string');
                    assert_1.strict.equal(typeof file.bytes, 'string');
                }
            }
            return;
        case 'regression-fixture':
            assert_1.strict.equal(typeof result.fixturePath, 'string');
            assert_1.strict.equal(typeof result.notes, 'string');
            return;
        case 'property-violation-trace':
            assert_1.strict.ok(Array.isArray(result.steps));
            assert_1.strict.equal(typeof result.reproducer, 'string');
            return;
        case 'no-falsification-found':
            assert_1.strict.ok([
                'time-budget-exhausted',
                'no-counter-example-discovered',
                'strategy-not-applicable',
                'baseline-predicate-failed',
            ].includes(result.reason), `unknown no-falsification-found reason: ${result.reason}`);
            assert_1.strict.equal(typeof result.attempts, 'number');
            return;
        default: {
            const exhaustive = result;
            throw new Error(`unhandled FalsificationResult variant: ${JSON.stringify(exhaustive)}`);
        }
    }
}
async function runConformance(adapter) {
    assert_1.strict.ok(isKebabCase(adapter.name), `adapter name "${adapter.name}" must be kebab-case`);
    assert_1.strict.ok(Array.isArray(adapter.handles) && adapter.handles.length > 0, `adapter "${adapter.name}" must declare at least one handled obligation type`);
    const workspace = makeWorkspace();
    try {
        const outcome = await adapter.falsify(smokeInput(workspace));
        assert_1.strict.equal(outcome.cost.adapterName, adapter.name);
        assert_1.strict.equal(typeof outcome.cost.wallClockMs, 'number');
        assert_1.strict.ok(outcome.cost.wallClockMs >= 0);
        assert_1.strict.ok(outcome.cost.dollarsSpent >= 0);
        assert_1.strict.ok(outcome.cost.counterExamplesFound >= 0);
        assert_1.strict.ok(outcome.cost.falsePositives >= 0);
        assertResultShapeIsValid(outcome.result);
    }
    finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
}
function fakeCodexResponse() {
    const candidates = Array.from({ length: codex_1.CODEX_CANDIDATE_COUNT }, (_, i) => ({
        name: `c-${i}`,
        rationale: 'introduces the forbidden token in a fresh file',
        files: [{ relPath: `c-${i}/leak.txt`, bytes: 'FORBIDDEN_TOKEN_CONFORMANCE' }],
    }));
    return [
        'narration line that the parser must ignore',
        '```json',
        JSON.stringify({ candidates }),
        '```',
        'tokens used: input=120 output=80 total=200',
    ].join('\n');
}
describe('FalsifierAdapter contract conformance', () => {
    it('exposes the codex adapter through defaultAdapterRegistry()', () => {
        const registry = (0, adapters_1.defaultAdapterRegistry)();
        const codex = registry.get('codex');
        assert_1.strict.ok(codex !== undefined, 'expected a "codex" adapter registered');
        assert_1.strict.ok(codex.handles.includes('property-must-hold'));
    });
    it('CodexFalsifier conforms to the contract under a real invocation override', async () => {
        const adapter = new adapters_1.CliFalsifier(codex_1.codexProfile, {
            invocationOverride: async () => ({
                stdout: fakeCodexResponse(),
                stderr: '',
                exitCode: 0,
                wallClockMs: 50,
            }),
        });
        await runConformance(adapter);
    });
    it('produces a counter-example-input result for the smoke obligation', async () => {
        const adapter = new adapters_1.CliFalsifier(codex_1.codexProfile, {
            invocationOverride: async () => ({
                stdout: fakeCodexResponse(),
                stderr: '',
                exitCode: 0,
                wallClockMs: 50,
            }),
        });
        const workspace = makeWorkspace();
        try {
            const outcome = await adapter.falsify(smokeInput(workspace));
            assert_1.strict.equal(outcome.result.kind, 'counter-example-input');
            if (outcome.result.kind === 'counter-example-input') {
                assert_1.strict.ok(outcome.result.inputs.length > 0);
            }
            assert_1.strict.ok(outcome.cost.counterExamplesFound > 0);
            assert_1.strict.ok(outcome.cost.dollarsSpent > 0, 'token usage should produce non-zero dollars');
        }
        finally {
            fs.rmSync(workspace, { recursive: true, force: true });
        }
    });
    it('returns no-falsification-found when none of the candidates actually falsify', async () => {
        const safeCandidatesJson = JSON.stringify({
            candidates: Array.from({ length: codex_1.CODEX_CANDIDATE_COUNT }, (_, i) => ({
                name: `safe-${i}`,
                rationale: 'does not contain the token, so the predicate stays satisfied',
                files: [{ relPath: `safe-${i}/note.txt`, bytes: 'nothing-forbidden-here' }],
            })),
        });
        const adapter = new adapters_1.CliFalsifier(codex_1.codexProfile, {
            invocationOverride: async () => ({
                stdout: ['```json', safeCandidatesJson, '```'].join('\n'),
                stderr: '',
                exitCode: 0,
                wallClockMs: 30,
            }),
        });
        const workspace = makeWorkspace();
        try {
            const outcome = await adapter.falsify(smokeInput(workspace));
            assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            assert_1.strict.equal(outcome.cost.counterExamplesFound, 0);
            assert_1.strict.equal(outcome.cost.falsePositives, codex_1.CODEX_CANDIDATE_COUNT);
        }
        finally {
            fs.rmSync(workspace, { recursive: true, force: true });
        }
    });
});
