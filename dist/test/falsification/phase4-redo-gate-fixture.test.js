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
const SAMPLE_PATH = path.join(REPO_ROOT, 'evidence', 'fixtures', 'phase4-redo-obligations.json');
function copyFixture(src, dest) {
    fs.cpSync(src, dest, { recursive: true });
}
describe('phase-4-redo gate fixture contamination guard', () => {
    it('locates the Phase 4 redo obligations file', () => {
        assert_1.strict.equal(fs.existsSync(SAMPLE_PATH), true, `missing phase-4-redo obligations file: ${SAMPLE_PATH}`);
    });
    it('every Phase 4 redo predicate exits 0 against a fresh copy of the referenced fixture', function () {
        this.timeout(30_000);
        const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
        const fixtureRoot = path.resolve(REPO_ROOT, sample.fixturePath);
        assert_1.strict.equal(fs.existsSync(fixtureRoot), true, `missing fixture: ${fixtureRoot}`);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-redo-fixture-test-'));
        const work = path.join(tmp, 'fixture');
        copyFixture(fixtureRoot, work);
        const failures = [];
        for (const o of sample.obligations) {
            const got = (0, run_predicate_1.runPredicate)(o.predicate, work);
            if (got.exitCode !== o.expectedPreApplyExit) {
                failures.push(`${o.id} (${o.stratum}/${o.target}): expected exit ${o.expectedPreApplyExit}, ` +
                    `got ${got.exitCode}; output:\n${got.output.slice(0, 320)}`);
            }
        }
        fs.rmSync(tmp, { recursive: true, force: true });
        assert_1.strict.equal(failures.length, 0, `pre-apply contamination:\n${failures.join('\n')}`);
    });
});
