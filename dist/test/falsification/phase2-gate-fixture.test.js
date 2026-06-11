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
const PHASE2_SAMPLE_PATH = path.join(REPO_ROOT, 'evidence', 'fixtures', 'phase2-obligations.json');
function copyFixture(src, dest) {
    fs.cpSync(src, dest, { recursive: true });
}
describe('phase-2 gate fixture contamination guard', () => {
    it('locates the Phase 2 obligation file', () => {
        assert_1.strict.equal(fs.existsSync(PHASE2_SAMPLE_PATH), true, `missing phase-2 obligations file: ${PHASE2_SAMPLE_PATH}`);
    });
    it('every Phase 2 predicate exits 0 against a fresh copy of the referenced fixture', () => {
        const sample = JSON.parse(fs.readFileSync(PHASE2_SAMPLE_PATH, 'utf8'));
        assert_1.strict.ok(Array.isArray(sample.obligations) && sample.obligations.length === 30);
        const fixtureRoot = path.resolve(REPO_ROOT, sample.fixturePath);
        assert_1.strict.equal(fs.existsSync(fixtureRoot), true, `phase-2 obligations.json points at missing fixture: ${fixtureRoot}`);
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-fixture-guard-'));
        const workspace = path.join(tmpRoot, 'workspace');
        try {
            copyFixture(fixtureRoot, workspace);
            const failures = [];
            for (const obligation of sample.obligations) {
                const result = (0, run_predicate_1.runPredicate)(obligation.predicate, workspace);
                if (result.exitCode !== obligation.expectedPreApplyExit) {
                    failures.push(`${obligation.id}: exit=${result.exitCode} expected=${obligation.expectedPreApplyExit} :: ${obligation.predicate}\n` +
                        `  output: ${result.output.slice(0, 400)}`);
                }
            }
            assert_1.strict.deepEqual(failures, [], `phase-2 fixture is contaminated; predicates that did not match expectedPreApplyExit:\n${failures.join('\n')}`);
        }
        finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
