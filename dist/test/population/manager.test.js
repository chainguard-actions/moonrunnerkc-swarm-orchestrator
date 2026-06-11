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
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const compiler_1 = require("../../src/contract/compiler");
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function makeContract(repoRoot, filePath) {
    return (0, compiler_1.finalize)({
        schemaVersion: 'v1',
        goal: 'add a thing',
        repoContext: { repoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
        obligations: [
            { type: 'file-must-exist', path: filePath },
            { type: 'build-must-pass', command: 'true' },
            { type: 'test-must-pass', command: 'true' },
        ],
        extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
    });
}
describe('population/manager', () => {
    it('runs the contract end-to-end against a stub session and reports success', async () => {
        const repo = tmpDir('v8-mgr-');
        const ledgerPath = path.join(repo, '.swarm/ledger/test.jsonl');
        const contract = makeContract(repo, 'CHANGES.md');
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nhello\n```' : 'no-op'),
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(ledgerPath, 'r1');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
        });
        assert_1.strict.equal(result.satisfied, 3);
        assert_1.strict.equal(result.failed, 0);
        assert_1.strict.ok(fs.existsSync(path.join(repo, 'CHANGES.md')));
        const entries = ledger.readAll();
        assert_1.strict.equal(entries[0]?.type, 'run-started');
        const lastEntry = entries[entries.length - 1];
        assert_1.strict.equal(lastEntry?.type, 'run-finished');
        assert_1.strict.ok(entries.some((e) => e.type === 'obligation-attempted'));
        assert_1.strict.ok(entries.some((e) => e.type === 'candidate-recorded'));
        assert_1.strict.ok(entries.some((e) => e.type === 'obligation-satisfied'));
    });
    it('records cache reads on subsequent obligations (substrate cache reuse)', async () => {
        const repo = tmpDir('v8-mgr-');
        const contract = makeContract(repo, 'CHANGES.md');
        const session = new stub_session_1.StubSession({
            projectContext: 'A'.repeat(800), // ~200 tokens
            responder: () => '```\nx\n```',
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
        });
        // First call warms cache, subsequent calls read from cache.
        assert_1.strict.ok(result.totalUsage.cacheCreationTokens > 0);
        assert_1.strict.ok(result.totalUsage.cacheReadTokens > 0);
        // 3 obligations: 1 write + 2 reads of the same prefix.
        assert_1.strict.equal(result.totalUsage.cacheReadTokens, result.totalUsage.cacheCreationTokens * 2);
    });
    it('marks obligations as failed when verification rejects', async () => {
        const repo = tmpDir('v8-mgr-');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: repo, buildCommand: 'false', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'CHANGES.md' },
                { type: 'build-must-pass', command: 'false' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const session = new stub_session_1.StubSession({
            projectContext: '',
            responder: (req) => (req.personaId === 'architect' ? '```\nhello\n```' : 'no-op'),
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
        });
        assert_1.strict.equal(result.satisfied, 2);
        assert_1.strict.equal(result.failed, 1);
        const failed = result.outcomes.find((o) => !o.satisfied);
        assert_1.strict.ok(failed);
        assert_1.strict.equal(failed?.obligation.type, 'build-must-pass');
    });
    it('respects maxObligations cap', async () => {
        const repo = tmpDir('v8-mgr-');
        const contract = makeContract(repo, 'CHANGES.md');
        const session = new stub_session_1.StubSession({ projectContext: '', responder: () => '```\nx\n```' });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        const result = await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            maxObligations: 1,
        });
        assert_1.strict.equal(result.outcomes.length, 1);
    });
    it('dispatches falsifiers after producer satisfaction; counter-example flips obligation to failed', async () => {
        const { AdapterRegistry } = await Promise.resolve().then(() => __importStar(require('../../src/falsification/adapters/registry')));
        const repo = tmpDir('v8-mgr-fals-');
        // Property obligation that's trivially satisfied (file exists), so the
        // producer side passes; the fake adapter then claims a counter-example
        // and the manager must flip the obligation to failed.
        fs.writeFileSync(path.join(repo, 'pkg.txt'), 'hello\n');
        const propertyContract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: {
                repoRoot: repo,
                buildCommand: 'true',
                testCommand: 'true',
                language: 'typescript',
            },
            obligations: [
                { type: 'file-must-exist', path: 'pkg.txt' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
                {
                    type: 'property-must-hold',
                    predicate: 'true',
                    target: 'always holds',
                },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const fakeAdapter = {
            name: 'fake-falsifier',
            handles: ['property-must-hold'],
            falsify: async () => ({
                result: {
                    kind: 'counter-example-input',
                    obligationType: 'property-must-hold',
                    inputs: [
                        {
                            files: [],
                            reproducer: 'echo broke',
                            reproducerOutput: 'broke',
                            reproducerExitCode: 1,
                        },
                    ],
                },
                cost: {
                    adapterName: 'fake-falsifier',
                    obligationType: 'property-must-hold',
                    wallClockMs: 5,
                    dollarsSpent: 0,
                    authMethod: 'api',
                    dollarsBilled: 0,
                    dollarsTokenEstimate: 0,
                    dollarsApiEquivalent: 0,
                    counterExamplesFound: 1,
                    falsePositives: 0,
                },
            }),
        };
        const adapterRegistry = new AdapterRegistry();
        adapterRegistry.register(fakeAdapter);
        const session = new stub_session_1.StubSession({
            projectContext: '',
            responder: (req) => req.personaId === 'architect' ? '```\nhello\n```' : 'no-op',
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'fals-1');
        const result = await (0, manager_1.runPopulation)({
            contract: propertyContract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            adapterRegistry,
            falsifiers: 'on',
        });
        // Property obligation must have been flipped to failed by the falsifier.
        const propertyOutcome = result.outcomes.find((o) => o.obligation.type === 'property-must-hold');
        assert_1.strict.ok(propertyOutcome);
        assert_1.strict.equal(propertyOutcome?.satisfied, false);
        assert_1.strict.match(propertyOutcome?.detail ?? '', /fake-falsifier/);
        // Ledger must contain the falsification-call entry with the counter-example.
        const entries = ledger.readAll();
        const falsCall = entries.find((e) => e.type === 'falsification-call');
        assert_1.strict.ok(falsCall, 'expected a falsification-call ledger entry');
        assert_1.strict.equal(falsCall.resultKind, 'counter-example-input');
    });
    it('skips dispatch entirely when falsifiers === "off"', async () => {
        const { AdapterRegistry } = await Promise.resolve().then(() => __importStar(require('../../src/falsification/adapters/registry')));
        const repo = tmpDir('v8-mgr-fals-off-');
        fs.writeFileSync(path.join(repo, 'pkg.txt'), 'hi\n');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: {
                repoRoot: repo,
                buildCommand: 'true',
                testCommand: 'true',
                language: 'typescript',
            },
            obligations: [
                { type: 'file-must-exist', path: 'pkg.txt' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
                { type: 'property-must-hold', predicate: 'true', target: 'always holds' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        let called = false;
        const fakeAdapter = {
            name: 'fake',
            handles: ['property-must-hold'],
            falsify: async () => {
                called = true;
                throw new Error('should never be called');
            },
        };
        const adapterRegistry = new AdapterRegistry();
        adapterRegistry.register(fakeAdapter);
        const session = new stub_session_1.StubSession({
            projectContext: '',
            responder: (req) => req.personaId === 'architect' ? '```\nhi\n```' : 'no-op',
        });
        const ledger = new jsonl_ledger_1.JsonlLedger(path.join(repo, 'ledger.jsonl'), 'r1');
        await (0, manager_1.runPopulation)({
            contract,
            repoRoot: repo,
            registry: (0, persona_registry_1.createDefaultRegistry)(),
            session,
            ledger,
            adapterRegistry,
            falsifiers: 'off',
        });
        assert_1.strict.equal(called, false);
        const entries = ledger.readAll();
        assert_1.strict.equal(entries.some((e) => e.type === 'falsification-call'), false);
    });
    it('renderDynamicMessage embeds the obligation JSON', () => {
        const message = (0, manager_1.renderDynamicMessage)({ type: 'file-must-exist', path: 'src/x.ts' }, '/repo');
        assert_1.strict.match(message, /file-must-exist/);
        assert_1.strict.match(message, /src\/x\.ts/);
        assert_1.strict.match(message, /\/repo/);
    });
});
