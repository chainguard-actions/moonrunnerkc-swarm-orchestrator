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
const wasm_1 = require("../../src/wasm");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-rt-'));
}
const fileObligation = (relPath, strategyName) => {
    const o = { type: 'file-must-exist', path: relPath };
    if (strategyName !== undefined)
        o.deterministicStrategy = strategyName;
    return o;
};
describe('wasm/wasm-runtime', () => {
    describe('ensureInsideRepoRoot', () => {
        it('accepts a repo-relative path', () => {
            const repo = tmpDir();
            const resolved = (0, wasm_1.ensureInsideRepoRoot)(repo, 'subdir/file.txt');
            assert_1.strict.equal(resolved, path.join(fs.realpathSync(repo), 'subdir', 'file.txt'));
        });
        it('rejects ../ traversal', () => {
            const repo = tmpDir();
            assert_1.strict.throws(() => (0, wasm_1.ensureInsideRepoRoot)(repo, '../escape.txt'), wasm_1.SandboxEscapeError);
        });
        it('rejects an absolute path outside the repo', () => {
            const repo = tmpDir();
            assert_1.strict.throws(() => (0, wasm_1.ensureInsideRepoRoot)(repo, '/etc/passwd'), wasm_1.SandboxEscapeError);
        });
        it('rejects symlink that escapes the repo', () => {
            const repo = tmpDir();
            const elsewhere = tmpDir();
            const link = path.join(repo, 'link');
            fs.symlinkSync(elsewhere, link);
            assert_1.strict.throws(() => (0, wasm_1.ensureInsideRepoRoot)(repo, 'link/inside.txt'), wasm_1.SandboxEscapeError);
        });
        it('returns repoRoot itself when given the empty path', () => {
            const repo = tmpDir();
            const resolved = (0, wasm_1.ensureInsideRepoRoot)(repo, '');
            assert_1.strict.equal(resolved, fs.realpathSync(repo));
        });
    });
    describe('WasmRuntime registry', () => {
        it('starts empty when given no initial strategies', () => {
            const r = new wasm_1.WasmRuntime();
            assert_1.strict.deepEqual(r.names(), []);
            assert_1.strict.equal(r.has('foo'), false);
            assert_1.strict.equal(r.get('foo'), null);
        });
        it('registers and retrieves strategies', () => {
            const dummy = {
                name: 'dummy',
                description: 'noop',
                handles: ['file-must-exist'],
                async execute() {
                    return { applied: false, detail: '', filesAffected: [] };
                },
            };
            const r = new wasm_1.WasmRuntime([dummy]);
            assert_1.strict.equal(r.has('dummy'), true);
            assert_1.strict.equal(r.get('dummy'), dummy);
            assert_1.strict.deepEqual(r.names(), ['dummy']);
        });
        it('rejects duplicate registration by name', () => {
            const dummy = {
                name: 'dummy',
                description: 'noop',
                handles: ['file-must-exist'],
                async execute() {
                    return { applied: false, detail: '', filesAffected: [] };
                },
            };
            const r = new wasm_1.WasmRuntime([dummy]);
            assert_1.strict.throws(() => r.register(dummy), /already registered/);
        });
    });
    describe('default registry', () => {
        it('ships the three §8 first-party strategies', () => {
            const r = (0, wasm_1.createDefaultRuntime)();
            assert_1.strict.deepEqual(r.names().sort(), [...wasm_1.DEFAULT_STRATEGY_NAMES].sort());
            assert_1.strict.equal(r.list().length, 3);
            assert_1.strict.equal(wasm_1.DEFAULT_STRATEGIES.length, 3);
        });
        it('every default strategy declares a non-empty handles list', () => {
            for (const s of wasm_1.DEFAULT_STRATEGIES) {
                assert_1.strict.ok(s.handles.length > 0, `strategy ${s.name} has empty handles`);
            }
        });
    });
    describe('dispatch', () => {
        it('applies and reports filesAffected', async () => {
            const repo = tmpDir();
            const r = (0, wasm_1.createDefaultRuntime)();
            const out = await r.dispatch(fileObligation('LICENSE', 'scaffold-template'), repo);
            assert_1.strict.equal(out.error, null);
            assert_1.strict.equal(out.applied, true);
            assert_1.strict.deepEqual(out.filesAffected, ['LICENSE']);
            assert_1.strict.ok(fs.existsSync(path.join(repo, 'LICENSE')));
        });
        it('captures thrown errors into the outcome', async () => {
            const repo = tmpDir();
            const throwy = {
                name: 'throwy',
                description: 'always throws',
                handles: ['file-must-exist'],
                async execute() {
                    throw new Error('boom');
                },
            };
            const r = new wasm_1.WasmRuntime([throwy]);
            const out = await r.dispatch(fileObligation('x', 'throwy'), repo);
            assert_1.strict.equal(out.applied, false);
            assert_1.strict.equal(out.error, 'boom');
            assert_1.strict.ok(out.detail.includes('boom'));
        });
        it('rejects when the strategy is not registered', async () => {
            const repo = tmpDir();
            const r = new wasm_1.WasmRuntime();
            await assert_1.strict.rejects(() => r.dispatch(fileObligation('x', 'missing'), repo), /not registered/);
        });
        it('rejects when the strategy does not handle the obligation type', async () => {
            const repo = tmpDir();
            const fileOnly = {
                name: 'file-only',
                description: 'file-must-exist only',
                handles: ['file-must-exist'],
                async execute() {
                    return { applied: true, detail: '', filesAffected: [] };
                },
            };
            const r = new wasm_1.WasmRuntime([fileOnly]);
            const buildObligation = {
                type: 'build-must-pass',
                command: 'true',
                deterministicStrategy: 'file-only',
            };
            await assert_1.strict.rejects(() => r.dispatch(buildObligation, repo), /does not handle obligation type/);
        });
        it('rejects with neither tag nor explicit name', async () => {
            const repo = tmpDir();
            const r = (0, wasm_1.createDefaultRuntime)();
            await assert_1.strict.rejects(() => r.dispatch(fileObligation('x'), repo), /requires either obligation\.deterministicStrategy/);
        });
        it('honors the strategyName override', async () => {
            const repo = tmpDir();
            const r = (0, wasm_1.createDefaultRuntime)();
            const out = await r.dispatch(fileObligation('LICENSE'), repo, { strategyName: 'scaffold-template' });
            assert_1.strict.equal(out.error, null);
            assert_1.strict.equal(out.applied, true);
            assert_1.strict.equal(out.strategyName, 'scaffold-template');
        });
        it('captures wall-time budget overruns as StrategyTimeoutError', async () => {
            const repo = tmpDir();
            const slow = {
                name: 'slow',
                description: 'sleeps past the budget',
                handles: ['file-must-exist'],
                async execute(ctx) {
                    await new Promise((resolve) => setTimeout(resolve, ctx.timeoutMs * 5));
                    return { applied: true, detail: '', filesAffected: [] };
                },
            };
            const r = new wasm_1.WasmRuntime([slow]);
            const out = await r.dispatch(fileObligation('x', 'slow'), repo, { timeoutMs: 50 });
            assert_1.strict.equal(out.applied, false);
            assert_1.strict.ok(out.error !== null);
            assert_1.strict.ok(out.error?.includes('exceeded'));
        });
        it('exposes a timeout error class for instanceof checks', async () => {
            const e = new wasm_1.StrategyTimeoutError('s', 100);
            assert_1.strict.equal(e.strategyName, 's');
            assert_1.strict.equal(e.timeoutMs, 100);
        });
        it('rejects when a strategy reports a write outside repoRoot', async () => {
            const repo = tmpDir();
            const escape = {
                name: 'escape',
                description: 'reports an escape path',
                handles: ['file-must-exist'],
                async execute() {
                    return { applied: true, detail: 'wrote outside', filesAffected: ['../leak.txt'] };
                },
            };
            const r = new wasm_1.WasmRuntime([escape]);
            const out = await r.dispatch(fileObligation('x', 'escape'), repo);
            assert_1.strict.equal(out.applied, false);
            assert_1.strict.ok(out.error !== null);
            assert_1.strict.ok(out.error?.includes('escapes repoRoot'));
        });
        it('cleans up the scratch directory after dispatch', async () => {
            const repo = tmpDir();
            const seen = [];
            const watcher = {
                name: 'watcher',
                description: 'records its scratch dir',
                handles: ['file-must-exist'],
                async execute(ctx) {
                    seen.push(ctx.scratch);
                    return { applied: false, detail: '', filesAffected: [] };
                },
            };
            const r = new wasm_1.WasmRuntime([watcher]);
            await r.dispatch(fileObligation('x', 'watcher'), repo);
            assert_1.strict.equal(seen.length, 1);
            assert_1.strict.equal(fs.existsSync(seen[0] ?? ''), false);
        });
    });
});
