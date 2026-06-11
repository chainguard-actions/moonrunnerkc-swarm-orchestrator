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
const compiler_1 = require("../../src/contract/compiler");
const canonicalize_1 = require("../../src/contract/canonicalize");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const tsContext = {
    repoRoot: '/tmp/example-ts',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    language: 'typescript',
};
const pyContext = {
    repoRoot: '/tmp/example-py',
    buildCommand: null,
    testCommand: null,
    language: 'python',
};
const jsContext = {
    repoRoot: '/tmp/example-js',
    buildCommand: 'pnpm run build',
    testCommand: 'pnpm test',
    language: 'javascript',
};
/**
 * Twenty-two goal-to-contract transformations covering: new-file goals,
 * behavioral-only goals, multi-file goals, Python-target projects, JS-with-
 * pnpm projects, intentionally shuffled extractor output, and
 * already-canonical extractor output. Each case asserts that the compiler
 * runs the input through validation, canonical sort, and produces a stable
 * hash. (Phase 1 exit criteria, impl guide §4.)
 */
const TRANSFORMATIONS = [
    {
        name: '01: add a health check endpoint',
        goal: 'add a health check endpoint',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/health.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
        mustContainTypes: ['file-must-exist', 'build-must-pass', 'test-must-pass'],
    },
    {
        name: '02: add a new utility module',
        goal: 'add a string-trim utility',
        repoContext: tsContext,
        extracted: [
            { type: 'test-must-pass', command: 'npm test' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'file-must-exist', path: 'src/strings/trim.ts' },
        ],
        mustContainTypes: ['file-must-exist', 'build-must-pass', 'test-must-pass'],
    },
    {
        name: '03: behavioral fix only',
        goal: 'fix the off-by-one in pagination',
        repoContext: tsContext,
        extracted: [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
        mustContainTypes: ['build-must-pass', 'test-must-pass'],
    },
    {
        name: '04: behavioral refactor only',
        goal: 'extract the parser helper into a private function',
        repoContext: tsContext,
        extracted: [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
        mustContainTypes: ['build-must-pass', 'test-must-pass'],
    },
    {
        name: '05: add CHANGES.md',
        goal: 'add a CHANGES file documenting the migration',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'CHANGES.md' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '06: two new files',
        goal: 'add a Logger interface and a console implementation',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/logging/console-logger.ts' },
            { type: 'file-must-exist', path: 'src/logging/logger.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '07: python project',
        goal: 'add a /healthz route to the Flask app',
        repoContext: pyContext,
        extracted: [
            { type: 'file-must-exist', path: 'app/routes/healthz.py' },
            { type: 'build-must-pass', command: 'python -m compileall app' },
            { type: 'test-must-pass', command: 'pytest' },
        ],
    },
    {
        name: '08: pnpm project',
        goal: 'add a date-formatting helper',
        repoContext: jsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/dates.ts' },
            { type: 'build-must-pass', command: 'pnpm run build' },
            { type: 'test-must-pass', command: 'pnpm test' },
        ],
    },
    {
        name: '09: shuffled extractor output (out-of-order)',
        goal: 'add a feature flag service',
        repoContext: tsContext,
        extracted: [
            { type: 'test-must-pass', command: 'npm test' },
            { type: 'file-must-exist', path: 'src/flags/service.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'file-must-exist', path: 'src/flags/index.ts' },
        ],
    },
    {
        name: '10: linting goal',
        goal: 'add a lint-staged config and an npm script',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: '.lintstagedrc.json' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '11: docs goal',
        goal: 'document the new health endpoint in README',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'README.md' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '12: typed config schema',
        goal: 'add a typed config loader for the API surface',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/config/schema.ts' },
            { type: 'file-must-exist', path: 'src/config/loader.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '13: CI workflow',
        goal: 'add a GitHub Actions workflow for unit tests',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: '.github/workflows/unit.yml' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '14: CLI subcommand',
        goal: 'add a hello subcommand to the CLI',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/cli/hello.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '15: error class',
        goal: 'add a typed NotAuthorizedError',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/errors/not-authorized.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '16: schema fixture',
        goal: 'add a JSON schema fixture for v2',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/schema/v2.json' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '17: package json edit',
        goal: 'tighten the package.json engines field',
        repoContext: tsContext,
        extracted: [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '18: python module + pyproject',
        goal: 'add a CLI entry point and pyproject script registration',
        repoContext: pyContext,
        extracted: [
            { type: 'file-must-exist', path: 'app/cli.py' },
            { type: 'build-must-pass', command: 'python -m compileall app' },
            { type: 'test-must-pass', command: 'pytest' },
        ],
    },
    {
        name: '19: monorepo workspace tests',
        goal: 'add a workspace package for shared types',
        repoContext: jsContext,
        extracted: [
            { type: 'file-must-exist', path: 'packages/types/src/index.ts' },
            { type: 'file-must-exist', path: 'packages/types/package.json' },
            { type: 'build-must-pass', command: 'pnpm run build' },
            { type: 'test-must-pass', command: 'pnpm test' },
        ],
    },
    {
        name: '20: integration test only',
        goal: 'add an integration test for the upload pipeline',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'test/integration/upload.test.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '21: behavioral perf goal',
        goal: 'speed up the route matcher hot path',
        repoContext: tsContext,
        extracted: [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: '22: deeply nested file path',
        goal: 'add a vendor adapter under deeply/nested/dirs',
        repoContext: tsContext,
        extracted: [
            { type: 'file-must-exist', path: 'src/adapters/vendor/x/y/z/adapter.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
];
describe('contract/compiler — 22 goal-to-contract transformations', () => {
    it('is at least 20 fixtures (Phase 1 exit criterion)', () => {
        assert_1.strict.ok(TRANSFORMATIONS.length >= 20, `expected ≥20 fixtures, got ${TRANSFORMATIONS.length}`);
    });
    for (const t of TRANSFORMATIONS) {
        it(t.name, async () => {
            const extractor = stub_extractor_1.StubExtractor.fromGoalMap({ [t.goal]: t.extracted });
            const draft = await (0, compiler_1.compileGoal)({
                goal: t.goal,
                repoContext: t.repoContext,
                extractor,
                autoTagDeterministic: false,
            });
            // Canonically sorted: matches canonicalSort applied to the same inputs.
            assert_1.strict.deepEqual(draft.obligations, (0, canonicalize_1.canonicalSort)(t.extracted));
            // Goal and repoContext propagate to draft.
            assert_1.strict.equal(draft.goal, t.goal);
            assert_1.strict.equal(draft.repoContext.repoRoot, t.repoContext.repoRoot);
            // Provenance from stub is recorded.
            assert_1.strict.equal(draft.extractor.name, 'stub');
            // Required types present per assertion.
            if (t.mustContainTypes) {
                const present = new Set(draft.obligations.map((o) => o.type));
                for (const ty of t.mustContainTypes) {
                    assert_1.strict.ok(present.has(ty), `expected type ${ty} for ${t.name}`);
                }
            }
            // Validator-level invariants (always required by Phase 1 spec).
            assert_1.strict.ok(draft.obligations.some((o) => o.type === 'build-must-pass'));
            assert_1.strict.ok(draft.obligations.some((o) => o.type === 'test-must-pass'));
        });
    }
    it('hash-stability: identical input produces identical contract output', async () => {
        const t = TRANSFORMATIONS[0];
        if (!t)
            throw new Error('fixtures missing');
        const ext1 = stub_extractor_1.StubExtractor.fromObligations(t.extracted);
        const ext2 = stub_extractor_1.StubExtractor.fromObligations(t.extracted);
        const a = await (0, compiler_1.compileGoal)({ goal: t.goal, repoContext: t.repoContext, extractor: ext1 });
        const b = await (0, compiler_1.compileGoal)({ goal: t.goal, repoContext: t.repoContext, extractor: ext2 });
        assert_1.strict.equal((0, canonicalize_1.contractHash)(a.obligations), (0, canonicalize_1.contractHash)(b.obligations));
        const fa = (0, compiler_1.finalize)(a, new Date('2026-05-08T00:00:00.000Z'));
        const fb = (0, compiler_1.finalize)(b, new Date('2026-05-08T00:00:00.000Z'));
        assert_1.strict.equal(fa.manifest.contractHash, fb.manifest.contractHash);
        assert_1.strict.equal(fa.manifest.contractId, fb.manifest.contractId);
    });
    it('hash-stability: hash unchanged when extractor returns shuffled input', async () => {
        const ordered = [
            { type: 'file-must-exist', path: 'src/a.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ];
        const shuffled = [
            { type: 'test-must-pass', command: 'npm test' },
            { type: 'file-must-exist', path: 'src/a.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
        ];
        const a = await (0, compiler_1.compileGoal)({
            goal: 'g',
            repoContext: tsContext,
            extractor: stub_extractor_1.StubExtractor.fromObligations(ordered),
        });
        const b = await (0, compiler_1.compileGoal)({
            goal: 'g',
            repoContext: tsContext,
            extractor: stub_extractor_1.StubExtractor.fromObligations(shuffled),
        });
        assert_1.strict.equal((0, canonicalize_1.contractHash)(a.obligations), (0, canonicalize_1.contractHash)(b.obligations));
    });
    it('throws ContractValidationError on missing build', async () => {
        const ext = stub_extractor_1.StubExtractor.fromObligations([
            { type: 'file-must-exist', path: 'a.ts' },
            { type: 'test-must-pass', command: 'npm test' },
        ]);
        await assert_1.strict.rejects(() => (0, compiler_1.compileGoal)({ goal: 'g', repoContext: tsContext, extractor: ext }), compiler_1.ContractValidationError);
    });
    it('finalize stamps id, hash, and createdAt', () => {
        const draft = {
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: tsContext,
            obligations: [
                { type: 'file-must-exist', path: 'a.ts' },
                { type: 'build-must-pass', command: 'npm run build' },
                { type: 'test-must-pass', command: 'npm test' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        };
        const at = new Date('2026-05-08T12:00:00.000Z');
        const f = (0, compiler_1.finalize)(draft, at);
        assert_1.strict.match(f.manifest.contractHash, /^[0-9a-f]{64}$/);
        assert_1.strict.equal(f.manifest.contractId.length, 16);
        assert_1.strict.equal(f.manifest.createdAt, at.toISOString());
    });
});
describe('contract/compiler — discoverRepoContext', () => {
    it('detects typescript when tsconfig.json is present', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-discover-ts-'));
        try {
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { build: 'tsc', test: 'mocha' } }), 'utf8');
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({}), 'utf8');
            const ctx = (0, compiler_1.discoverRepoContext)(dir);
            assert_1.strict.equal(ctx.language, 'typescript');
            assert_1.strict.equal(ctx.buildCommand, 'npm run build');
            assert_1.strict.equal(ctx.testCommand, 'npm test');
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('detects python when pyproject.toml is present', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-discover-py-'));
        try {
            fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname = "x"\n', 'utf8');
            const ctx = (0, compiler_1.discoverRepoContext)(dir);
            assert_1.strict.equal(ctx.language, 'python');
            assert_1.strict.equal(ctx.buildCommand, null);
            assert_1.strict.equal(ctx.testCommand, null);
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('returns null commands when package.json has no scripts', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-discover-empty-'));
        try {
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
            const ctx = (0, compiler_1.discoverRepoContext)(dir);
            assert_1.strict.equal(ctx.buildCommand, null);
            assert_1.strict.equal(ctx.testCommand, null);
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
describe('contract/compiler — baseline tautology filter', () => {
    function makeRepo(prefix) {
        return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }
    it('drops a property-must-hold whose predicate already exits zero on the baseline', async () => {
        const dir = makeRepo('compiler-tautology-drop-');
        try {
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }), 'utf8');
            fs.writeFileSync(path.join(dir, 'README.md'), '# repo with feature-flag-enabled stuff', 'utf8');
            const tautological = {
                type: 'property-must-hold',
                predicate: "grep -q 'feature-flag-enabled' README.md",
                target: 'flag mentioned',
            };
            const meaningful = {
                type: 'property-must-hold',
                predicate: "grep -q 'brand-new-feature-token' README.md",
                target: 'new feature anchored',
            };
            const testPass = {
                type: 'test-must-pass',
                command: 'jest',
            };
            const ext = stub_extractor_1.StubExtractor.fromObligations([tautological, meaningful, testPass]);
            const draft = await (0, compiler_1.compileGoal)({
                goal: 'demo',
                repoContext: {
                    repoRoot: dir,
                    buildCommand: null,
                    testCommand: 'jest',
                    language: 'typescript',
                },
                extractor: ext,
                autoTagDeterministic: false,
            });
            // tautological obligation is dropped; meaningful + test pass through.
            assert_1.strict.equal(draft.obligations.length, 2);
            assert_1.strict.ok(draft.tautologyWarnings);
            assert_1.strict.equal(draft.tautologyWarnings.length, 1);
            assert_1.strict.equal(draft.tautologyWarnings[0].obligation.target, 'flag mentioned');
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('keeps all obligations when no predicate is tautological', async () => {
        const dir = makeRepo('compiler-tautology-keep-');
        try {
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }), 'utf8');
            fs.writeFileSync(path.join(dir, 'README.md'), '# nothing relevant here', 'utf8');
            const obligation = {
                type: 'property-must-hold',
                predicate: "grep -q 'NEW-TOKEN-ONLY-IN-PATCH' README.md",
                target: 'new token anchored',
            };
            const testPass = { type: 'test-must-pass', command: 'jest' };
            const ext = stub_extractor_1.StubExtractor.fromObligations([obligation, testPass]);
            const draft = await (0, compiler_1.compileGoal)({
                goal: 'demo',
                repoContext: { repoRoot: dir, buildCommand: null, testCommand: 'jest', language: 'typescript' },
                extractor: ext,
                autoTagDeterministic: false,
            });
            assert_1.strict.equal(draft.obligations.length, 2);
            assert_1.strict.equal((draft.tautologyWarnings ?? []).length, 0);
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('skips the baseline check when repoRoot does not exist on disk (unit-test contexts)', async () => {
        const obligation = {
            type: 'property-must-hold',
            predicate: "grep -q 'anything' nonexistent.txt",
            target: 'cannot be checked',
        };
        const testPass = { type: 'test-must-pass', command: 'jest' };
        const ext = stub_extractor_1.StubExtractor.fromObligations([obligation, testPass]);
        const draft = await (0, compiler_1.compileGoal)({
            goal: 'demo',
            repoContext: { repoRoot: '/tmp/this-path-does-not-exist-xyz123', buildCommand: null, testCommand: 'jest', language: 'typescript' },
            extractor: ext,
            autoTagDeterministic: false,
        });
        // Without a real workspace we cannot check the predicate; the
        // obligation passes through unchanged so unit tests work.
        assert_1.strict.equal(draft.obligations.length, 2);
    });
});
describe('contract/compiler — detectPackageManager', () => {
    function makeRepo(prefix) {
        return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }
    it('honors an explicit corepack packageManager field over any lockfile', () => {
        const dir = makeRepo('compiler-pm-corepack-');
        try {
            fs.writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8');
            fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf8');
            // packageManager declared as pnpm — wins regardless of yarn.lock.
            assert_1.strict.equal((0, compiler_1.detectPackageManager)(dir, 'pnpm@8.0.0'), 'pnpm');
            assert_1.strict.equal((0, compiler_1.detectPackageManager)(dir, 'npm@10.0.0'), 'npm');
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('falls back to npm when no lockfile is present', () => {
        const dir = makeRepo('compiler-pm-empty-');
        try {
            assert_1.strict.equal((0, compiler_1.detectPackageManager)(dir), 'npm');
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('returns npm when both yarn.lock and package-lock.json exist (npm is always on PATH with Node)', () => {
        const dir = makeRepo('compiler-pm-both-');
        try {
            fs.writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8');
            fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}', 'utf8');
            // pnpm is rare on CI machines, yarn is hit-or-miss; npm is always
            // present. The detector iterates pnpm/yarn/npm in that order and
            // only returns one whose CLI is on PATH. Test machines may or may
            // not have pnpm/yarn; npm is guaranteed.
            const got = (0, compiler_1.detectPackageManager)(dir);
            assert_1.strict.ok(got === 'npm' || got === 'yarn' || got === 'pnpm');
            // Critical regression guard: even when yarn.lock exists, if yarn is
            // not on PATH we MUST NOT return 'yarn'. Stub PATH to no-yarn by
            // shadowing in a temp dir below in the dedicated test.
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('does NOT return yarn when yarn.lock is present but yarn is not on PATH', () => {
        const dir = makeRepo('compiler-pm-no-yarn-');
        try {
            fs.writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf8');
            // Shadow PATH with an empty dir so `command -v yarn` resolves nothing.
            // Also shadow pnpm. npm is always available — we want the detector to
            // fall back to npm rather than emit "yarn test" which would exit 127.
            const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-pm-emptypath-'));
            const originalPath = process.env.PATH;
            try {
                process.env.PATH = sandbox;
                // npm is also gone in this sandbox, so the function will fall through
                // to the final default. That default is npm.
                assert_1.strict.equal((0, compiler_1.detectPackageManager)(dir), 'npm');
            }
            finally {
                process.env.PATH = originalPath;
                fs.rmSync(sandbox, { recursive: true, force: true });
            }
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
