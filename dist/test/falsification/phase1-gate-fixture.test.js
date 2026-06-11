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
const run_predicate_1 = require("./shared/run-predicate");
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'evidence', 'fixtures', 'phase-1-gate');
const SAMPLE_PATH = path.join(REPO_ROOT, 'evidence', 'fixtures', 'phase1-obligations.json');
function copyFixture(dest) {
    fs.cpSync(FIXTURE_ROOT, dest, { recursive: true });
}
describe('phase-1 gate fixture contamination guard', () => {
    it('locates the fixture and the locked sample file', () => {
        assert_1.strict.equal(fs.existsSync(FIXTURE_ROOT), true, `missing fixture root: ${FIXTURE_ROOT}`);
        assert_1.strict.equal(fs.existsSync(SAMPLE_PATH), true, `missing sample file: ${SAMPLE_PATH}`);
    });
    it('every locked predicate exits 0 against a fresh copy of the fixture', () => {
        const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
        assert_1.strict.ok(Array.isArray(sample.obligations) && sample.obligations.length > 0);
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-fixture-guard-'));
        const workspace = path.join(tmpRoot, 'workspace');
        try {
            copyFixture(workspace);
            const failures = [];
            for (const obligation of sample.obligations) {
                const result = (0, run_predicate_1.runPredicate)(obligation.predicate, workspace);
                if (result.exitCode !== 0) {
                    failures.push(`${obligation.id}: exit=${result.exitCode} :: ${obligation.predicate}\n` +
                        `  output: ${result.output.slice(0, 400)}`);
                }
            }
            assert_1.strict.deepEqual(failures, [], `fixture is contaminated; predicates that did not exit 0:\n${failures.join('\n')}`);
        }
        finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
