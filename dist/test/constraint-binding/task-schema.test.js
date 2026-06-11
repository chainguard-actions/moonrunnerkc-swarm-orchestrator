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
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TASKS_DIR = path.join(REPO_ROOT, 'benchmarks', 'constraint-binding', 'tasks');
const ENGINE = path.join(REPO_ROOT, 'benchmarks', 'constraint-binding', 'validator-engine.js');
const engine = require(ENGINE);
function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}
describe('Constraint-binding task schema', () => {
    let scratch = [];
    afterEach(() => {
        for (const d of scratch) {
            try {
                fs.rmSync(d, { recursive: true, force: true });
            }
            catch {
                // best effort
            }
        }
        scratch = [];
    });
    it('every shipped task YAML passes lint', () => {
        const result = engine.lintTasksDir(TASKS_DIR);
        assert_1.strict.ok(result.ok, `lint errors: ${result.errors.join('; ')}`);
        assert_1.strict.strictEqual(result.count, 4, 'expected 4 pilot tasks in Phase 3a');
    });
    it('each pilot task covers a distinct pattern', () => {
        const tasks = fs
            .readdirSync(TASKS_DIR)
            .filter((f) => f.endsWith('.yaml'))
            .map((f) => engine.loadTask(path.join(TASKS_DIR, f)));
        const patterns = new Set(tasks.map((t) => t.pattern));
        assert_1.strict.strictEqual(patterns.size, 4, `patterns should be distinct, got ${[...patterns].join(',')}`);
        for (const p of patterns) {
            assert_1.strict.ok(engine.ALLOWED_PATTERNS.includes(p), `pattern ${p} not in allowed set`);
        }
    });
    it('rejects a task missing required top-level fields', () => {
        const task = {
            id: 'no-prompt',
            name: 'x',
            pattern: 'rename-then-update-callers',
            pre_state: {
                fixture_tarball: 't.tar.gz',
                source_repo: 'https://example.com/r',
                source_sha: 'a'.repeat(40),
                fixture_sha256: 'pending',
            },
            expected_steps_min: 1,
            post_state_validators: [{ name: 'x', cmd: 'true' }],
        };
        assert_1.strict.throws(() => engine.validateTask(task), /missing required field "prompt"/);
    });
    it('rejects a task where source_sha is not a 40-char hex string', () => {
        const task = {
            id: 'bad-sha',
            name: 'x',
            pattern: 'rename-then-update-callers',
            pre_state: {
                fixture_tarball: 't.tar.gz',
                source_repo: 'https://example.com/r',
                source_sha: 'not-a-sha',
                fixture_sha256: 'pending',
            },
            prompt: 'do a thing',
            expected_steps_min: 1,
            post_state_validators: [{ name: 'x', cmd: 'true' }],
        };
        assert_1.strict.throws(() => engine.validateTask(task), /40-char hex SHA-1/);
    });
    it('rejects a task with an unknown pattern', () => {
        const task = {
            id: 'bad-pattern',
            name: 'x',
            pattern: 'make-it-work',
            pre_state: {
                fixture_tarball: 't.tar.gz',
                source_repo: 'https://example.com/r',
                source_sha: 'a'.repeat(40),
                fixture_sha256: 'pending',
            },
            prompt: 'do a thing',
            expected_steps_min: 1,
            post_state_validators: [{ name: 'x', cmd: 'true' }],
        };
        assert_1.strict.throws(() => engine.validateTask(task), /not in allowed set/);
    });
});
describe('Constraint-binding validator runner', () => {
    let scratch = [];
    afterEach(() => {
        for (const d of scratch) {
            try {
                fs.rmSync(d, { recursive: true, force: true });
            }
            catch {
                // best effort
            }
        }
        scratch = [];
    });
    it('reports passed=true when every validator exits 0', () => {
        const dir = tmpDir('cb-validate-pass');
        scratch.push(dir);
        fs.writeFileSync(path.join(dir, 'target.txt'), 'hello');
        const task = {
            id: 'x',
            post_state_validators: [
                { name: 'file exists', cmd: 'test -f target.txt' },
                { name: 'content matches', cmd: 'grep -q hello target.txt' },
            ],
            pattern: 'rename-then-update-callers',
        };
        const report = engine.runValidators(task, dir);
        assert_1.strict.strictEqual(report.passed, true);
        assert_1.strict.strictEqual(report.validators.length, 2);
    });
    it('stops at the first failing validator and records the exit code', () => {
        const dir = tmpDir('cb-validate-fail');
        scratch.push(dir);
        const task = {
            id: 'x',
            post_state_validators: [
                { name: 'first passes', cmd: 'true' },
                { name: 'second fails', cmd: 'exit 7' },
                { name: 'third would have run', cmd: 'true' },
            ],
            pattern: 'rename-then-update-callers',
        };
        const report = engine.runValidators(task, dir);
        assert_1.strict.strictEqual(report.passed, false);
        assert_1.strict.strictEqual(report.validators.length, 2, 'must stop after the first fail');
        assert_1.strict.strictEqual(report.validators[1].exitCode, 7);
    });
    it('CLI entrypoint lints the shipped tasks dir cleanly', () => {
        const out = (0, child_process_1.execFileSync)('node', [ENGINE, 'lint', TASKS_DIR], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert_1.strict.match(out, /✓ 4 task\(s\) .* passed schema validation/);
    });
});
