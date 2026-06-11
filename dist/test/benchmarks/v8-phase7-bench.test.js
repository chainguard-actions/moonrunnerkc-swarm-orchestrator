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
const types_1 = require("../../src/contract/types");
const persona_registry_1 = require("../../src/persona/persona-registry");
/**
 * Phase 7 §10 milestone gates, exercised both in-process (the population
 * shape) and end-to-end (running `dist/scripts/v8-bench/run-phase7.js`).
 *
 * These tests are the CI gate for Phase 7's milestone closure: 7+
 * personas in the library, 8+ contract obligation types, every type
 * dispatched to its owning persona on a clean workspace, and every new
 * type surfacing a verifiable failure on a non-compliant workspace.
 */
describe('v8 Phase 7 milestone benchmark gate', () => {
    it('default registry exposes at least 7 personas (§10)', () => {
        assert_1.strict.ok(persona_registry_1.DEFAULT_PERSONA_IDS.length >= 7, `expected >=7 personas; got ${persona_registry_1.DEFAULT_PERSONA_IDS.length}`);
    });
    it('contract schema declares at least 8 obligation types (§10)', () => {
        assert_1.strict.ok(types_1.OBLIGATION_TYPES.length >= 8, `expected >=8 obligation types; got ${types_1.OBLIGATION_TYPES.length}`);
    });
    it('every Phase 7 obligation type is in OBLIGATION_TYPES', () => {
        const required = [
            'function-must-have-signature',
            'property-must-hold',
            'import-graph-must-satisfy',
            'coverage-must-exceed',
            'performance-must-not-regress',
        ];
        for (const r of required) {
            assert_1.strict.ok(types_1.OBLIGATION_TYPES.includes(r), `missing ${r}`);
        }
    });
    it('every Phase 7 persona id is in DEFAULT_PERSONA_IDS', () => {
        const required = [
            'security-reviewer',
            'dependency-auditor',
            'documentation-writer',
            'migration-specialist',
            'test-author',
        ];
        for (const r of required) {
            assert_1.strict.ok(persona_registry_1.DEFAULT_PERSONA_IDS.includes(r), `missing ${r}`);
        }
    });
    it('the Phase 7 §10 ship gate passes end-to-end (run-phase7.js)', function () {
        this.timeout(30_000);
        const distScript = path.resolve(__dirname, '..', '..', 'scripts', 'v8-bench', 'run-phase7.js');
        if (!fs.existsSync(distScript)) {
            // The compiled bench script lives next to other compiled bench
            // entry points under `dist/scripts/v8-bench/`. The test file is
            // already under `dist/test/...` at runtime, so __dirname climbs
            // two levels to reach `dist/`, then descends into the bench dir.
            throw new Error(`bench script missing at ${distScript}; run \`npm run build\` first`);
        }
        const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'v8-phase7-bench-'));
        const jsonl = path.join(tmpDocs, 'history.jsonl');
        const result = (0, child_process_1.spawnSync)(process.execPath, [
            distScript,
            '--out-dir',
            tmpDocs,
            '--jsonl',
            jsonl,
        ], { encoding: 'utf8' });
        try {
            assert_1.strict.equal(result.status, 0, `bench exited ${result.status}; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
            const reportPath = path.join(tmpDocs, 'v8-phase-7-benchmark.md');
            assert_1.strict.ok(fs.existsSync(reportPath), `report not written to ${reportPath}`);
            const md = fs.readFileSync(reportPath, 'utf8');
            assert_1.strict.match(md, /At least 7 personas in the library:\*\* PASS/);
            assert_1.strict.match(md, /At least 8 contract obligation types:\*\* PASS/);
            assert_1.strict.match(md, /Every obligation type dispatches to its owning persona:\*\* PASS/);
            assert_1.strict.match(md, /Failure suite catches every new Phase 7 obligation type:\*\* PASS/);
            // History row written.
            assert_1.strict.ok(fs.existsSync(jsonl));
            const lines = fs.readFileSync(jsonl, 'utf8').trim().split('\n');
            assert_1.strict.equal(lines.length, 1);
            const row = JSON.parse(lines[0] ?? '{}');
            assert_1.strict.equal(row.suite, 'phase7-milestone');
            assert_1.strict.ok(row.personaCount >= 7);
            assert_1.strict.ok(row.obligationTypeCount >= 8);
            assert_1.strict.equal(row.gates.personaCountAtLeast7, true);
            assert_1.strict.equal(row.gates.obligationTypeCountAtLeast8, true);
            assert_1.strict.equal(row.gates.everyTypeDispatchedToOwner, true);
            assert_1.strict.equal(row.gates.failureSuiteCatchesEveryNewType, true);
        }
        finally {
            fs.rmSync(tmpDocs, { recursive: true, force: true });
        }
    });
});
