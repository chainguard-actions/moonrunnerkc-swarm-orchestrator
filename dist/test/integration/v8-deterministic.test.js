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
const compile_handler_1 = require("../../src/cli/v8/compile-handler");
const run_handler_1 = require("../../src/cli/v8/run-handler");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const stubCompile = () => ({
    extractor: stub_extractor_1.StubExtractor.fromHeuristic(),
});
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const serializer_1 = require("../../src/contract/serializer");
const stub_session_1 = require("../../src/session/stub-session");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-det-int-'));
}
describe('integration: v8 deterministic floor (Phase 5)', () => {
    it('compile auto-tags a LICENSE obligation; run satisfies it with zero LLM tokens (§8 exit (a))', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }, null, 2));
        fs.writeFileSync(path.join(work, 'tsconfig.json'), '{}');
        const contractDir = path.join(work, 'contract');
        const compileExit = await (0, compile_handler_1.handleCompile)([
            'add a CHANGELOG.md to the project',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        assert_1.strict.equal(compileExit, 0);
        // Confirm the compiler auto-tagged the CHANGELOG.md obligation.
        const contract = (0, serializer_1.readContract)(contractDir);
        const changelog = contract.obligations.find((o) => o.type === 'file-must-exist' && o.path === 'CHANGELOG.md');
        assert_1.strict.ok(changelog, 'expected CHANGELOG.md obligation to be present');
        assert_1.strict.equal(changelog?.deterministicStrategy, 'scaffold-template');
        // Run.  Use a stub session that throws if synthesis is invoked for
        // the deterministic obligation; build/test obligations call into
        // the session normally.
        const ledgerPath = path.join(work, 'ledger.jsonl');
        const resultPath = path.join(work, 'result.json');
        const seenPersonas = [];
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => {
                seenPersonas.push(req.personaId);
                if (req.personaId === 'architect') {
                    throw new Error('architect persona must not be called: deterministic floor handles file-must-exist');
                }
                return 'no-op';
            },
        });
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', ledgerPath,
            '--result', resultPath,
            '--run-id', 'det-1',
        ], { session });
        assert_1.strict.equal(exit, 0);
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert_1.strict.equal(result.deterministicObligations, 1);
        assert_1.strict.equal(result.deterministicReroutes, 0);
        assert_1.strict.equal(result.satisfied, contract.obligations.length);
        assert_1.strict.equal(result.failed, 0);
        // The CHANGELOG.md file should be on disk now.
        const changelogBody = fs.readFileSync(path.join(work, 'CHANGELOG.md'), 'utf8');
        assert_1.strict.ok(changelogBody.startsWith('# Changelog'));
        // Ledger trio for the deterministic obligation.
        const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
        const detTypes = entries
            .filter((e) => e.type.startsWith('obligation-deterministic'))
            .map((e) => e.type);
        assert_1.strict.deepEqual(detTypes, [
            'obligation-deterministic-attempted',
            'obligation-deterministic-applied',
        ]);
        // The architect persona should never have been dispatched.
        assert_1.strict.ok(!seenPersonas.includes('architect'));
    });
    it('--no-deterministic disables the floor and routes everything to synthesis', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }, null, 2));
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'add a CHANGELOG.md to the project',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        const session = new stub_session_1.StubSession({
            projectContext: 'CTX',
            responder: (req) => (req.personaId === 'architect' ? '```\nlicense body\n```' : 'no-op'),
        });
        const resultPath = path.join(work, 'result.json');
        const exit = await (0, run_handler_1.handleRun)([
            contractDir,
            '--repo-root', work,
            '--ledger', path.join(work, 'ledger.jsonl'),
            '--result', resultPath,
            '--no-deterministic',
            '--run-id', 'det-2',
        ], { session });
        assert_1.strict.equal(exit, 0);
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert_1.strict.equal(result.deterministicObligations, 0);
        assert_1.strict.equal(result.deterministicReroutes, 0);
        // Synthesis ran, so input/output tokens are non-zero.
        assert_1.strict.ok(result.totalUsage.inputTokens + result.totalUsage.cacheReadTokens > 0);
    });
    it('compile records the deterministicStrategy field on disk', async () => {
        const work = tmpDir();
        fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'wf', private: true, scripts: { build: "node -e ''", test: "node -e ''" } }, null, 2));
        const contractDir = path.join(work, 'contract');
        await (0, compile_handler_1.handleCompile)([
            'add a CHANGELOG.md',
            '--repo-root', work,
            '--out', contractDir,
            '--yes',
            '--no-editor',
        ], stubCompile());
        const onDisk = fs.readFileSync(path.join(contractDir, 'contract.jsonl'), 'utf8');
        assert_1.strict.match(onDisk, /"deterministicStrategy":"scaffold-template"/);
    });
});
