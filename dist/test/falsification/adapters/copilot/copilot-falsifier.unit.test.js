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
const copilot_1 = require("../../../../src/falsification/adapters/profiles/copilot");
/**
 * Unit tests for CopilotFalsifier paths that do not require the real
 * copilot binary. Spawning is replaced with `invocationOverride` and auth
 * detection with `authMethodOverride`. The integration test
 * (`copilot-falsifier.integration.test.ts`) covers the real-CLI path.
 */
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-copilot-falsifier-unit-'));
}
function fenceCandidates(candidates) {
    return ['```json', JSON.stringify({ candidates }), '```'].join('\n');
}
function setupNoUpwardImportsScope(workspaceRoot) {
    const scope = path.join(workspaceRoot, 'lib');
    fs.mkdirSync(scope, { recursive: true });
    fs.writeFileSync(path.join(scope, 'a.ts'), 'export const a = 1;\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'sibling.ts'), 'export const sibling = 2;\n', 'utf8');
}
function noUpwardImportsInput(workspaceRoot) {
    return {
        patchSha: '0'.repeat(40),
        obligation: {
            type: 'import-graph-must-satisfy',
            constraint: 'no-upward-imports',
            scope: 'lib',
        },
        contextRefs: [],
        timeBudgetMs: 5_000,
        workspaceRoot,
    };
}
describe('CopilotFalsifier unit paths', () => {
    it('returns strategy-not-applicable for unsupported obligation types', async () => {
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout: '',
                stderr: '',
                exitCode: 0,
                wallClockMs: 0,
            }),
        });
        const ws = makeWorkspace();
        try {
            const outcome = await adapter.falsify({
                patchSha: '0'.repeat(40),
                obligation: {
                    type: 'property-must-hold',
                    predicate: 'true',
                    target: 'whatever',
                },
                contextRefs: [],
                timeBudgetMs: 1_000,
                workspaceRoot: ws,
            });
            assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            if (outcome.result.kind === 'no-falsification-found') {
                assert_1.strict.equal(outcome.result.reason, 'strategy-not-applicable');
            }
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('returns baseline-predicate-failed when the obligation is already violated', async () => {
        let copilotCalled = false;
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => {
                copilotCalled = true;
                return { stdout: '', stderr: '', exitCode: 0, wallClockMs: 0 };
            },
        });
        const ws = makeWorkspace();
        try {
            // Plant a pre-existing upward-import so the baseline fails.
            const scope = path.join(ws, 'lib');
            fs.mkdirSync(scope, { recursive: true });
            fs.writeFileSync(path.join(scope, 'leak.ts'), 'import { x } from "../sibling";\n', 'utf8');
            fs.writeFileSync(path.join(ws, 'sibling.ts'), 'export const x = 1;\n', 'utf8');
            const outcome = await adapter.falsify(noUpwardImportsInput(ws));
            assert_1.strict.equal(copilotCalled, false, 'copilot must not be invoked when baseline fails');
            assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            if (outcome.result.kind === 'no-falsification-found') {
                assert_1.strict.equal(outcome.result.reason, 'baseline-predicate-failed');
            }
            assert_1.strict.equal(outcome.cost.dollarsBilled, 0);
            assert_1.strict.equal(outcome.cost.dollarsTokenEstimate, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('preserves full stderr on Error.cause when copilot exits non-zero', async () => {
        const stderr4kb = 'X'.repeat(4096);
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout: '',
                stderr: stderr4kb,
                exitCode: 7,
                wallClockMs: 10,
            }),
        });
        const ws = makeWorkspace();
        try {
            setupNoUpwardImportsScope(ws);
            await adapter.falsify(noUpwardImportsInput(ws));
            assert_1.strict.fail('expected falsify() to throw');
        }
        catch (err) {
            assert_1.strict.ok(err instanceof Error);
            assert_1.strict.match(err.message, /copilot exec failed with exit code 7/);
            const cause = err.cause;
            assert_1.strict.ok(cause !== undefined, 'expected Error.cause to be populated');
            assert_1.strict.equal(cause.exitCode, 7);
            assert_1.strict.equal(cause.stderr.length, 4096);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('confirms a falsifying candidate via the AST verifier and reports counter-examples', async () => {
        const candidates = [
            {
                name: 'add-upward',
                rationale: 'introduces an upward import',
                files: [{ relPath: 'lib/cheat.ts', bytes: 'import { sibling } from "../sibling";\n' }],
            },
            {
                name: 'no-op',
                rationale: 'does not actually violate (false positive)',
                files: [{ relPath: 'lib/innocent.ts', bytes: 'export const x = 2;\n' }],
            },
            {
                name: 'add-upward-2',
                rationale: 'second valid violation',
                files: [{ relPath: 'lib/cheat2.ts', bytes: 'import "../sibling";\n' }],
            },
        ];
        const stdout = fenceCandidates(candidates) + '\nRequests 4 Premium (10s)';
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout,
                stderr: '',
                exitCode: 0,
                wallClockMs: 50,
            }),
        });
        const ws = makeWorkspace();
        try {
            setupNoUpwardImportsScope(ws);
            const outcome = await adapter.falsify(noUpwardImportsInput(ws));
            assert_1.strict.equal(outcome.result.kind, 'counter-example-input');
            if (outcome.result.kind === 'counter-example-input') {
                assert_1.strict.equal(outcome.result.inputs.length, 2);
            }
            assert_1.strict.equal(outcome.cost.counterExamplesFound, 2);
            assert_1.strict.equal(outcome.cost.falsePositives, 1);
            // Premium-request → token-estimate cost was populated from the
            // captured stdout.
            assert_1.strict.ok(outcome.cost.dollarsTokenEstimate > 0);
            // Subscription auth: dollarsBilled stays 0.
            assert_1.strict.equal(outcome.cost.dollarsBilled, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('reports no-falsification-found when no candidate falsifies', async () => {
        const candidates = [
            {
                name: 'innocent-1',
                rationale: 'does not violate',
                files: [{ relPath: 'lib/x1.ts', bytes: 'export const x = 1;\n' }],
            },
            {
                name: 'innocent-2',
                rationale: 'does not violate',
                files: [{ relPath: 'lib/x2.ts', bytes: 'export const x = 2;\n' }],
            },
            {
                name: 'innocent-3',
                rationale: 'does not violate',
                files: [{ relPath: 'lib/x3.ts', bytes: 'export const x = 3;\n' }],
            },
        ];
        const stdout = fenceCandidates(candidates) + '\nRequests 1 Premium (5s)';
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout,
                stderr: '',
                exitCode: 0,
                wallClockMs: 25,
            }),
        });
        const ws = makeWorkspace();
        try {
            setupNoUpwardImportsScope(ws);
            const outcome = await adapter.falsify(noUpwardImportsInput(ws));
            assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            if (outcome.result.kind === 'no-falsification-found') {
                assert_1.strict.equal(outcome.result.reason, 'no-counter-example-discovered');
                assert_1.strict.equal(outcome.result.attempts, 3);
            }
            assert_1.strict.equal(outcome.cost.counterExamplesFound, 0);
            assert_1.strict.equal(outcome.cost.falsePositives, 3);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('falsifies a function-must-have-signature obligation by overwriting the file', async () => {
        const candidates = [
            {
                name: 'wrong-return-type',
                rationale: 'changes return type so signature mismatches',
                files: [
                    {
                        relPath: 'src/widget.ts',
                        bytes: 'export function compute(x: number): string {\n  return String(x);\n}\n',
                    },
                ],
            },
            {
                name: 'rename-function',
                rationale: 'removes the function entirely',
                files: [
                    {
                        relPath: 'src/widget.ts',
                        bytes: 'export function renamed(x: number): number {\n  return x;\n}\n',
                    },
                ],
            },
            {
                name: 'wrong-params',
                rationale: 'changes parameter list',
                files: [
                    {
                        relPath: 'src/widget.ts',
                        bytes: 'export function compute(): number {\n  return 0;\n}\n',
                    },
                ],
            },
        ];
        const stdout = fenceCandidates(candidates) + '\nRequests 3 Premium (8s)';
        const adapter = new cli_falsifier_1.CliFalsifier(copilot_1.copilotProfile, {
            authMethodOverride: () => 'chatgpt',
            invocationOverride: async () => ({
                stdout,
                stderr: '',
                exitCode: 0,
                wallClockMs: 30,
            }),
        });
        const ws = makeWorkspace();
        try {
            const srcDir = path.join(ws, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            const original = 'export function compute(x: number): number {\n  return x;\n}\n';
            fs.writeFileSync(path.join(srcDir, 'widget.ts'), original, 'utf8');
            const outcome = await adapter.falsify({
                patchSha: '0'.repeat(40),
                obligation: {
                    type: 'function-must-have-signature',
                    file: 'src/widget.ts',
                    name: 'compute',
                    signature: '(x: number): number',
                },
                contextRefs: [],
                timeBudgetMs: 5_000,
                workspaceRoot: ws,
            });
            assert_1.strict.equal(outcome.result.kind, 'counter-example-input');
            if (outcome.result.kind === 'counter-example-input') {
                assert_1.strict.equal(outcome.result.inputs.length, 3);
            }
            // After every candidate is rolled back, the original file must be
            // restored exactly. This is the snapshot-and-restore invariant.
            const restored = fs.readFileSync(path.join(srcDir, 'widget.ts'), 'utf8');
            assert_1.strict.equal(restored, original, 'original file content must be restored after candidates');
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
});
