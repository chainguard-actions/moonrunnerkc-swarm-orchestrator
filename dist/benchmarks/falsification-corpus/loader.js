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
exports.CorpusLoaderError = void 0;
exports.loadCorpus = loadCorpus;
const path = __importStar(require("path"));
const loader_issues_1 = require("./loader-issues");
const loader_support_1 = require("./loader-support");
/** Error thrown when one or more verification run directories are unrunnable. */
class CorpusLoaderError extends Error {
    issues;
    constructor(issues) {
        super((0, loader_issues_1.formatIssueMessage)(issues));
        this.name = 'CorpusLoaderError';
        this.issues = issues;
    }
}
exports.CorpusLoaderError = CorpusLoaderError;
/** Loads verification-run corpus entries without fabricating hand labels. */
async function loadCorpus(corpusDir) {
    const corpusRoot = path.resolve(corpusDir);
    const runDirs = await (0, loader_support_1.findRunDirs)(corpusRoot);
    const entries = [];
    const issues = [];
    for (const runDir of runDirs) {
        const loaded = await loadRunDir(corpusRoot, runDir);
        entries.push(...loaded.entries);
        issues.push(...loaded.issues);
    }
    for (const id of findDuplicates(entries.map(entry => entry.id))) {
        issues.push((0, loader_issues_1.createCorpusIssue)(corpusRoot, 'entry-id', `duplicate corpus entry id "${id}"`, 'Add a stable disambiguator to the corpus entry id policy.'));
    }
    if (issues.length > 0) {
        throw new CorpusLoaderError(issues);
    }
    return entries.sort((left, right) => left.id.localeCompare(right.id));
}
async function loadRunDir(corpusRoot, runDir) {
    const issues = [];
    const repoPath = path.dirname(path.dirname(runDir));
    const sessionState = await (0, loader_support_1.readJsonObject)(path.join(runDir, 'session-state.json'), runDir, issues);
    const metrics = await (0, loader_support_1.readJsonObject)(path.join(runDir, 'metrics.json'), runDir, issues);
    const costAttribution = await (0, loader_support_1.readJsonObject)(path.join(runDir, 'cost-attribution.json'), runDir, issues);
    const session = (0, loader_support_1.parseSession)(sessionState);
    const capturedAt = (0, loader_support_1.parseRunTimestamp)(path.basename(runDir));
    if (session === undefined) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, 'session-state', 'session-state.json is missing graph goal, steps, transcripts, or branchMap', 'Regenerate the run metadata or remove this run from the corpus.'));
    }
    if (capturedAt === undefined) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, 'metadata', `run directory name "${path.basename(runDir)}" does not contain a parseable swarm timestamp`, 'Use a swarm-YYYY-MM-DDTHH-mm-ss-SSSZ run directory name.'));
    }
    if (session === undefined || capturedAt === undefined) {
        return { entries: [], issues };
    }
    const entries = [];
    const model = typeof costAttribution?.modelUsed === 'string' ? costAttribution.modelUsed : undefined;
    const cli = (0, loader_support_1.detectAgentCli)(metrics, costAttribution, path.relative(corpusRoot, repoPath));
    const runSlug = (0, loader_support_1.buildRunSlug)(corpusRoot, repoPath);
    for (const step of session.steps) {
        const stepIssues = await (0, loader_support_1.validateStepFiles)(runDir, session, step.stepNumber);
        issues.push(...stepIssues);
        const branchName = session.branchMap[String(step.stepNumber)];
        if (branchName === undefined) {
            issues.push((0, loader_issues_1.createCorpusIssue)(runDir, `step-${step.stepNumber}`, 'missing branchMap entry for step', 'Restore branchMap in session-state.json.'));
            continue;
        }
        const commits = (0, loader_support_1.resolveStepCommits)(repoPath, branchName, runDir, step.stepNumber, issues);
        if (commits === undefined || stepIssues.length > 0) {
            continue;
        }
        entries.push({
            id: `${runSlug}-step-${step.stepNumber}`,
            source: 'verification-run',
            goalText: session.goal,
            repoPath,
            baseCommit: commits.baseCommit,
            patchCommit: commits.patchCommit,
            agentIdentity: model === undefined ? { cli } : { cli, model },
            transcriptPath: (0, loader_support_1.resolveTranscriptPath)(runDir, session, step.stepNumber),
            metadata: {
                capturedAt,
                runDir,
                stepNumber: step.stepNumber,
            },
        });
    }
    return { entries, issues };
}
function findDuplicates(values) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
        if (seen.has(value))
            duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates].sort();
}
