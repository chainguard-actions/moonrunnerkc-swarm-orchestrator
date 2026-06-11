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
exports.main = main;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline/promises"));
const process_1 = require("process");
const label_rules_1 = require("../label-rules");
const label_store_1 = require("../label-store");
const loader_1 = require("../loader");
/** Runs the interactive hand-labeling CLI. */
async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const corpus = await (0, loader_1.loadCorpus)(args.corpusDir);
    const entry = corpus.find(item => item.id === args.entryId);
    if (entry === undefined) {
        throw new Error(`${args.entryId} [label]: entry id not found in ${path.resolve(args.corpusDir)}`);
    }
    await printEntryForReview(entry);
    const rl = readline.createInterface({ input: process_1.stdin, output: process_1.stdout });
    try {
        await requireReadConfirmation(rl);
        const label = await promptForLabel(rl);
        const labelPath = await (0, label_store_1.writeLabel)(args.labelsDir, entry.id, label, { replace: args.replace });
        console.log(`Wrote ${labelPath}`);
    }
    finally {
        rl.close();
    }
}
async function printEntryForReview(entry) {
    console.log(label_rules_1.LABELING_RULES_PROMPT);
    console.log('\nEntry');
    console.log(`ID: ${entry.id}`);
    console.log(`Repo: ${entry.repoPath}`);
    console.log(`Base: ${entry.baseCommit}`);
    console.log(`Patch: ${entry.patchCommit}`);
    console.log('\nGoal');
    console.log(entry.goalText);
    console.log('\nPatch Diff');
    console.log(readPatchDiff(entry));
    console.log('\nTranscript');
    console.log(await fs.readFile(entry.transcriptPath, 'utf8'));
}
async function requireReadConfirmation(rl) {
    const answer = await rl.question('\nType READ to confirm you read the full patch diff and full transcript: ');
    if (answer.trim() !== 'READ') {
        throw new Error('label [confirmation]: label aborted because full-review confirmation was not provided');
    }
}
async function promptForLabel(rl) {
    const verdict = await promptVerdict(rl);
    const rationale = await promptRationale(rl);
    const brokenCategories = verdict === 'broken' ? await promptBrokenCategories(rl) : undefined;
    const labeledBy = await promptRequired(rl, 'Reviewer name: ');
    const reviewedBy = verdict === 'ambiguous'
        ? await promptRequired(rl, 'Second reviewer name (required for ambiguous): ')
        : await promptOptional(rl, 'Second reviewer name (optional unless sampled): ');
    const label = {
        verdict,
        rationale,
        ...(brokenCategories !== undefined ? { brokenCategories } : {}),
        labeledBy,
        labeledAt: new Date().toISOString(),
        ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    };
    const issues = (0, label_rules_1.validateGroundTruthLabel)(label);
    if (issues.length > 0) {
        throw new Error(`label [validation]: ${issues.join('; ')}`);
    }
    return label;
}
async function promptVerdict(rl) {
    for (;;) {
        const answer = (await rl.question('Verdict (clean / broken / ambiguous): ')).trim();
        if (answer === 'clean' || answer === 'broken' || answer === 'ambiguous') {
            return answer;
        }
        console.log('Enter clean, broken, or ambiguous.');
    }
}
async function promptRationale(rl) {
    for (;;) {
        const answer = (await rl.question('Rationale (at least three sentences): ')).trim();
        const testLabel = {
            verdict: 'clean',
            rationale: answer,
            labeledBy: 'validator',
            labeledAt: new Date().toISOString(),
        };
        if (!(0, label_rules_1.validateGroundTruthLabel)(testLabel).some(issue => issue.includes('rationale'))) {
            return answer;
        }
        console.log('Rationale must be at least three sentences with concrete patch evidence.');
    }
}
async function promptBrokenCategories(rl) {
    console.log(`Broken categories: ${label_rules_1.BROKEN_CATEGORIES.join(', ')}`);
    for (;;) {
        const answer = await rl.question('Broken categories (comma-separated): ');
        const categories = (0, label_rules_1.parseBrokenCategories)(answer);
        const issues = (0, label_rules_1.validateGroundTruthLabel)({
            verdict: 'broken',
            rationale: 'First sentence. Second sentence. Third sentence.',
            brokenCategories: categories,
            labeledBy: 'validator',
            labeledAt: new Date().toISOString(),
        });
        if (issues.length === 0)
            return categories;
        console.log(issues.join('; '));
    }
}
async function promptRequired(rl, prompt) {
    for (;;) {
        const answer = (await rl.question(prompt)).trim();
        if (answer.length > 0)
            return answer;
        console.log('This field is required.');
    }
}
async function promptOptional(rl, prompt) {
    const answer = (await rl.question(prompt)).trim();
    return answer.length > 0 ? answer : undefined;
}
function readPatchDiff(entry) {
    return (0, child_process_1.execFileSync)('git', ['diff', `${entry.baseCommit}..${entry.patchCommit}`], {
        cwd: entry.repoPath,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
function parseArgs(argv) {
    let entryId;
    let corpusDir = path.resolve('verification-runs');
    let labelsDir = path.resolve('benchmarks/falsification-corpus/labels');
    let replace = false;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--replace') {
            replace = true;
        }
        else if (arg === '--corpus') {
            corpusDir = path.resolve(requireValue(argv, i += 1, '--corpus'));
        }
        else if (arg === '--labels') {
            labelsDir = path.resolve(requireValue(argv, i += 1, '--labels'));
        }
        else if (arg?.startsWith('--')) {
            throw new Error(`label [args]: unknown option ${arg}`);
        }
        else if (entryId === undefined && arg !== undefined) {
            entryId = arg;
        }
        else {
            throw new Error('label [args]: expected exactly one entry id');
        }
    }
    if (entryId === undefined) {
        throw new Error('label [args]: usage node dist/benchmarks/falsification-corpus/cli/label.js <entryId> [--replace]');
    }
    return { entryId, corpusDir, labelsDir, replace };
}
function requireValue(argv, index, option) {
    const value = argv[index];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`label [args]: ${option} requires a value`);
    }
    return value;
}
if (require.main === module) {
    main().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
    });
}
