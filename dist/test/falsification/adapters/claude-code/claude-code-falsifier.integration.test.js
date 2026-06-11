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
const claude_code_1 = require("../../../../src/falsification/adapters/profiles/claude-code");
/**
 * Real-CLI integration test for the ClaudeCode falsifier. Runs only
 * when `SWARM_E2E_CLAUDECODE=1` is set; otherwise mocha skips the
 * suite.
 *
 * Per `docs/adapter-integration.md` Phase 4: real subprocess invocation,
 * no SDK shortcut. The test exercises the smallest possible task that
 * demonstrates end-to-end behaviour (prompt → JSON envelope → fenced
 * candidates → AST verifier confirms a falsifying perturbation).
 */
const E2E_FLAG = 'SWARM_E2E_CLAUDECODE';
function claudeAvailable() {
    const result = (0, child_process_1.spawnSync)('claude', ['--version'], { stdio: 'ignore' });
    return result.error === undefined && result.status === 0;
}
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-claudecode-e2e-'));
}
describe('ClaudeCodeFalsifier real-CLI integration', function () {
    this.timeout(300_000);
    before(function () {
        if (process.env[E2E_FLAG] !== '1') {
            this.skip();
            return;
        }
        if (!claudeAvailable()) {
            throw new Error(`${E2E_FLAG}=1 is set but the claude binary is not on PATH. ` +
                `Install it (npm i -g @anthropic-ai/claude-code) or unset ${E2E_FLAG}.`);
        }
    });
    it('produces at least one confirmed counter-example for a trivial no-upward-imports obligation', async () => {
        const workspace = makeWorkspace();
        try {
            const scope = path.join(workspace, 'lib');
            fs.mkdirSync(scope, { recursive: true });
            fs.writeFileSync(path.join(scope, 'a.ts'), 'export const a = 1;\n', 'utf8');
            fs.writeFileSync(path.join(workspace, 'sibling.ts'), 'export const sibling = 2;\n', 'utf8');
            const adapter = new cli_falsifier_1.CliFalsifier(claude_code_1.claudeCodeProfile, { maxBudgetUsd: 1.0 });
            const input = {
                patchSha: '0'.repeat(40),
                obligation: {
                    type: 'import-graph-must-satisfy',
                    constraint: 'no-upward-imports',
                    scope: 'lib',
                },
                contextRefs: [],
                timeBudgetMs: 240_000,
                workspaceRoot: workspace,
            };
            const outcome = await adapter.falsify(input);
            assert_1.strict.equal(outcome.cost.adapterName, 'claude-code');
            assert_1.strict.ok(outcome.cost.wallClockMs > 0);
            switch (outcome.result.kind) {
                case 'counter-example-input':
                    assert_1.strict.ok(outcome.result.inputs.length > 0);
                    for (const example of outcome.result.inputs) {
                        assert_1.strict.ok(example.reproducerExitCode !== 0);
                        assert_1.strict.ok(example.files.length > 0);
                    }
                    assert_1.strict.ok(outcome.cost.counterExamplesFound > 0);
                    break;
                case 'no-falsification-found':
                    assert_1.strict.fail(`ClaudeCode returned no-falsification-found (reason=${outcome.result.reason}, ` +
                        `attempts=${outcome.result.attempts}) on the trivial no-upward-imports obligation.`);
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
