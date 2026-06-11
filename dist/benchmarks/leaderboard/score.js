"use strict";
// Reproducible scorer for the v10 leaderboard.
//
// Reads benchmarks/falsification-corpus/v10-corpus/index.json, replays
// every (broken, clean) pair through `runCheatDetectors`, and emits an
// aggregated JSON document under benchmarks/leaderboard/results.json
// plus a copy under docs/leaderboard/data.json that the static site
// renders.
//
// `npm run leaderboard` runs this script and exits non-zero when any
// `expectedBrokenDetected: true` case fails to fire or any clean
// control returns a blocking finding — i.e. it doubles as a Phase 1
// exit-criterion CI gate.
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
exports.scoreCorpus = scoreCorpus;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cheat_detector_1 = require("../../src/audit/cheat-detector");
function findRepoRoot(start) {
    let dir = start;
    for (let i = 0; i < 8; i += 1) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
            const text = fs.readFileSync(candidate, 'utf8');
            if (text.includes('"swarm-orchestrator"'))
                return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error(`leaderboard: could not locate repo root from ${start}`);
}
const REPO_ROOT = findRepoRoot(__dirname);
const CORPUS_ROOT = path.join(REPO_ROOT, 'benchmarks', 'falsification-corpus', 'v10-corpus');
const RESULTS_PATH = path.join(REPO_ROOT, 'benchmarks', 'leaderboard', 'results.json');
const SITE_DATA_PATH = path.join(REPO_ROOT, 'docs', 'leaderboard', 'data.json');
function loadIndex() {
    const raw = fs.readFileSync(path.join(CORPUS_ROOT, 'index.json'), 'utf8');
    return JSON.parse(raw);
}
function loadDiff(rel) {
    return fs.readFileSync(path.join(CORPUS_ROOT, rel), 'utf8');
}
function scoreCorpus() {
    const index = loadIndex();
    const failedExpectations = [];
    const caseResults = [];
    // Tracked once per run; detector versions are read off the first result.
    let detectorVersions = {};
    for (const entry of index.cases) {
        const brokenDiff = loadDiff(entry.brokenPath);
        const cleanDiff = loadDiff(entry.cleanPath);
        const brokenResult = (0, cheat_detector_1.runCheatDetectors)({ unifiedDiff: brokenDiff, repoRoot: CORPUS_ROOT });
        const cleanResult = (0, cheat_detector_1.runCheatDetectors)({ unifiedDiff: cleanDiff, repoRoot: CORPUS_ROOT });
        if (Object.keys(detectorVersions).length === 0) {
            detectorVersions = brokenResult.detectorVersions;
        }
        const brokenCaught = brokenResult.findings.some((f) => f.category === entry.category && f.severity === 'block') || brokenResult.findings.some((f) => f.category === entry.category);
        const cleanFalsePositive = cleanResult.findings.some((f) => f.category === entry.category && f.severity === 'block');
        caseResults.push({
            caseId: entry.id,
            category: entry.category,
            agentTag: entry.agentTag,
            brokenCaught,
            cleanFalsePositive,
        });
        if (!brokenCaught) {
            failedExpectations.push({
                caseId: entry.id,
                reason: `category=${entry.category} expected to be detected on broken fixture, but no finding fired`,
            });
        }
        if (cleanFalsePositive) {
            failedExpectations.push({
                caseId: entry.id,
                reason: `category=${entry.category} clean control produced a blocking finding (false positive)`,
            });
        }
    }
    const perAgent = aggregate(caseResults, (r) => r.agentTag);
    const perCategory = aggregate(caseResults, (r) => r.category);
    const perAgentCategory = aggregateBoth(caseResults);
    return {
        generatedAt: new Date().toISOString(),
        corpusGeneratedAt: index.generatedAt,
        corpusSize: index.cases.length,
        detectorVersions,
        perAgent: perAgent.map(({ key, total, caught }) => ({
            agent: key,
            total,
            caught,
            catchRate: total === 0 ? 0 : caught / total,
        })),
        perCategory: perCategory.map(({ key, total, caught }) => ({
            category: key,
            total,
            caught,
            catchRate: total === 0 ? 0 : caught / total,
        })),
        perAgentCategory,
        failedExpectations,
    };
}
function aggregate(rows, key) {
    const bucket = new Map();
    for (const r of rows) {
        const k = key(r);
        const cur = bucket.get(k) ?? { total: 0, caught: 0 };
        cur.total += 1;
        if (r.brokenCaught)
            cur.caught += 1;
        bucket.set(k, cur);
    }
    return Array.from(bucket.entries())
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => a.key.localeCompare(b.key));
}
function aggregateBoth(rows) {
    const bucket = new Map();
    for (const r of rows) {
        const k = `${r.agentTag}|${r.category}`;
        const cur = bucket.get(k) ?? { total: 0, caught: 0, cleanFalsePositives: 0 };
        cur.total += 1;
        if (r.brokenCaught)
            cur.caught += 1;
        if (r.cleanFalsePositive)
            cur.cleanFalsePositives += 1;
        bucket.set(k, cur);
    }
    return Array.from(bucket.entries())
        .map(([k, v]) => {
        const [agent, category] = k.split('|');
        return {
            agent: agent ?? '',
            category: category ?? '',
            total: v.total,
            caught: v.caught,
            cleanFalsePositives: v.cleanFalsePositives,
            catchRate: v.total === 0 ? 0 : v.caught / v.total,
        };
    })
        .sort((a, b) => a.agent.localeCompare(b.agent) || a.category.localeCompare(b.category));
}
function writeResults(out) {
    fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(SITE_DATA_PATH), { recursive: true });
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(SITE_DATA_PATH, JSON.stringify(out, null, 2) + '\n');
}
function main() {
    const out = scoreCorpus();
    writeResults(out);
    process.stdout.write(`leaderboard: ${out.corpusSize} cases, ` +
        `${out.perAgent.length} agents, ${out.perCategory.length} categories, ` +
        `${out.failedExpectations.length} failed expectation(s)\n`);
    if (out.failedExpectations.length > 0) {
        for (const f of out.failedExpectations.slice(0, 10)) {
            process.stderr.write(`  ${f.caseId}: ${f.reason}\n`);
        }
        if (out.failedExpectations.length > 10) {
            process.stderr.write(`  ... and ${out.failedExpectations.length - 10} more\n`);
        }
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
