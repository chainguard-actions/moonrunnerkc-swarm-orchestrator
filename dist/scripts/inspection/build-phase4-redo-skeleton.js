"use strict";
/* eslint-disable no-console */
/**
 * Build the Phase 4 redo inspection.md skeleton at
 * `evidence/phase4-redo/run/config-b-prime-prime/inspection.md`,
 * focused on **ClaudeCode-unique catches** — the small set of
 * obligations that B'' (Codex + ClaudeCode) falsified but B' (Codex
 * alone) did not. That is the slice that matters for the cross-family
 * diversity question; the other slices are not load-bearing.
 *
 * The cross-family question reduces to: did ClaudeCode catch real
 * things Codex didn't? "Real" means an operator-confirmed
 * counter-example, not a predicate-runner FP and not a
 * predicate-gaming proposal that happened to flip the predicate.
 * Audit-and-corrections (DECISIONS.md 2026-05-09) ensures the
 * inspection step is at least set up; the operator commits the
 * verdicts.
 *
 * Heuristic classifier note: the existing heuristic classifier in
 * `src/falsification/inspection/heuristic-classifier.ts` covers
 * import-graph and function-signature obligations. Phase 4 redo's
 * obligations are property-must-hold, so the classifier does not
 * apply. This skeleton therefore omits a heuristic label per
 * candidate; the operator has the candidate file, the predicate, and
 * the reproducer output, which is all the inspection requires for
 * property-must-hold obligations.
 */
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
function readProgress(runDir) {
    const file = path.join(runDir, 'runtime-progress.json');
    if (!fs.existsSync(file)) {
        throw new Error(`missing runtime-progress.json at ${file}`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function fenceContent(content, lang) {
    let maxRun = 0;
    let cur = 0;
    for (const ch of content) {
        if (ch === '`') {
            cur += 1;
            if (cur > maxRun)
                maxRun = cur;
        }
        else {
            cur = 0;
        }
    }
    const fence = '`'.repeat(Math.max(3, maxRun + 1));
    return `${fence}${lang}\n${content}${content.endsWith('\n') ? '' : '\n'}${fence}`;
}
function main() {
    const obligationsPath = path.join(REPO_ROOT, 'evidence', 'phase4-redo', 'obligations.json');
    const bpDir = path.join(REPO_ROOT, 'evidence', 'phase4-redo', 'run', 'config-bp');
    const bppDir = path.join(REPO_ROOT, 'evidence', 'phase4-redo', 'run', 'config-bpp');
    const outDir = path.join(REPO_ROOT, 'evidence', 'phase4-redo', 'run', 'config-b-prime-prime');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'inspection.md');
    const sample = JSON.parse(fs.readFileSync(obligationsPath, 'utf8'));
    const obligationsById = new Map(sample.obligations.map((o) => [o.id, o]));
    const bpProgress = readProgress(bpDir);
    const bppProgress = readProgress(bppDir);
    const bpById = new Map(bpProgress.outcomes.map((o) => [o.id, o]));
    const bppById = new Map(bppProgress.outcomes.map((o) => [o.id, o]));
    // ClaudeCode-unique catch = B' passed (no falsification) AND B''
    // did not pass AND the B'' falsifying adapter list contains
    // claude-code (Codex caught nothing on this obligation in B' so any
    // B'' yield is uniquely ClaudeCode's contribution).
    const claudeUniqueIds = [];
    for (const id of obligationsById.keys()) {
        const bp = bpById.get(id);
        const bpp = bppById.get(id);
        if (bp === undefined || bpp === undefined)
            continue;
        if (bp.pass && !bpp.pass && bpp.falsifyingAdapters.includes('claude-code')) {
            claudeUniqueIds.push(id);
        }
    }
    const out = [];
    out.push("# Phase 4 redo inspection — config B'' (audit-and-corrections, 2026-05-09)");
    out.push('');
    out.push('Operator inspection of every **ClaudeCode-unique catch** from the ' +
        "Phase 4 redo Config B'' run. ClaudeCode-unique catch = B' (Codex) " +
        "passed AND B'' (Codex + ClaudeCode) did not, with ClaudeCode in " +
        "the B'' falsifying-adapter list. The cross-family-diversity " +
        'question reduces to: did ClaudeCode confirm-real catch material ' +
        'things Codex missed?');
    out.push('');
    out.push('Other slices (B\' caught it, B\'\' caught it; B\' missed AND B\'\' ' +
        'missed; both caught) are excluded from this inspection because ' +
        'they do not carry the cross-family signal. They are still ' +
        'available in `evidence/phase4-redo/run/config-bp/<id>/result.json` ' +
        'and `…/config-bpp/<id>/result.json` if needed.');
    out.push('');
    out.push(`ClaudeCode-unique catches: **${claudeUniqueIds.length}**`);
    if (claudeUniqueIds.length === 0) {
        out.push('');
        out.push('No ClaudeCode-unique catches surfaced from the run. The ' +
            'machine-claimed cross-family-diversity verdict is **confirmed** ' +
            '(zero unique yield). Operator inspection is therefore trivially ' +
            'complete (nothing to inspect); the corrected close-out in Part F ' +
            'records "0 confirmed unique catches" and pins the diversity ' +
            'thesis on the API-equivalent denominator.');
        out.push('');
    }
    else {
        out.push('');
        for (const id of claudeUniqueIds) {
            const o = obligationsById.get(id);
            const bppResultPath = path.join(bppDir, id, 'claude-code-result.json');
            out.push(`## ${id} — ${o.target} (stratum ${o.stratum})`);
            out.push('');
            out.push(`**Predicate:** \`${o.predicate.replace(/\n/g, ' ')}\``);
            out.push('');
            if (!fs.existsSync(bppResultPath)) {
                out.push(`**Note:** \`claude-code-result.json\` missing at \`${path.relative(REPO_ROOT, bppResultPath)}\`; ` +
                    'the unique-catch attribution may be wrong. Operator decides.');
                out.push('');
                continue;
            }
            const claudeResult = JSON.parse(fs.readFileSync(bppResultPath, 'utf8'));
            if (claudeResult.result.kind !== 'counter-example-input') {
                out.push(`**Note:** ClaudeCode result.kind=${claudeResult.result.kind}; ` +
                    'no counter-example to inspect. Operator decides.');
                out.push('');
                continue;
            }
            const inputs = claudeResult.result.inputs ?? [];
            out.push(`ClaudeCode reported **${inputs.length}** counter-example(s) on this ` +
                'obligation; each is a candidate for the operator to inspect.');
            out.push('');
            for (let i = 0; i < inputs.length; i++) {
                const c = inputs[i];
                out.push(`### ${id} — candidate ${i + 1}`);
                out.push('');
                out.push('**Files written by the candidate:**');
                out.push('');
                for (const file of c.files) {
                    out.push(`- \`${file.relPath}\``);
                    out.push('');
                    out.push(fenceContent(file.bytes, ''));
                    out.push('');
                }
                out.push(`**Reproducer:** \`${c.reproducer.replace(/\n/g, ' ')}\``);
                out.push('');
                out.push(`**Reproducer exit:** ${c.reproducerExitCode}`);
                out.push('');
                out.push('**Predicate-runner verdict:** captured by the harness ' +
                    '(`runCandidateAgainstPredicate` only counts a candidate when ' +
                    'the predicate exits non-zero post-apply, so the predicate-runner ' +
                    'verdict is `falsified`).');
                out.push('');
                out.push('<details><summary>Reproducer output</summary>');
                out.push('');
                out.push(fenceContent(c.reproducerOutput, ''));
                out.push('');
                out.push('</details>');
                out.push('');
                out.push('**Operator verdict:** [ ] Confirmed real failure  [ ] Predicate-gaming  [ ] Mechanical false positive');
                out.push('');
                out.push('**Operator notes:**');
                out.push('');
                out.push('---');
                out.push('');
            }
        }
    }
    out.push('## Aggregate');
    out.push('');
    out.push(`- Machine-claimed ClaudeCode-unique catches: ${claudeUniqueIds.length}`);
    out.push(`- Operator-confirmed real failures: TODO until inspection completes`);
    out.push(`- Operator-confirmed predicate-gaming: TODO until inspection completes`);
    out.push(`- Operator-confirmed mechanical false positives: TODO until inspection completes`);
    out.push('');
    out.push('**Conservation check (operator fills in):**');
    out.push('');
    out.push('machine-claimed === sum(operator categories) must hold; any ' +
        'discrepancy means a candidate was double-counted or missed.');
    out.push('');
    out.push('## Cross-family-diversity verdict (operator-confirmed)');
    out.push('');
    out.push('- 0 confirmed unique catches → cross-family-diversity thesis ' +
        '**CONFIRMED** (Codex covers the obligation surface; same-family ' +
        'ClaudeCode is redundant).');
    out.push('- ≥ 1 confirmed unique catches → cross-family-diversity thesis ' +
        '**INVALIDATED** on this obligation surface; the audit-and-corrections ' +
        'DECISIONS.md entry\'s third-adapter-revisit condition fires and ' +
        'Phase 5 returns to the table.');
    out.push('');
    out.push('## Provenance');
    out.push('');
    out.push(`- Skeleton generator: ` +
        `\`scripts/inspection/build-phase4-redo-skeleton.ts\`.`);
    out.push(`- Source artefacts: ` +
        `\`evidence/phase4-redo/run/config-bp/<id>/result.json\`, ` +
        `\`evidence/phase4-redo/run/config-bpp/<id>/result.json\`, ` +
        `\`…/claude-code-result.json\` per obligation.`);
    out.push('');
    fs.writeFileSync(outPath, out.join('\n'));
    console.log(`wrote ${path.relative(REPO_ROOT, outPath)} ` +
        `(claudecode-unique=${claudeUniqueIds.length})`);
}
main();
