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
const cli_falsifier_1 = require("../../../src/falsification/adapters/cli-falsifier");
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-falsifier-'));
}
function makeCounterExample(candidate) {
    return {
        files: candidate.files.map((f) => ({ relPath: f.relPath, bytes: f.bytes })),
        reproducer: 'synthetic-reproducer',
        reproducerOutput: 'synthetic-output',
        reproducerExitCode: 1,
    };
}
function makeStrategy(spy, options = {}) {
    const parsed = options.parsedCandidates ?? [
        { name: 'synthetic', rationale: 'synthetic candidate', files: [{ relPath: 'synthetic.txt', bytes: 'hi' }] },
    ];
    return {
        buildPrompt: () => {
            spy.buildPromptCalls += 1;
            return 'synthetic prompt';
        },
        checkBaseline: () => {
            spy.checkBaselineCalls += 1;
            return { ok: options.baselineOk ?? true, detail: 'synthetic baseline detail' };
        },
        parseCandidates: () => {
            spy.parseCandidatesCalls += 1;
            return parsed;
        },
        runCandidate: (candidate) => {
            spy.runCandidateCalls += 1;
            const runner = options.runCandidate;
            if (runner !== undefined)
                return runner(candidate);
            return { falsified: true, counterExample: makeCounterExample(candidate) };
        },
    };
}
function makeProfile(strategy, overrides = {}) {
    return {
        name: 'synthetic',
        errorLabel: 'synthetic',
        defaultBinary: 'synth-bin',
        defaultModel: null,
        handles: ['property-must-hold'],
        strategies: { 'property-must-hold': strategy },
        promptTemplatePath: {},
        promptDelivery: { kind: 'positional' },
        maxOutputBytes: 65_536,
        notApplicableDetail: 'synthetic adapter only handles property-must-hold',
        transientRetry: null,
        loggerScope: 'synthetic',
        buildArgs: () => ['--synthetic'],
        detectAuthMethod: () => 'api',
        computeCost: () => ({ dollarsBilled: 0.04, dollarsTokenEstimate: 0.04, dollarsApiEquivalent: 0.04 }),
        binaryMissingHint: 'install the synthetic CLI',
        ...overrides,
    };
}
function propertyInput(workspaceRoot) {
    return {
        patchSha: '0'.repeat(40),
        obligation: { type: 'property-must-hold', predicate: 'true', target: 'synthetic target' },
        contextRefs: [],
        timeBudgetMs: 5_000,
        workspaceRoot,
    };
}
function fakeInvocation(stdout = '', stderr = '', exitCode = 0) {
    return async () => ({ stdout, stderr, exitCode, wallClockMs: 1 });
}
function newSpy() {
    return { buildPromptCalls: 0, parseCandidatesCalls: 0, runCandidateCalls: 0, checkBaselineCalls: 0 };
}
describe('CliFalsifier — profile-driven pipeline', () => {
    describe('strategy dispatch', () => {
        it('returns strategy-not-applicable when the profile has no strategy for the obligation type', async () => {
            const spy = newSpy();
            const profile = makeProfile(makeStrategy(spy));
            const adapter = new cli_falsifier_1.CliFalsifier(profile, { invocationOverride: fakeInvocation() });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify({
                    patchSha: '0'.repeat(40),
                    obligation: { type: 'test-must-pass', command: 'echo' },
                    contextRefs: [],
                    timeBudgetMs: 1_000,
                    workspaceRoot: ws,
                });
                assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
                if (outcome.result.kind === 'no-falsification-found') {
                    assert_1.strict.equal(outcome.result.reason, 'strategy-not-applicable');
                    assert_1.strict.equal(outcome.result.detail, 'synthetic adapter only handles property-must-hold');
                }
                assert_1.strict.equal(spy.checkBaselineCalls, 0, 'baseline must not be probed when no strategy matches');
                assert_1.strict.equal(spy.buildPromptCalls, 0);
                assert_1.strict.equal(spy.parseCandidatesCalls, 0);
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
        it('routes to the correct strategy by obligation type and calls it exactly once', async () => {
            const spy = newSpy();
            const strategy = makeStrategy(spy, { parsedCandidates: [] });
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(strategy), {
                invocationOverride: fakeInvocation('synthetic body'),
            });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify(propertyInput(ws));
                assert_1.strict.equal(spy.buildPromptCalls, 1);
                assert_1.strict.equal(spy.parseCandidatesCalls, 1);
                assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
    });
    describe('output parser invocation', () => {
        it('parses the captured stdout through strategy.parseCandidates', async () => {
            let observedStdout = null;
            const parsed = [
                { name: 'c0', rationale: 'first', files: [{ relPath: 'c0.txt', bytes: 'a' }] },
            ];
            const strategy = {
                buildPrompt: () => 'p',
                checkBaseline: () => ({ ok: true, detail: '' }),
                parseCandidates: (stdout) => {
                    observedStdout = stdout;
                    return parsed;
                },
                runCandidate: (c) => ({ falsified: true, counterExample: makeCounterExample(c) }),
            };
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(strategy), {
                invocationOverride: fakeInvocation('captured-stdout-marker'),
            });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify(propertyInput(ws));
                assert_1.strict.equal(observedStdout, 'captured-stdout-marker');
                assert_1.strict.equal(outcome.result.kind, 'counter-example-input');
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
        it('propagates parser errors out of falsify()', async () => {
            const strategy = {
                buildPrompt: () => 'p',
                checkBaseline: () => ({ ok: true, detail: '' }),
                parseCandidates: () => {
                    throw new Error('parser blew up');
                },
                runCandidate: () => ({ falsified: false, counterExample: null }),
            };
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(strategy), { invocationOverride: fakeInvocation('x') });
            const ws = makeWorkspace();
            try {
                await assert_1.strict.rejects(adapter.falsify(propertyInput(ws)), /parser blew up/);
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
    });
    describe('cost record emission', () => {
        it('builds the cost record from profile.computeCost and the classification', async () => {
            const candidates = [
                { name: 'good', rationale: 'falsifies', files: [{ relPath: 'good.txt', bytes: 'g' }] },
                { name: 'bad', rationale: 'does not', files: [{ relPath: 'bad.txt', bytes: 'b' }] },
            ];
            const spy = newSpy();
            const strategy = makeStrategy(spy, {
                parsedCandidates: candidates,
                runCandidate: (c) => c.name === 'good'
                    ? { falsified: true, counterExample: makeCounterExample(c) }
                    : { falsified: false, counterExample: null },
            });
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(strategy, {
                computeCost: () => ({ dollarsBilled: 0.5, dollarsTokenEstimate: 0.75, dollarsApiEquivalent: 1.25 }),
            }), { invocationOverride: fakeInvocation() });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify(propertyInput(ws));
                assert_1.strict.equal(outcome.cost.adapterName, 'synthetic');
                assert_1.strict.equal(outcome.cost.dollarsBilled, 0.5);
                assert_1.strict.equal(outcome.cost.dollarsTokenEstimate, 0.75);
                assert_1.strict.equal(outcome.cost.dollarsApiEquivalent, 1.25);
                assert_1.strict.equal(outcome.cost.dollarsSpent, 0.75);
                assert_1.strict.equal(outcome.cost.counterExamplesFound, 1);
                assert_1.strict.equal(outcome.cost.falsePositives, 1);
                assert_1.strict.equal(outcome.cost.authMethod, 'api');
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
        it('zero-fills the cost record on baseline-predicate-failed without calling profile.computeCost', async () => {
            let computeCostCalls = 0;
            const spy = newSpy();
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(makeStrategy(spy, { baselineOk: false }), {
                computeCost: () => {
                    computeCostCalls += 1;
                    return { dollarsBilled: 9, dollarsTokenEstimate: 9, dollarsApiEquivalent: 9 };
                },
            }), { invocationOverride: fakeInvocation() });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify(propertyInput(ws));
                assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
                if (outcome.result.kind === 'no-falsification-found') {
                    assert_1.strict.equal(outcome.result.reason, 'baseline-predicate-failed');
                    assert_1.strict.equal(outcome.result.detail, 'synthetic baseline detail');
                }
                assert_1.strict.equal(outcome.cost.dollarsBilled, 0);
                assert_1.strict.equal(outcome.cost.dollarsTokenEstimate, 0);
                assert_1.strict.equal(outcome.cost.dollarsApiEquivalent, 0);
                assert_1.strict.equal(computeCostCalls, 0);
                assert_1.strict.equal(spy.buildPromptCalls, 0);
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
    });
    describe('supported-obligation filtering', () => {
        it('exposes the profile.handles list as the adapter.handles surface', () => {
            const spy = newSpy();
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(makeStrategy(spy), { handles: ['property-must-hold', 'file-must-exist'] }));
            assert_1.strict.deepEqual([...adapter.handles], ['property-must-hold', 'file-must-exist']);
        });
        it('returns strategy-not-applicable without spawning the CLI for unhandled obligation types', async () => {
            let invocationCalls = 0;
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(makeStrategy(newSpy())), {
                invocationOverride: async () => {
                    invocationCalls += 1;
                    return { stdout: '', stderr: '', exitCode: 0, wallClockMs: 0 };
                },
            });
            const ws = makeWorkspace();
            try {
                const outcome = await adapter.falsify({
                    patchSha: '0'.repeat(40),
                    obligation: { type: 'file-must-exist', path: 'README.md' },
                    contextRefs: [],
                    timeBudgetMs: 1_000,
                    workspaceRoot: ws,
                });
                assert_1.strict.equal(outcome.result.kind, 'no-falsification-found');
                assert_1.strict.equal(invocationCalls, 0);
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
    });
    describe('error propagation', () => {
        it('throws with exitCode and stderr attached when the CLI exits non-zero', async () => {
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(makeStrategy(newSpy()), { errorLabel: 'synth' }), {
                invocationOverride: fakeInvocation('partial stdout', 'detailed stderr', 9),
            });
            const ws = makeWorkspace();
            try {
                await adapter.falsify(propertyInput(ws));
                assert_1.strict.fail('expected falsify() to throw');
            }
            catch (err) {
                assert_1.strict.ok(err instanceof Error);
                assert_1.strict.match(err.message, /synth exec failed with exit code 9/);
                const cause = err.cause;
                assert_1.strict.ok(cause !== undefined);
                assert_1.strict.equal(cause.exitCode, 9);
                assert_1.strict.equal(cause.stderr, 'detailed stderr');
                assert_1.strict.equal(cause.stdout, 'partial stdout');
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
        it('propagates strategy.runCandidate errors out of falsify()', async () => {
            const strategy = {
                buildPrompt: () => 'p',
                checkBaseline: () => ({ ok: true, detail: '' }),
                parseCandidates: () => [{ name: 'c', rationale: 'x', files: [{ relPath: 'a.txt', bytes: 'a' }] }],
                runCandidate: () => {
                    throw new Error('runner blew up');
                },
            };
            const adapter = new cli_falsifier_1.CliFalsifier(makeProfile(strategy), { invocationOverride: fakeInvocation() });
            const ws = makeWorkspace();
            try {
                await assert_1.strict.rejects(adapter.falsify(propertyInput(ws)), /runner blew up/);
            }
            finally {
                fs.rmSync(ws, { recursive: true, force: true });
            }
        });
    });
});
