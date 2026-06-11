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
const node_assert_1 = require("node:assert");
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const compile_handler_1 = require("../../src/cli/v8/compile-handler");
const run_handler_1 = require("../../src/cli/v8/run-handler");
const serializer_1 = require("../../src/contract/serializer");
/**
 * End-to-end demonstration that the orchestrator runs the full compile + run
 * + verify cycle with zero external dependencies: no network, no model, no
 * API key. The contract is hand-authored in YAML and loaded by the
 * deterministic extractor; the run uses the deterministic session with a
 * pre-staged JSONL patch queue. The fixture's package.json declares trivial
 * build/test scripts so the obligations are satisfied by pre-generation
 * verification alone — no patch from the deterministic session is consumed.
 *
 * This is the contract test for the prompt's central claim: "a user can
 * clone the repo, run the tool against a hand-authored contract and
 * externally-sourced patches, and exercise the full verification pipeline
 * without making any network call, without installing any model, and
 * without configuring any API key."
 */
describe('e2e — deterministic full cycle', () => {
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    const originalExtractor = process.env.EXTRACTOR_PROVIDER;
    const originalSession = process.env.SESSION_PROVIDER;
    let tmpDir;
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.EXTRACTOR_PROVIDER;
        delete process.env.SESSION_PROVIDER;
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-det-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        if (originalApiKey !== undefined)
            process.env.ANTHROPIC_API_KEY = originalApiKey;
        if (originalExtractor !== undefined)
            process.env.EXTRACTOR_PROVIDER = originalExtractor;
        if (originalSession !== undefined)
            process.env.SESSION_PROVIDER = originalSession;
    });
    it('compiles a YAML contract and runs it without any external dependencies', async () => {
        const fixtureRoot = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'v8-empty');
        // Hand-authored contract: just enough to exercise both compile and run.
        // test-must-pass against the fixture's `npm test` (which echoes and
        // exits zero) so pre-generation verification satisfies it.
        const contractPath = path.join(tmpDir, 'contract.yaml');
        fs.writeFileSync(contractPath, [
            'obligations:',
            '  - type: build-must-pass',
            '    command: npm run build',
            '  - type: test-must-pass',
            '    command: npm test',
            '',
        ].join('\n'));
        const contractOutDir = path.join(tmpDir, 'contract-out');
        const compileExit = await (0, compile_handler_1.handleCompile)([
            'verify the test command exits zero',
            '--repo-root',
            fixtureRoot,
            '--out',
            contractOutDir,
            '--extractor',
            'deterministic',
            '--contract-file',
            contractPath,
            '--yes',
            '--no-editor',
        ]);
        node_assert_1.strict.equal(compileExit, 0, 'compile must succeed with deterministic provider');
        const contract = (0, serializer_1.readContract)(contractOutDir);
        node_assert_1.strict.equal(contract.obligations.length, 2);
        const types = new Set(contract.obligations.map((o) => o.type));
        node_assert_1.strict.ok(types.has('build-must-pass'));
        node_assert_1.strict.ok(types.has('test-must-pass'));
        node_assert_1.strict.equal(contract.manifest.extractor.name, 'deterministic');
        node_assert_1.strict.equal(contract.manifest.extractor.model, null);
        // Pre-stage an empty patch queue. The deterministic session reads from
        // the queue file on demand; since pre-generation verification will
        // satisfy the test-must-pass obligation, no patch is consumed.
        const queuePath = path.join(tmpDir, 'patches.jsonl');
        fs.writeFileSync(queuePath, '');
        const resultPath = path.join(tmpDir, 'result.json');
        const ledgerPath = path.join(tmpDir, 'ledger.jsonl');
        const runExit = await (0, run_handler_1.handleRun)([
            contractOutDir,
            '--repo-root',
            fixtureRoot,
            '--session',
            'deterministic',
            '--external-patches-queue',
            queuePath,
            '--ledger',
            ledgerPath,
            '--result',
            resultPath,
            '--no-streaming',
            '--no-post-merge',
            '--falsifiers',
            'off',
        ]);
        node_assert_1.strict.equal(runExit, 0, 'run must succeed with deterministic provider');
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        node_assert_1.strict.equal(result.failed, 0, 'no obligation should fail');
        node_assert_1.strict.equal(result.satisfied, 2, 'both obligations should be satisfied');
        // The ledger must record provider attribution for any candidate entries
        // (none expected here because pre-generation skips synthesis), but at
        // minimum the run-started entry must exist.
        const ledger = fs
            .readFileSync(ledgerPath, 'utf8')
            .split('\n')
            .filter((l) => l.length > 0)
            .map((l) => JSON.parse(l));
        const ledgerTypes = ledger.map((e) => e.type);
        node_assert_1.strict.ok(ledgerTypes.includes('run-started'));
        node_assert_1.strict.ok(ledgerTypes.includes('run-finished'));
        // ANTHROPIC_API_KEY must remain unset throughout — the test fails by
        // accidental leak if anything in the pipeline silently reaches for it.
        node_assert_1.strict.equal(process.env.ANTHROPIC_API_KEY, undefined);
    });
});
