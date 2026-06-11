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
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const cli_falsifier_1 = require("../../../../src/falsification/adapters/cli-falsifier");
const codex_1 = require("../../../../src/falsification/adapters/profiles/codex");
/**
 * Real-CLI integration test for the Codex falsifier. Exercises the full
 * adapter against an installed `codex` binary plus valid OpenAI
 * credentials in the environment. Runs only when `SWARM_E2E_CODEX=1` is
 * set; otherwise mocha skips the suite, which keeps CI green when the
 * binary is absent.
 *
 * Per `docs/adapter-integration.md` Phase 1: "If the binary is not
 * present in CI, gate the test on an env var, but the test must run and
 * pass against a real Codex install locally."
 */
const E2E_FLAG = 'SWARM_E2E_CODEX';
function codexAvailable() {
    const result = (0, child_process_1.spawnSync)('codex', ['--version'], { stdio: 'ignore' });
    return result.error === undefined && result.status === 0;
}
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-codex-e2e-'));
}
describe('CodexFalsifier real-CLI integration', function () {
    this.timeout(180_000);
    before(function () {
        if (process.env[E2E_FLAG] !== '1') {
            this.skip();
            return;
        }
        if (!codexAvailable()) {
            throw new Error(`${E2E_FLAG}=1 is set but the codex binary is not on PATH. ` +
                `Install it (npm i -g @openai/codex) or unset ${E2E_FLAG}.`);
        }
    });
    it('produces at least one confirmed counter-example for a trivial property', async () => {
        const workspace = makeWorkspace();
        try {
            const adapter = new cli_falsifier_1.CliFalsifier(codex_1.codexProfile);
            const input = {
                patchSha: '0000000000000000000000000000000000000000',
                obligation: {
                    type: 'property-must-hold',
                    predicate: '! grep -r "FORBIDDEN_TOKEN_XYZ_12345" . 2>/dev/null',
                    target: 'no occurrences of FORBIDDEN_TOKEN_XYZ_12345 in workspace',
                },
                contextRefs: [],
                timeBudgetMs: 150_000,
                workspaceRoot: workspace,
            };
            const outcome = await adapter.falsify(input);
            assert_1.strict.equal(outcome.cost.adapterName, 'codex');
            assert_1.strict.ok(outcome.cost.wallClockMs > 0);
            assert_1.strict.ok(outcome.cost.dollarsSpent >= 0);
            switch (outcome.result.kind) {
                case 'counter-example-input':
                    assert_1.strict.ok(outcome.result.inputs.length > 0, 'expected at least one confirmed counter-example for the trivial token-grep property');
                    for (const example of outcome.result.inputs) {
                        assert_1.strict.ok(example.reproducerExitCode !== 0);
                        assert_1.strict.ok(example.files.length > 0);
                    }
                    assert_1.strict.ok(outcome.cost.counterExamplesFound > 0);
                    break;
                case 'no-falsification-found':
                    // For this property the strategy should always produce a hit.
                    // Treat zero as a real failure so the dev gate sees it.
                    assert_1.strict.fail(`Codex returned no-falsification-found (reason=${outcome.result.reason}, ` +
                        `attempts=${outcome.result.attempts}) on the trivial token-grep property. ` +
                        `This is a Phase 1 dev-gate failure: investigate the prompt or model.`);
                    break;
                default:
                    assert_1.strict.fail(`unexpected result kind: ${outcome.result.kind}`);
            }
        }
        finally {
            fs.rmSync(workspace, { recursive: true, force: true });
        }
    });
});
