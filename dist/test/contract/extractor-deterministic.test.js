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
const deterministic_extractor_1 = require("../../src/contract/extractor/deterministic-extractor");
const REPO_CTX = {
    repoRoot: '/tmp/no-such-repo',
    buildCommand: null,
    testCommand: null,
    language: 'unknown',
};
const VALID_FIXTURES = [
    {
        name: 'file-must-exist (single)',
        obligations: [{ type: 'file-must-exist', path: 'src/lib/x.ts' }],
    },
    {
        name: 'build-must-pass',
        obligations: [
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'function-must-have-signature',
        obligations: [
            {
                type: 'function-must-have-signature',
                file: 'src/handler.ts',
                name: 'handle',
                signature: '(req: Request, res: Response): Promise<void>',
            },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'property-must-hold',
        obligations: [
            {
                type: 'property-must-hold',
                predicate: 'grep -q TODO src/',
                target: 'no TODO markers',
            },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'import-graph-must-satisfy',
        obligations: [
            { type: 'import-graph-must-satisfy', constraint: 'no-cycles', scope: 'src' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'coverage-must-exceed',
        obligations: [
            {
                type: 'coverage-must-exceed',
                scope: 'coverage/coverage-summary.json',
                metric: 'lines',
                threshold: 80,
            },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'performance-must-not-regress',
        obligations: [
            {
                type: 'performance-must-not-regress',
                benchmark: 'node bench.js',
                baseline: 'bench/baseline.json',
                threshold: 0.1,
            },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    },
    {
        name: 'mixed: every obligation type at once',
        obligations: [
            { type: 'file-must-exist', path: 'src/x.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
            {
                type: 'function-must-have-signature',
                file: 'src/x.ts',
                name: 'f',
                signature: '(a, b)',
            },
            { type: 'property-must-hold', predicate: 'true', target: 'always' },
            { type: 'import-graph-must-satisfy', constraint: 'no-upward-imports', scope: 'src' },
            {
                type: 'coverage-must-exceed',
                scope: 'coverage/coverage-summary.json',
                metric: 'branches',
                threshold: 75,
            },
            {
                type: 'performance-must-not-regress',
                benchmark: 'bench',
                baseline: 'bench.json',
                threshold: 0.05,
            },
        ],
    },
];
const INVALID_FIXTURES = [
    {
        name: 'missing top-level obligations array',
        envelope: {},
        expectRuleSubstring: 'obligations',
    },
    {
        name: 'empty obligations array',
        envelope: { obligations: [] },
        expectRuleSubstring: 'at least one',
    },
    {
        name: 'unknown field on obligation',
        envelope: {
            obligations: [
                { type: 'file-must-exist', path: 'a.ts', description: 'not allowed' },
            ],
        },
        expectRuleSubstring: 'description',
    },
    {
        name: 'wrong type in path',
        envelope: { obligations: [{ type: 'file-must-exist', path: 42 }] },
        expectRuleSubstring: 'type',
    },
    {
        name: 'empty string in command',
        envelope: { obligations: [{ type: 'test-must-pass', command: '' }] },
        expectRuleSubstring: 'non-empty',
    },
    {
        name: 'invalid enum value for import constraint',
        envelope: {
            obligations: [
                { type: 'import-graph-must-satisfy', constraint: 'no-side-imports', scope: 'src' },
            ],
        },
        expectRuleSubstring: 'must be one of',
    },
    {
        name: 'coverage threshold above maximum',
        envelope: {
            obligations: [
                {
                    type: 'coverage-must-exceed',
                    scope: 'coverage/coverage-summary.json',
                    metric: 'lines',
                    threshold: 150,
                },
            ],
        },
        expectRuleSubstring: 'numeric range',
    },
    {
        name: 'unknown obligation type',
        envelope: {
            obligations: [{ type: 'file-must-not-exist', path: 'a.ts' }],
        },
        expectRuleSubstring: 'eight allowed obligation types',
    },
];
describe('contract/extractor — DeterministicExtractor', () => {
    describe('valid fixtures', () => {
        for (const fixture of VALID_FIXTURES) {
            it(`accepts: ${fixture.name}`, async () => {
                const extractor = deterministic_extractor_1.DeterministicExtractor.fromInline({ obligations: fixture.obligations });
                const out = await extractor.extract({ goal: 'unused', repoContext: REPO_CTX });
                node_assert_1.strict.deepEqual(out.obligations, fixture.obligations);
                node_assert_1.strict.equal(out.provenance.name, 'deterministic');
                node_assert_1.strict.equal(out.provenance.model, null);
                node_assert_1.strict.equal(out.provenance.temperature, null);
                node_assert_1.strict.equal(typeof out.provenance.promptSha256, 'string');
                node_assert_1.strict.equal(out.provenance.promptSha256?.length, 64);
            });
        }
    });
    describe('invalid fixtures', () => {
        for (const fixture of INVALID_FIXTURES) {
            it(`rejects: ${fixture.name}`, async () => {
                const extractor = new deterministic_extractor_1.DeterministicExtractor({
                    source: { kind: 'inline', envelope: fixture.envelope },
                });
                await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'unused', repoContext: REPO_CTX }), (err) => {
                    node_assert_1.strict.ok(err instanceof deterministic_extractor_1.DeterministicExtractorError, `expected DeterministicExtractorError, got ${err.name}`);
                    const text = `${err.message}\n${err.issues.map((i) => `${i.fix} ${i.message}`).join('\n')}`;
                    node_assert_1.strict.ok(text.toLowerCase().includes(fixture.expectRuleSubstring.toLowerCase()), `expected error text to contain "${fixture.expectRuleSubstring}"; got:\n${text}`);
                    return true;
                });
            });
        }
    });
    describe('file input form', () => {
        let tmpDir;
        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-extractor-'));
        });
        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
        it('loads a JSON contract file', async () => {
            const file = path.join(tmpDir, 'contract.json');
            fs.writeFileSync(file, JSON.stringify({ obligations: [{ type: 'test-must-pass', command: 'npm test' }] }));
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromFile(file);
            const out = await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
            node_assert_1.strict.equal(out.obligations.length, 1);
            node_assert_1.strict.equal(out.obligations[0].type, 'test-must-pass');
        });
        it('loads a YAML contract file', async () => {
            const file = path.join(tmpDir, 'contract.yaml');
            fs.writeFileSync(file, 'obligations:\n  - type: test-must-pass\n    command: npm test\n');
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromFile(file);
            const out = await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
            node_assert_1.strict.equal(out.obligations.length, 1);
            node_assert_1.strict.equal(out.obligations[0].type, 'test-must-pass');
        });
        it('rejects an unknown extension', async () => {
            const file = path.join(tmpDir, 'contract.toml');
            fs.writeFileSync(file, 'whatever');
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromFile(file);
            await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /unsupported extension/);
        });
        it('rejects a missing file', async () => {
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromFile(path.join(tmpDir, 'does-not-exist.json'));
            await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /not found/);
        });
        it('rejects malformed JSON', async () => {
            const file = path.join(tmpDir, 'contract.json');
            fs.writeFileSync(file, '{ this is not json');
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromFile(file);
            await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /not valid JSON/);
        });
    });
    describe('module input form', () => {
        let tmpDir;
        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-extractor-mod-'));
        });
        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
        it('loads a JS module default export', async () => {
            const file = path.join(tmpDir, 'contract.js');
            fs.writeFileSync(file, `module.exports = { obligations: [{ type: 'test-must-pass', command: 'npm test' }] };`);
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromModule(file);
            const out = await extractor.extract({ goal: 'g', repoContext: REPO_CTX });
            node_assert_1.strict.equal(out.obligations.length, 1);
        });
        it('rejects a missing module path', async () => {
            const extractor = deterministic_extractor_1.DeterministicExtractor.fromModule(path.join(tmpDir, 'nope.js'));
            await node_assert_1.strict.rejects(() => extractor.extract({ goal: 'g', repoContext: REPO_CTX }), /not found/);
        });
    });
    describe('determinism', () => {
        it('produces identical promptSha256 across runs with the same input', async () => {
            const env = { obligations: [{ type: 'test-must-pass', command: 'npm test' }] };
            const a = await deterministic_extractor_1.DeterministicExtractor.fromInline(env).extract({
                goal: 'g',
                repoContext: REPO_CTX,
            });
            const b = await deterministic_extractor_1.DeterministicExtractor.fromInline(env).extract({
                goal: 'g',
                repoContext: REPO_CTX,
            });
            node_assert_1.strict.equal(a.provenance.promptSha256, b.provenance.promptSha256);
        });
    });
});
