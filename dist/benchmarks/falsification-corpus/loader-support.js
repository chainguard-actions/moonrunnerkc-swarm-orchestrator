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
exports.findRunDirs = findRunDirs;
exports.readJsonObject = readJsonObject;
exports.parseSession = parseSession;
exports.validateStepFiles = validateStepFiles;
exports.resolveStepCommits = resolveStepCommits;
exports.resolveTranscriptPath = resolveTranscriptPath;
exports.detectAgentCli = detectAgentCli;
exports.buildRunSlug = buildRunSlug;
exports.parseRunTimestamp = parseRunTimestamp;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const loader_issues_1 = require("./loader-issues");
/** Finds swarm run directories while skipping embedded repos and dependencies. */
async function findRunDirs(corpusRoot) {
    const runDirs = [];
    async function walk(current) {
        const dirents = await fs.readdir(current, { withFileTypes: true });
        for (const dirent of dirents) {
            if (!dirent.isDirectory() || shouldSkipDir(dirent.name)) {
                continue;
            }
            const next = path.join(current, dirent.name);
            if (dirent.name.startsWith('swarm-') && path.basename(path.dirname(next)) === 'runs') {
                runDirs.push(next);
                continue;
            }
            await walk(next);
        }
    }
    await walk(corpusRoot);
    return runDirs.sort();
}
/** Reads a JSON object and appends a corpus issue instead of throwing. */
async function readJsonObject(filePath, runDir, issues) {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        if (isRecord(parsed)) {
            return parsed;
        }
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, 'metadata', `${filePath} does not contain a JSON object`, 'Replace the malformed metadata file.'));
    }
    catch (error) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, 'metadata', `${filePath} could not be read: ${reasonOf(error)}`, 'Restore the missing or unreadable metadata file.'));
    }
    return undefined;
}
/** Parses the subset of session-state.json required by the corpus loader. */
function parseSession(sessionState) {
    const graph = readRecord(sessionState, 'graph');
    const goal = readString(graph, 'goal');
    const rawSteps = readArray(graph, 'steps');
    const branchMap = readStringRecord(sessionState, 'branchMap');
    const transcripts = readStringRecord(sessionState, 'transcripts');
    if (goal === undefined || rawSteps === undefined || branchMap === undefined || transcripts === undefined) {
        return undefined;
    }
    const steps = rawSteps.map(parseStep).filter((step) => step !== undefined);
    return steps.length === rawSteps.length ? { goal, steps, branchMap, transcripts } : undefined;
}
/** Validates required transcript and verification files for a single step. */
async function validateStepFiles(runDir, session, stepNumber) {
    const issues = [];
    const transcriptPath = resolveTranscriptPath(runDir, session, stepNumber);
    const verificationPath = path.join(runDir, 'verification', `step-${stepNumber}-verification.md`);
    if (!(await exists(transcriptPath))) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, `step-${stepNumber}`, `missing share.md at ${transcriptPath}`, 'Restore the step transcript or remove this step from the corpus.'));
    }
    if (!(await exists(verificationPath))) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, `step-${stepNumber}`, `missing verification report at ${verificationPath}`, 'Restore verification/step-N-verification.md for this step.'));
    }
    return issues;
}
/** Resolves base and patch commits from the branch merge associated with a step. */
function resolveStepCommits(repoPath, branchName, runDir, stepNumber, issues) {
    try {
        const branchHead = runGit(repoPath, ['rev-parse', '--verify', `refs/heads/${branchName}`]);
        const commits = readCommitGraph(repoPath);
        const merge = commits.find(commit => (commit.subject.includes(`Merge ${branchName}`) && commit.parents.includes(branchHead)));
        const fallback = commits.find(commit => commit.sha === branchHead && commit.parents.length >= 2);
        const resolved = merge ?? fallback;
        if (resolved === undefined || resolved.parents[0] === undefined) {
            issues.push((0, loader_issues_1.createCorpusIssue)(runDir, `step-${stepNumber}`, `missing merge commit for branch ${branchName}`, 'Restore the merge commit or remove this step from the corpus.'));
            return undefined;
        }
        return { baseCommit: resolved.parents[0], patchCommit: resolved.sha };
    }
    catch (error) {
        issues.push((0, loader_issues_1.createCorpusIssue)(runDir, `step-${stepNumber}`, `could not resolve git commits for branch ${branchName}: ${reasonOf(error)}`, 'Ensure the target repo has the swarm step branch and merge commit.'));
        return undefined;
    }
}
/** Resolves the transcript path recorded for a step to an absolute path. */
function resolveTranscriptPath(runDir, session, stepNumber) {
    const recorded = session.transcripts[String(stepNumber)];
    if (recorded !== undefined) {
        return path.resolve(runDir, recorded);
    }
    return path.join(runDir, 'steps', `step-${stepNumber}`, 'share.md');
}
/** Detects the agent CLI from run metadata, model attribution, and corpus path. */
function detectAgentCli(metrics, costAttribution, repoRelativePath) {
    const model = (readString(costAttribution, 'modelUsed') ?? readString(metrics, 'model') ?? '').toLowerCase();
    const evidence = `${JSON.stringify(metrics)} ${JSON.stringify(costAttribution)} ${repoRelativePath}`.toLowerCase();
    if (evidence.includes('teams'))
        return 'claude-code-teams';
    if (evidence.includes('copilot'))
        return 'copilot';
    if (evidence.includes('codex') || model.startsWith('gpt-'))
        return 'codex';
    if (evidence.includes('claude') || model.includes('claude'))
        return 'claude-code';
    return 'unknown';
}
/** Builds the stable entry id prefix for a run's repository. */
function buildRunSlug(corpusRoot, repoPath) {
    const parts = path.relative(corpusRoot, repoPath).split(path.sep).filter(Boolean);
    if (parts[0] === 'target' && parts[1] !== undefined) {
        return `round1-${sanitizeId(parts[1])}`;
    }
    if (parts[0] === 'round-2-target' && parts[1] !== undefined) {
        return `round2-${sanitizeId(parts[1])}`;
    }
    return sanitizeId(parts.join('-'));
}
/** Parses a swarm run directory timestamp into ISO-8601 format. */
function parseRunTimestamp(runName) {
    const match = /^swarm-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(runName);
    return match === null ? undefined : `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}
function readCommitGraph(repoPath) {
    return runGit(repoPath, ['log', '--all', '--format=%H%x00%P%x00%s'])
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
        const [sha = '', parentsText = '', subject = ''] = line.split('\0');
        return { sha, parents: parentsText.split(' ').filter(Boolean), subject };
    });
}
function runGit(repoPath, args) {
    return (0, child_process_1.execFileSync)('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}
function parseStep(value) {
    if (!isRecord(value) || typeof value.stepNumber !== 'number') {
        return undefined;
    }
    return { stepNumber: value.stepNumber };
}
function readRecord(record, key) {
    const value = record?.[key];
    return isRecord(value) ? value : undefined;
}
function readArray(record, key) {
    const value = record?.[key];
    return Array.isArray(value) ? value : undefined;
}
function readString(record, key) {
    const value = record?.[key];
    return typeof value === 'string' ? value : undefined;
}
function readStringRecord(record, key) {
    const value = record?.[key];
    if (!isRecord(value))
        return undefined;
    const entries = Object.entries(value);
    if (!entries.every((entry) => typeof entry[1] === 'string')) {
        return undefined;
    }
    return Object.fromEntries(entries);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function shouldSkipDir(name) {
    return name === '.git' || name === 'node_modules' || name === 'dist';
}
function sanitizeId(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
