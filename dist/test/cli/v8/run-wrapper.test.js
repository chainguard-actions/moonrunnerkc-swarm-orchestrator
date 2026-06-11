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
const run_wrapper_1 = require("../../../src/cli/v8/run-wrapper");
/**
 * Unit tests for `handleRunV8` plus its argv-splitting and contract-dir
 * discovery helpers. The test seam (`RunV8Deps`) lets us exercise the
 * orchestration logic without spawning the real compile/run handlers.
 */
const { splitArgv, findLatestContractDir, requireValue } = run_wrapper_1.__testing;
describe('cli/v8/run-wrapper splitArgv', () => {
    it('extracts every recognized compile-relevant flag from argv', () => {
        const split = splitArgv([
            '--goal',
            'add a greet function',
            '--repo-root',
            '/tmp/repo',
            '--extractor',
            'anthropic',
            '--api-key',
            'sk-test',
            '--model',
            'claude-opus-4-7',
            '--temperature',
            '0.3',
            '--session',
            'session-x',
        ]);
        assert_1.strict.equal(split.goal, 'add a greet function');
        assert_1.strict.equal(split.repoRoot, '/tmp/repo');
        assert_1.strict.equal(split.extractor, 'anthropic');
        assert_1.strict.equal(split.apiKey, 'sk-test');
        assert_1.strict.equal(split.model, 'claude-opus-4-7');
        assert_1.strict.equal(split.temperature, 0.3);
        // --repo-root, --api-key, --model still pass through to the run step.
        assert_1.strict.deepEqual(split.runPassthrough, [
            '--repo-root',
            '/tmp/repo',
            '--api-key',
            'sk-test',
            '--model',
            'claude-opus-4-7',
            '--session',
            'session-x',
        ]);
    });
    it('returns null fields for absent flags and routes unknown flags through to runPassthrough', () => {
        const split = splitArgv(['--no-deterministic', '--cost-cap', '5']);
        assert_1.strict.equal(split.goal, null);
        assert_1.strict.equal(split.repoRoot, null);
        assert_1.strict.equal(split.extractor, null);
        assert_1.strict.equal(split.apiKey, null);
        assert_1.strict.equal(split.model, null);
        assert_1.strict.equal(split.temperature, null);
        assert_1.strict.deepEqual(split.runPassthrough, ['--no-deterministic', '--cost-cap', '5']);
    });
    it('throws when --temperature is not a finite number', () => {
        assert_1.strict.throws(() => splitArgv(['--temperature', 'not-a-number']), /invalid --temperature/);
    });
    it('requireValue rejects flags whose value is missing or starts with --', () => {
        assert_1.strict.throws(() => requireValue(['--goal'], 1, '--goal'), /requires a value/);
        assert_1.strict.throws(() => requireValue(['--goal', '--repo-root'], 1, '--goal'), /requires a value/);
        assert_1.strict.equal(requireValue(['--goal', 'real value'], 1, '--goal'), 'real value');
    });
});
describe('cli/v8/run-wrapper findLatestContractDir', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'run-wrapper-test-')));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('returns null when the parent directory does not exist', () => {
        const missing = path.join(tmpDir, 'does-not-exist');
        assert_1.strict.equal(findLatestContractDir(missing), null);
    });
    it('returns null when the parent directory is empty', () => {
        assert_1.strict.equal(findLatestContractDir(tmpDir), null);
    });
    it('returns the only contract dir when there is exactly one', () => {
        const only = path.join(tmpDir, 'contract-1');
        fs.mkdirSync(only);
        assert_1.strict.equal(findLatestContractDir(tmpDir), only);
    });
    it('returns the most recently mtimed contract dir when multiple exist', () => {
        const older = path.join(tmpDir, 'older');
        const newer = path.join(tmpDir, 'newer');
        fs.mkdirSync(older);
        fs.mkdirSync(newer);
        // Force older to have an older mtime regardless of fs resolution.
        const past = new Date(Date.now() - 60_000);
        fs.utimesSync(older, past, past);
        assert_1.strict.equal(findLatestContractDir(tmpDir), newer);
    });
    it('ignores non-directory entries', () => {
        fs.writeFileSync(path.join(tmpDir, 'stray-file.json'), '{}');
        const dir = path.join(tmpDir, 'real-contract');
        fs.mkdirSync(dir);
        assert_1.strict.equal(findLatestContractDir(tmpDir), dir);
    });
});
describe('cli/v8/run-wrapper handleRunV8', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'run-wrapper-handle-')));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('returns exit code 1 when --goal is missing', async () => {
        let compileCalled = false;
        let runCalled = false;
        const exit = await (0, run_wrapper_1.handleRunV8)([], {
            handleCompile: async () => {
                compileCalled = true;
                return 0;
            },
            handleRun: async () => {
                runCalled = true;
                return 0;
            },
        });
        assert_1.strict.equal(exit, 1);
        assert_1.strict.equal(compileCalled, false, 'compile must not run without --goal');
        assert_1.strict.equal(runCalled, false, 'run must not run without --goal');
    });
    it('forwards compile failure exit code without invoking run', async () => {
        let runCalled = false;
        const exit = await (0, run_wrapper_1.handleRunV8)(['--goal', 'do something', '--repo-root', tmpDir], {
            handleCompile: async () => 7,
            handleRun: async () => {
                runCalled = true;
                return 0;
            },
        });
        assert_1.strict.equal(exit, 7);
        assert_1.strict.equal(runCalled, false, 'run must not be called after compile failure');
    });
    it('returns 1 when compile succeeds but no contract directory is produced', async () => {
        const exit = await (0, run_wrapper_1.handleRunV8)(['--goal', 'do something', '--repo-root', tmpDir], {
            handleCompile: async () => 0,
            handleRun: async () => 0,
        });
        assert_1.strict.equal(exit, 1);
    });
    it('routes the discovered contract dir into the run step and returns its exit code', async () => {
        const compileArgsCaptured = [];
        let runArgvCaptured = [];
        let runHandlerCalled = false;
        const exit = await (0, run_wrapper_1.handleRunV8)([
            '--goal',
            'add greet',
            '--repo-root',
            tmpDir,
            '--extractor',
            'anthropic',
            '--no-deterministic',
        ], {
            handleCompile: async (argv) => {
                compileArgsCaptured.push(...argv);
                // Simulate the compile-handler writing a contract dir.
                const contractsParent = path.join(tmpDir, '.swarm', 'contracts');
                fs.mkdirSync(contractsParent, { recursive: true });
                fs.mkdirSync(path.join(contractsParent, 'contract-abc'));
                return 0;
            },
            handleRun: async (argv) => {
                runArgvCaptured = argv;
                runHandlerCalled = true;
                return 2;
            },
        });
        assert_1.strict.equal(exit, 2, 'wrapper must return run-handler exit code');
        assert_1.strict.ok(compileArgsCaptured.includes('add greet'));
        assert_1.strict.ok(compileArgsCaptured.includes('--extractor'));
        assert_1.strict.ok(compileArgsCaptured.includes('anthropic'));
        assert_1.strict.ok(runHandlerCalled, 'run handler must have been called');
        assert_1.strict.equal(runArgvCaptured[0], path.join(tmpDir, '.swarm', 'contracts', 'contract-abc'));
        assert_1.strict.ok(runArgvCaptured.includes('--no-deterministic'), 'unknown flag passed through');
    });
});
