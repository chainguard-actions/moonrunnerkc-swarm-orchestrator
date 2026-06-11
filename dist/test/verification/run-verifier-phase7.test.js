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
const run_verifier_1 = require("../../src/verification/run-verifier");
describe('verification/run-verifier (Phase 7 obligation types)', () => {
    let repoRoot;
    beforeEach(() => {
        repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-verify-'));
    });
    afterEach(() => {
        if (repoRoot)
            fs.rmSync(repoRoot, { recursive: true, force: true });
    });
    describe('function-must-have-signature', () => {
        it('passes when the file declares the named function with the signature', () => {
            const filePath = path.join('src', 'handler.ts');
            fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, filePath), 'export async function handler(req: Request): Promise<Response> {\n  return new Response();\n}\n', 'utf8');
            const obligation = {
                type: 'function-must-have-signature',
                file: filePath,
                name: 'handler',
                signature: '(req: Request): Promise<Response>',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('matches whitespace-insensitively', () => {
            const filePath = 'lib/api.ts';
            fs.mkdirSync(path.join(repoRoot, 'lib'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, filePath), 'export function ping( req:    Request ): void {}\n', 'utf8');
            const obligation = {
                type: 'function-must-have-signature',
                file: filePath,
                name: 'ping',
                signature: '(req: Request): void',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('fails when the declared signature does not match', () => {
            const filePath = 'src/handler.ts';
            fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, filePath), 'export function handler() {}\n', 'utf8');
            const obligation = {
                type: 'function-must-have-signature',
                file: filePath,
                name: 'handler',
                signature: '(req: Request): Promise<Response>',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /does not match/);
            assert_1.strict.match(result.detail, /observed "\(\)"/);
        });
        it('fails when the function is not declared at all', () => {
            const filePath = 'src/handler.ts';
            fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, filePath), 'export const unrelated = 1;\n', 'utf8');
            const obligation = {
                type: 'function-must-have-signature',
                file: filePath,
                name: 'handler',
                signature: '(req: Request): Promise<Response>',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /not declared/);
        });
        it('fails with a clear error when the file is missing', () => {
            const obligation = {
                type: 'function-must-have-signature',
                file: 'no-such.ts',
                name: 'x',
                signature: '()',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /does not exist/);
        });
    });
    describe('property-must-hold', () => {
        it('passes when the predicate exits zero', () => {
            const obligation = {
                type: 'property-must-hold',
                target: 'workspace',
                predicate: 'true',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
            assert_1.strict.match(result.detail, /workspace:/);
        });
        it('fails when the predicate exits non-zero', () => {
            const obligation = {
                type: 'property-must-hold',
                target: 'workspace',
                predicate: 'false',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /exited 1/);
        });
    });
    describe('import-graph-must-satisfy', () => {
        it('passes no-upward-imports when no relative imports escape the scope', () => {
            const scope = path.join(repoRoot, 'src');
            fs.mkdirSync(path.join(scope, 'a'), { recursive: true });
            fs.mkdirSync(path.join(scope, 'b'), { recursive: true });
            fs.writeFileSync(path.join(scope, 'a', 'one.ts'), `import './two';\nexport const a = 1;\n`);
            fs.writeFileSync(path.join(scope, 'a', 'two.ts'), `export const b = 2;\n`);
            fs.writeFileSync(path.join(scope, 'b', 'three.ts'), `export const c = 3;\n`);
            const obligation = {
                type: 'import-graph-must-satisfy',
                constraint: 'no-upward-imports',
                scope: 'src',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('fails no-upward-imports when a file imports a parent path', () => {
            const scope = path.join(repoRoot, 'src');
            fs.mkdirSync(path.join(scope, 'a'), { recursive: true });
            fs.writeFileSync(path.join(scope, 'a', 'one.ts'), `import '../../outside';\nexport const a = 1;\n`);
            const obligation = {
                type: 'import-graph-must-satisfy',
                constraint: 'no-upward-imports',
                scope: 'src',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /no-upward-imports/);
        });
        it('passes no-cycles on an acyclic graph', () => {
            const scope = path.join(repoRoot, 'src');
            fs.mkdirSync(scope, { recursive: true });
            fs.writeFileSync(path.join(scope, 'a.ts'), `import './b';\nexport const a = 1;\n`);
            fs.writeFileSync(path.join(scope, 'b.ts'), `import './c';\nexport const b = 1;\n`);
            fs.writeFileSync(path.join(scope, 'c.ts'), `export const c = 1;\n`);
            const obligation = {
                type: 'import-graph-must-satisfy',
                constraint: 'no-cycles',
                scope: 'src',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('detects a back-edge cycle under no-cycles', () => {
            const scope = path.join(repoRoot, 'src');
            fs.mkdirSync(scope, { recursive: true });
            fs.writeFileSync(path.join(scope, 'a.ts'), `import './b';\n`);
            fs.writeFileSync(path.join(scope, 'b.ts'), `import './a';\n`);
            const obligation = {
                type: 'import-graph-must-satisfy',
                constraint: 'no-cycles',
                scope: 'src',
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /no-cycles/);
        });
    });
    describe('coverage-must-exceed', () => {
        function writeCoverage(rel, total) {
            const abs = path.join(repoRoot, rel);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, JSON.stringify({ total }), 'utf8');
            return rel;
        }
        it('passes when the metric exceeds the threshold', () => {
            const rel = writeCoverage('coverage/coverage-summary.json', {
                lines: { pct: 88.5 },
                statements: { pct: 90.0 },
                branches: { pct: 70.0 },
                functions: { pct: 95.0 },
            });
            const obligation = {
                type: 'coverage-must-exceed',
                scope: rel,
                metric: 'lines',
                threshold: 80,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('fails when the metric is below the threshold', () => {
            const rel = writeCoverage('coverage/coverage-summary.json', {
                lines: { pct: 50.0 },
                statements: { pct: 50.0 },
                branches: { pct: 50.0 },
                functions: { pct: 50.0 },
            });
            const obligation = {
                type: 'coverage-must-exceed',
                scope: rel,
                metric: 'lines',
                threshold: 80,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /< threshold/);
        });
        it('fails with actionable detail when the metric is missing', () => {
            const rel = writeCoverage('coverage/coverage-summary.json', {
                lines: { pct: 99 },
            });
            const obligation = {
                type: 'coverage-must-exceed',
                scope: rel,
                metric: 'branches',
                threshold: 50,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /missing total\.branches\.pct/);
        });
        it('fails when the report is missing', () => {
            const obligation = {
                type: 'coverage-must-exceed',
                scope: 'no-such.json',
                metric: 'lines',
                threshold: 50,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /not found/);
        });
    });
    describe('performance-must-not-regress', () => {
        function writeBaseline(rel, value) {
            const abs = path.join(repoRoot, rel);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, JSON.stringify({ value }), 'utf8');
            return rel;
        }
        it('passes when current is within the threshold of the baseline', () => {
            const baselineRel = writeBaseline('bench/baseline.json', 100);
            const obligation = {
                type: 'performance-must-not-regress',
                benchmark: 'echo 105',
                baseline: baselineRel,
                threshold: 0.1, // allow up to 10% regression
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('fails when the regression exceeds the threshold', () => {
            const baselineRel = writeBaseline('bench/baseline.json', 100);
            const obligation = {
                type: 'performance-must-not-regress',
                benchmark: 'echo 130',
                baseline: baselineRel,
                threshold: 0.1,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /regression=/);
        });
        it('takes the last numeric token of stdout as the current value', () => {
            const baselineRel = writeBaseline('bench/baseline.json', 50);
            // The benchmark prints prose; the verifier should pick "52".
            const obligation = {
                type: 'performance-must-not-regress',
                benchmark: 'printf "iters=10 mean=52"',
                baseline: baselineRel,
                threshold: 0.1,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, true, result.detail);
        });
        it('fails when the baseline file is missing', () => {
            const obligation = {
                type: 'performance-must-not-regress',
                benchmark: 'echo 50',
                baseline: 'missing-baseline.json',
                threshold: 0.1,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /not found/);
        });
        it('fails when the benchmark itself errors', () => {
            const baselineRel = writeBaseline('bench/baseline.json', 50);
            const obligation = {
                type: 'performance-must-not-regress',
                benchmark: 'sh -c "exit 7"',
                baseline: baselineRel,
                threshold: 0.1,
            };
            const result = (0, run_verifier_1.verifyObligation)(obligation, { repoRoot });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.match(result.detail, /exited 7/);
        });
    });
});
