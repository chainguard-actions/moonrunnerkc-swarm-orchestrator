"use strict";
// Public entry to the cheat-detector engine. `runCheatDetectors`
// accepts an AuditInput (already parsed diff text + repo root + optional
// PR metadata + optional agent attribution) and returns an AuditResult.
//
// New detectors register themselves below; the detector list is the
// only place that needs editing when adding a category. Each detector's
// version pins into the AuditResult.detectorVersions map so downstream
// AIBOM artifacts can attribute findings.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deadBranchInsertionDetector = exports.exceptionRethrowLostContextDetector = exports.errorSwallowDetector = exports.commentOnlyFixDetector = exports.fakeRefactorDetector = exports.coverageErosionDetector = exports.noOpFixDetector = exports.assertionStripDetector = exports.mockOfHallucinationDetector = exports.testRelaxationDetector = exports.DETECTORS = void 0;
exports.runCheatDetectors = runCheatDetectors;
const parse_diff_1 = __importDefault(require("parse-diff"));
const subject_paths_1 = require("./subject-paths");
const audit_config_1 = require("./audit-config");
const test_relaxation_1 = require("./test-relaxation");
const mock_of_hallucination_1 = require("./mock-of-hallucination");
const assertion_strip_1 = require("./assertion-strip");
const no_op_fix_1 = require("./no-op-fix");
const coverage_erosion_1 = require("./coverage-erosion");
const fake_refactor_1 = require("./fake-refactor");
const comment_only_fix_1 = require("./comment-only-fix");
const error_swallow_1 = require("./error-swallow");
const exception_rethrow_lost_context_1 = require("./exception-rethrow-lost-context");
const dead_branch_insertion_1 = require("./dead-branch-insertion");
exports.DETECTORS = [
    test_relaxation_1.testRelaxationDetector,
    mock_of_hallucination_1.mockOfHallucinationDetector,
    assertion_strip_1.assertionStripDetector,
    no_op_fix_1.noOpFixDetector,
    coverage_erosion_1.coverageErosionDetector,
    fake_refactor_1.fakeRefactorDetector,
    comment_only_fix_1.commentOnlyFixDetector,
    error_swallow_1.errorSwallowDetector,
    exception_rethrow_lost_context_1.exceptionRethrowLostContextDetector,
    dead_branch_insertion_1.deadBranchInsertionDetector,
];
function runCheatDetectors(input) {
    const allFiles = (0, parse_diff_1.default)(input.unifiedDiff);
    // Two filters compose: the built-in subject-path filter (data files
    // and conventional fixture / corpus dirs) and the project-level
    // `.swarm/audit-config.yaml` exclude list (for repos whose own
    // source legitimately contains literal cheat patterns — detector
    // tests, rule packs, generator scripts).
    const excludeFromConfig = (0, audit_config_1.buildExcludeMatcher)((0, audit_config_1.loadAuditConfig)(input.repoRoot).excludePaths);
    const files = allFiles.filter((f) => {
        const p = f.to ?? f.from ?? null;
        if (!(0, subject_paths_1.isAuditSubjectPath)(p))
            return false;
        if (p && excludeFromConfig(p))
            return false;
        return true;
    });
    const ctx = { files, repoRoot: input.repoRoot };
    const findings = [];
    const detectorVersions = {};
    for (const detector of exports.DETECTORS) {
        detectorVersions[detector.name] = detector.version;
        for (const finding of detector.run(ctx)) {
            findings.push(finding);
        }
    }
    const pass = findings.every((f) => f.severity !== 'block');
    const result = {
        pass,
        findings,
        generatedAt: new Date().toISOString(),
        detectorVersions,
    };
    if (input.agent !== undefined)
        result.agent = input.agent;
    if (input.pr !== undefined)
        result.pr = input.pr;
    return result;
}
var test_relaxation_2 = require("./test-relaxation");
Object.defineProperty(exports, "testRelaxationDetector", { enumerable: true, get: function () { return test_relaxation_2.testRelaxationDetector; } });
var mock_of_hallucination_2 = require("./mock-of-hallucination");
Object.defineProperty(exports, "mockOfHallucinationDetector", { enumerable: true, get: function () { return mock_of_hallucination_2.mockOfHallucinationDetector; } });
var assertion_strip_2 = require("./assertion-strip");
Object.defineProperty(exports, "assertionStripDetector", { enumerable: true, get: function () { return assertion_strip_2.assertionStripDetector; } });
var no_op_fix_2 = require("./no-op-fix");
Object.defineProperty(exports, "noOpFixDetector", { enumerable: true, get: function () { return no_op_fix_2.noOpFixDetector; } });
var coverage_erosion_2 = require("./coverage-erosion");
Object.defineProperty(exports, "coverageErosionDetector", { enumerable: true, get: function () { return coverage_erosion_2.coverageErosionDetector; } });
var fake_refactor_2 = require("./fake-refactor");
Object.defineProperty(exports, "fakeRefactorDetector", { enumerable: true, get: function () { return fake_refactor_2.fakeRefactorDetector; } });
var comment_only_fix_2 = require("./comment-only-fix");
Object.defineProperty(exports, "commentOnlyFixDetector", { enumerable: true, get: function () { return comment_only_fix_2.commentOnlyFixDetector; } });
var error_swallow_2 = require("./error-swallow");
Object.defineProperty(exports, "errorSwallowDetector", { enumerable: true, get: function () { return error_swallow_2.errorSwallowDetector; } });
var exception_rethrow_lost_context_2 = require("./exception-rethrow-lost-context");
Object.defineProperty(exports, "exceptionRethrowLostContextDetector", { enumerable: true, get: function () { return exception_rethrow_lost_context_2.exceptionRethrowLostContextDetector; } });
var dead_branch_insertion_2 = require("./dead-branch-insertion");
Object.defineProperty(exports, "deadBranchInsertionDetector", { enumerable: true, get: function () { return dead_branch_insertion_2.deadBranchInsertionDetector; } });
