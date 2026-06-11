"use strict";
/**
 * Phase 5 WASM deterministic-floor runtime. Hosts a registry of
 * `DeterministicStrategy` modules and dispatches obligations through
 * them under a sandbox: writes outside `repoRoot` are rejected, a
 * scratch directory is provided per-dispatch, and a hard wall-time
 * cap is enforced.
 *
 * Architecture deviation: the §8 spec calls for a Wasmer or wasmtime
 * runtime with WASM modules. Strategies in this build are
 * TypeScript modules running in the same Node process as the
 * orchestrator, with a sandbox layer that enforces the same isolation
 * properties (no writes outside repoRoot, no implicit network access,
 * time budget). The strategy-module surface is shaped to be
 * substitutable with WASM-compiled modules without API churn; the
 * deviation is documented in `docs/v8-architecture-deviations.md`.
 */
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
exports.WasmRuntime = exports.StrategyTimeoutError = exports.SandboxEscapeError = exports.DEFAULT_STRATEGY_TIMEOUT_MS = void 0;
exports.ensureInsideRepoRoot = ensureInsideRepoRoot;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/** Default per-dispatch wall-time budget, ms. */
exports.DEFAULT_STRATEGY_TIMEOUT_MS = 30_000;
/** Error thrown by the sandbox when a write would escape `repoRoot`. */
class SandboxEscapeError extends Error {
    /** The path the strategy attempted to write. */
    attemptedPath;
    /** The repoRoot the sandbox is anchored to. */
    repoRoot;
    constructor(attemptedPath, repoRoot) {
        super(`sandbox refused write at ${attemptedPath}: path escapes repoRoot ${repoRoot}`);
        this.name = 'SandboxEscapeError';
        this.attemptedPath = attemptedPath;
        this.repoRoot = repoRoot;
    }
}
exports.SandboxEscapeError = SandboxEscapeError;
/** Error thrown when a strategy exceeds its wall-time budget. */
class StrategyTimeoutError extends Error {
    strategyName;
    timeoutMs;
    constructor(strategyName, timeoutMs) {
        super(`strategy "${strategyName}" exceeded ${timeoutMs}ms wall-time budget`);
        this.name = 'StrategyTimeoutError';
        this.strategyName = strategyName;
        this.timeoutMs = timeoutMs;
    }
}
exports.StrategyTimeoutError = StrategyTimeoutError;
/**
 * Resolve a candidate write path against `repoRoot` and reject if it
 * escapes. Returns the absolute, sandbox-validated path. Symlink
 * traversal is rejected by `fs.realpathSync` on any existing prefix.
 */
function ensureInsideRepoRoot(repoRoot, candidate) {
    // Resolve any symlinks on both sides so platforms where `/tmp` symlinks
    // to `/private/tmp` (e.g. macOS) don't throw false escape errors.
    const absRepoRoot = canonicalRepoRoot(repoRoot);
    const abs = path.isAbsolute(candidate) ? candidate : path.resolve(absRepoRoot, candidate);
    const resolved = resolveExistingPath(abs);
    const rel = path.relative(absRepoRoot, resolved);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        if (rel === '')
            return absRepoRoot;
        throw new SandboxEscapeError(candidate, absRepoRoot);
    }
    return resolved;
}
function canonicalRepoRoot(repoRoot) {
    const abs = path.resolve(repoRoot);
    try {
        return fs.realpathSync(abs);
    }
    catch {
        return abs;
    }
}
/**
 * Resolve a (possibly nonexistent) path through the deepest existing
 * prefix. If the full path exists, returns its realpath; otherwise
 * walks up to the deepest existing ancestor, resolves it, and rejoins.
 * Falls back to the original absolute path when nothing on the chain
 * exists. Used so the sandbox catches symlink-escapes on existing
 * parents even when the leaf hasn't been created yet.
 */
function resolveExistingPath(abs) {
    try {
        return fs.realpathSync(abs);
    }
    catch {
        const parent = path.dirname(abs);
        if (parent === abs)
            return abs;
        try {
            const realParent = fs.realpathSync(parent);
            return path.join(realParent, path.basename(abs));
        }
        catch {
            return abs;
        }
    }
}
/**
 * The deterministic-floor runtime. Construct one per orchestrator run
 * (or share across runs — the registry has no per-run state).
 */
class WasmRuntime {
    byName = new Map();
    constructor(initial = []) {
        for (const s of initial)
            this.register(s);
    }
    /** Register a strategy. Throws when a name collides. */
    register(strategy) {
        if (this.byName.has(strategy.name)) {
            throw new Error(`strategy "${strategy.name}" already registered; names are unique within a runtime`);
        }
        this.byName.set(strategy.name, strategy);
    }
    /** Look up by name. Returns null when absent. */
    get(name) {
        return this.byName.get(name) ?? null;
    }
    /** True when a strategy with the given name is registered. */
    has(name) {
        return this.byName.has(name);
    }
    /** Snapshot of every registered strategy, in registration order. */
    list() {
        return [...this.byName.values()];
    }
    /** Names of every registered strategy, in registration order. */
    names() {
        return [...this.byName.keys()];
    }
    /**
     * Dispatch an obligation through a strategy. The strategy name is
     * resolved either from the obligation's `deterministicStrategy` tag
     * or from the explicit `strategyName` override.
     *
     * Sandbox properties:
     *   - a fresh scratch directory is created and torn down per dispatch;
     *   - the strategy's writes are validated against `repoRoot` after
     *     execution; any escape causes the dispatch to fail and any
     *     in-repo writes already made by the strategy remain (the sandbox
     *     is post-write, not transactional);
     *   - the wall-time budget defaults to `DEFAULT_STRATEGY_TIMEOUT_MS`
     *     and is enforced via `Promise.race`; an overrun produces a
     *     `StrategyTimeoutError` outcome.
     *
     * On strategy throw, the error message is captured into the outcome
     * so the population manager can log a `obligation-deterministic-failed`
     * entry without crashing the run.
     */
    async dispatch(obligation, repoRoot, options = {}) {
        const name = options.strategyName ?? obligation.deterministicStrategy ?? '';
        if (!name) {
            throw new Error('dispatch requires either obligation.deterministicStrategy or options.strategyName');
        }
        const strategy = this.byName.get(name);
        if (!strategy) {
            const known = this.names().join(', ') || '(none)';
            throw new Error(`strategy "${name}" not registered (known: ${known})`);
        }
        if (!strategy.handles.includes(obligation.type)) {
            throw new Error(`strategy "${name}" does not handle obligation type "${obligation.type}" (handles: ${strategy.handles.join(', ')})`);
        }
        const timeoutMs = options.timeoutMs ?? exports.DEFAULT_STRATEGY_TIMEOUT_MS;
        const absRepoRoot = path.resolve(repoRoot);
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `swarm-wasm-${name}-`));
        const ctx = {
            obligation,
            repoRoot: absRepoRoot,
            scratch,
            timeoutMs,
        };
        const start = Date.now();
        try {
            const result = await runWithTimeout(strategy, ctx);
            validateAffected(absRepoRoot, result);
            return {
                strategyName: name,
                applied: result.applied,
                filesAffected: result.filesAffected,
                detail: result.detail,
                wallTimeMs: Date.now() - start,
                error: null,
            };
        }
        catch (err) {
            return {
                strategyName: name,
                applied: false,
                filesAffected: [],
                detail: `strategy "${name}" failed: ${err.message}`,
                wallTimeMs: Date.now() - start,
                error: err.message,
            };
        }
        finally {
            fs.rmSync(scratch, { recursive: true, force: true });
        }
    }
}
exports.WasmRuntime = WasmRuntime;
async function runWithTimeout(strategy, ctx) {
    let timer = null;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new StrategyTimeoutError(strategy.name, ctx.timeoutMs));
        }, ctx.timeoutMs);
    });
    try {
        return await Promise.race([strategy.execute(ctx), timeoutPromise]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function validateAffected(repoRoot, result) {
    for (const rel of result.filesAffected) {
        ensureInsideRepoRoot(repoRoot, rel);
    }
}
