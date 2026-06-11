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
exports.ContractValidationError = void 0;
exports.compileGoal = compileGoal;
exports.finalize = finalize;
exports.discoverRepoContext = discoverRepoContext;
exports.detectPackageManager = detectPackageManager;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const predicate_runner_1 = require("../verification/predicate-runner");
const registry_1 = require("../wasm/registry");
const canonicalize_1 = require("./canonicalize");
const tagger_1 = require("./tagger");
const types_1 = require("./types");
const validator_1 = require("./validator");
// Carries raw obligations and validation errors so the CLI handler can
// render a useful message without re-running the LLM call.
class ContractValidationError extends Error {
    obligations;
    validationErrors;
    constructor(obligations, errors) {
        const detail = errors.map((e) => `[${e.code}] ${e.message}`).join('\n  ');
        super(`contract validation failed:\n  ${detail}`);
        this.name = 'ContractValidationError';
        this.obligations = obligations;
        this.validationErrors = errors;
    }
}
exports.ContractValidationError = ContractValidationError;
async function compileGoal(options) {
    const extracted = await options.extractor.extract({
        goal: options.goal,
        repoContext: options.repoContext,
    });
    const requireBuild = options.repoContext.buildCommand !== null;
    const validation = (0, validator_1.validateObligations)(extracted.obligations, { requireBuild });
    if (!validation.valid) {
        throw new ContractValidationError(extracted.obligations, validation.errors);
    }
    // Drop property-must-hold obligations whose predicate already exits
    // zero against the unmodified workspace — May 2026 eval ran with
    // "8/13 satisfied" and zero code emitted because of this failure mode.
    const { obligations: filteredObligations, tautologyWarnings } = filterBaselineTautologies(extracted.obligations, options.repoContext.repoRoot);
    const autoTag = options.autoTagDeterministic ?? true;
    const tagged = autoTag
        ? (0, tagger_1.tagObligations)(filteredObligations, {
            availableStrategies: options.availableStrategies ?? registry_1.DEFAULT_STRATEGY_NAMES,
        })
        : filteredObligations.slice();
    const canonical = (0, canonicalize_1.canonicalSort)(tagged);
    const draft = {
        schemaVersion: types_1.CONTRACT_SCHEMA_VERSION,
        goal: options.goal,
        repoContext: options.repoContext,
        obligations: canonical,
        extractor: extracted.provenance,
    };
    if (tautologyWarnings.length > 0) {
        draft.tautologyWarnings = tautologyWarnings;
    }
    return draft;
}
// Skips baseline checks for synthetic repoContexts (unit tests use
// paths like /tmp/example-ts that don't resolve to a real directory).
function filterBaselineTautologies(obligations, repoRoot) {
    if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
        return { obligations: obligations.slice(), tautologyWarnings: [] };
    }
    const kept = [];
    const warnings = [];
    for (const obligation of obligations) {
        if (obligation.type !== 'property-must-hold') {
            kept.push(obligation);
            continue;
        }
        const baseline = (0, predicate_runner_1.checkPredicateBaseline)(obligation.predicate, repoRoot);
        if (baseline.ok) {
            warnings.push({
                obligation,
                reason: `predicate already exits zero on the unmodified workspace ` +
                    `("${obligation.target}"); the obligation cannot measure any change ` +
                    `and would be trivially satisfied by every persona response`,
            });
            continue;
        }
        kept.push(obligation);
    }
    return { obligations: kept, tautologyWarnings: warnings };
}
// Re-validation here is a defensive sweep: drafts are valid by
// construction, so a failure here is a programmer error.
function finalize(draft, now = new Date()) {
    const requireBuild = draft.repoContext.buildCommand !== null;
    const validation = (0, validator_1.validateObligations)(draft.obligations, { requireBuild });
    if (!validation.valid) {
        throw new ContractValidationError(draft.obligations, validation.errors);
    }
    const hash = (0, canonicalize_1.contractHash)(draft.obligations);
    const manifest = {
        schemaVersion: types_1.CONTRACT_SCHEMA_VERSION,
        contractHash: hash,
        contractId: (0, canonicalize_1.contractIdFromHash)(hash),
        goal: draft.goal,
        repoContext: draft.repoContext,
        extractor: draft.extractor,
        createdAt: now.toISOString(),
    };
    return { manifest, obligations: draft.obligations };
}
function discoverRepoContext(repoRoot) {
    const buildCommand = discoverBuildCommand(repoRoot);
    const testCommand = discoverTestCommandLocal(repoRoot);
    const language = detectLanguage(repoRoot);
    const testFramework = detectTestFramework(repoRoot, language);
    const ctx = {
        repoRoot,
        buildCommand,
        testCommand,
        language,
    };
    // exactOptionalPropertyTypes: leaving the key absent for undetected
    // projects keeps older manifests bit-identical.
    if (testFramework !== undefined)
        ctx.testFramework = testFramework;
    return ctx;
}
function discoverBuildCommand(repoRoot) {
    const pkg = readPackageJsonScripts(repoRoot);
    if (!pkg)
        return null;
    if (pkg.scripts && typeof pkg.scripts.build === 'string' && pkg.scripts.build.trim() !== '') {
        return `${pkg.packageManager} run build`;
    }
    return null;
}
function discoverTestCommandLocal(repoRoot) {
    const pkg = readPackageJsonScripts(repoRoot);
    if (!pkg)
        return null;
    if (pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim() !== '') {
        return `${pkg.packageManager} test`;
    }
    return null;
}
function readPackageJsonScripts(repoRoot) {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
    catch {
        return null;
    }
    const declared = parsed.packageManager;
    return {
        scripts: parsed.scripts ?? null,
        packageManager: detectPackageManager(repoRoot, declared),
    };
}
// Earlier "first lockfile wins" heuristic broke runs in repos with
// stale lockfiles (yarn.lock left over after npm migration). Lockfile
// + on-PATH is the gate so we never claim "yarn" when yarn is missing.
// Corepack's `packageManager` declaration wins when present.
function detectPackageManager(repoRoot, declaredPackageManager = undefined) {
    if (typeof declaredPackageManager === 'string') {
        const head = declaredPackageManager.split('@')[0]?.trim();
        if (head === 'pnpm' || head === 'yarn' || head === 'npm')
            return head;
    }
    const candidates = [
        { name: 'pnpm', lockfile: 'pnpm-lock.yaml' },
        { name: 'yarn', lockfile: 'yarn.lock' },
        { name: 'npm', lockfile: 'package-lock.json' },
    ];
    for (const { name, lockfile } of candidates) {
        if (fs.existsSync(path.join(repoRoot, lockfile)) && isCommandOnPath(name)) {
            return name;
        }
    }
    return 'npm';
}
function isCommandOnPath(command) {
    try {
        (0, child_process_1.execSync)(`command -v ${command}`, { stdio: ['ignore', 'ignore', 'ignore'] });
        return true;
    }
    catch {
        return false;
    }
}
function detectTestFramework(repoRoot, language) {
    if (language === 'typescript' || language === 'javascript') {
        return detectNodeTestFramework(repoRoot);
    }
    if (language === 'python') {
        return detectPythonTestFramework(repoRoot);
    }
    return null;
}
function detectNodeTestFramework(repoRoot) {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
    catch {
        return null;
    }
    const allDeps = {
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
    };
    if ('jest' in allDeps)
        return 'jest';
    if ('vitest' in allDeps)
        return 'vitest';
    if ('mocha' in allDeps)
        return 'mocha';
    const testScript = parsed.scripts?.test ?? '';
    if (/\bnode\b[^|;&]*--test\b/.test(testScript))
        return 'node-test';
    if (/\bnode:test\b/.test(testScript))
        return 'node-test';
    return null;
}
function detectPythonTestFramework(repoRoot) {
    if (fs.existsSync(path.join(repoRoot, 'pytest.ini')) ||
        fs.existsSync(path.join(repoRoot, 'tox.ini'))) {
        return 'pytest';
    }
    const pyproject = path.join(repoRoot, 'pyproject.toml');
    if (fs.existsSync(pyproject)) {
        try {
            const txt = fs.readFileSync(pyproject, 'utf8');
            if (/\bpytest\b/.test(txt))
                return 'pytest';
        }
        catch {
            /* fall through */
        }
    }
    const reqs = path.join(repoRoot, 'requirements.txt');
    if (fs.existsSync(reqs)) {
        try {
            const txt = fs.readFileSync(reqs, 'utf8');
            if (/^pytest\b/m.test(txt))
                return 'pytest';
        }
        catch {
            /* fall through */
        }
    }
    return null;
}
function detectLanguage(repoRoot) {
    if (fs.existsSync(path.join(repoRoot, 'tsconfig.json')))
        return 'typescript';
    if (fs.existsSync(path.join(repoRoot, 'pyproject.toml')) ||
        fs.existsSync(path.join(repoRoot, 'requirements.txt'))) {
        return 'python';
    }
    if (fs.existsSync(path.join(repoRoot, 'package.json')))
        return 'javascript';
    return 'unknown';
}
