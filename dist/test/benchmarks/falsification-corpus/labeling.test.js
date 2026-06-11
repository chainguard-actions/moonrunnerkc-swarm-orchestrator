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
const label_rules_1 = require("../../../benchmarks/falsification-corpus/label-rules");
const label_store_1 = require("../../../benchmarks/falsification-corpus/label-store");
describe('falsification corpus labeling workflow', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falsification-labels-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('enforces rationale, broken category, and ambiguous review rules', () => {
        assert_1.strict.ok((0, label_rules_1.validateGroundTruthLabel)({
            verdict: 'clean',
            rationale: 'Too short.',
            labeledBy: 'reviewer',
            labeledAt: '2026-04-29T00:00:00.000Z',
        }).some(issue => issue.includes('three sentences')));
        assert_1.strict.ok((0, label_rules_1.validateGroundTruthLabel)({
            verdict: 'broken',
            rationale: 'First sentence. Second sentence. Third sentence.',
            labeledBy: 'reviewer',
            labeledAt: '2026-04-29T00:00:00.000Z',
        }).some(issue => issue.includes('at least one broken category')));
        assert_1.strict.ok((0, label_rules_1.validateGroundTruthLabel)({
            verdict: 'ambiguous',
            rationale: 'First sentence. Second sentence. Third sentence.',
            labeledBy: 'reviewer',
            labeledAt: '2026-04-29T00:00:00.000Z',
        }).some(issue => issue.includes('reviewedBy')));
    });
    it('parses and validates broken categories from CLI input', () => {
        const categories = (0, label_rules_1.parseBrokenCategories)('regression, cheat-test-modification');
        assert_1.strict.deepEqual(categories, ['regression', 'cheat-test-modification']);
        assert_1.strict.deepEqual((0, label_rules_1.validateGroundTruthLabel)({
            verdict: 'broken',
            rationale: 'First sentence. Second sentence. Third sentence.',
            brokenCategories: categories,
            labeledBy: 'reviewer',
            labeledAt: '2026-04-29T00:00:00.000Z',
        }), []);
    });
    it('writes labels and refuses overwrite without replace', async () => {
        const labelsDir = path.join(tmpDir, 'labels');
        const label = cleanLabel();
        const labelPath = await (0, label_store_1.writeLabel)(labelsDir, 'entry-1', label);
        assert_1.strict.equal(path.isAbsolute(labelPath), true);
        assert_1.strict.deepEqual((await (0, label_store_1.readLabel)(labelsDir, 'entry-1'))?.label, label);
        await assert_1.strict.rejects(() => (0, label_store_1.writeLabel)(labelsDir, 'entry-1', label), /--replace/);
        await (0, label_store_1.writeLabel)(labelsDir, 'entry-1', label, { replace: true });
    });
    it('builds label status rows and verdict summaries', async () => {
        const labelsDir = path.join(tmpDir, 'labels');
        const entries = [entry('entry-1'), entry('entry-2')];
        await (0, label_store_1.writeLabel)(labelsDir, 'entry-1', cleanLabel());
        const rows = await (0, label_store_1.buildLabelStatus)(entries, labelsDir);
        const summary = (0, label_store_1.summarizeLabelStatus)(rows);
        assert_1.strict.equal(rows[0].status, 'labeled');
        assert_1.strict.equal(rows[1].status, 'unlabeled');
        assert_1.strict.equal(summary.labeled, 1);
        assert_1.strict.equal(summary.unlabeled, 1);
        assert_1.strict.equal(summary['verdict:clean'], 1);
    });
});
function cleanLabel() {
    return {
        verdict: 'clean',
        rationale: 'The patch changes the requested file. It satisfies the goal without extra scope. The diff evidence supports the clean verdict.',
        labeledBy: 'reviewer',
        labeledAt: '2026-04-29T00:00:00.000Z',
    };
}
function entry(id) {
    return {
        id,
        source: 'verification-run',
        goalText: 'Fix the bug',
        repoPath: tmpPath(),
        baseCommit: '0'.repeat(40),
        patchCommit: '1'.repeat(40),
        agentIdentity: { cli: 'codex', model: 'gpt-5.4' },
        transcriptPath: tmpPath(),
        metadata: {
            capturedAt: '2026-04-29T00:00:00.000Z',
            runDir: tmpPath(),
            stepNumber: 1,
        },
    };
}
function tmpPath() {
    return path.join(os.tmpdir(), 'falsification-label-path');
}
