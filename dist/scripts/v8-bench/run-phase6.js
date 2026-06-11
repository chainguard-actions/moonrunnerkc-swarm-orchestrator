"use strict";
/* eslint-disable no-console */
/**
 * Phase 6 §9 streaming-verification cost benchmark.
 *
 * Compares baseline (streaming disabled) against streaming (enabled
 * with forbidden-imports assertion) for a small suite of doomed-goal
 * scenarios. Two ship-gate booleans are reported and (by default)
 * enforced:
 *
 *   - **§9 (a)**: every doomed goal aborts mid-generation when streaming
 *     is enabled (`streamingAbortedCandidates > 0`).
 *   - **§9 (b)**: streaming output tokens are strictly lower than
 *     baseline output tokens on every doomed goal (token savings on
 *     aborted generations measurable in run output).
 *
 * Output: `docs/v8-phase-6-benchmark.md` plus appended rows in
 * `docs/benchmarks/v8-history.jsonl`.
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
const streaming_goals_1 = require("./streaming-goals");
const run_streaming_1 = require("./run-streaming");
function parseFlags(argv) {
    const flags = {
        outDir: path.resolve('docs'),
        jsonl: path.resolve('docs/benchmarks/v8-history.jsonl'),
        refuseOnFailure: true,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i] ?? '';
        if (a === '--out-dir') {
            flags.outDir = path.resolve(argv[++i] ?? '');
        }
        else if (a === '--jsonl') {
            flags.jsonl = path.resolve(argv[++i] ?? '');
        }
        else if (a === '--no-refuse') {
            flags.refuseOnFailure = false;
        }
        else if (a === '--help' || a === '-h') {
            process.stderr.write([
                'usage: node dist/scripts/v8-bench/run-phase6.js [flags]',
                '',
                '  --out-dir <dir>    where to write the markdown report (default ./docs)',
                '  --jsonl <path>     JSONL history append path',
                '  --no-refuse        do not exit non-zero when the §9 gates fail',
                '  --help, -h         show this message',
                '',
            ].join('\n'));
            process.exit(0);
        }
        else {
            throw new Error(`unknown flag: ${a}`);
        }
    }
    return flags;
}
async function main() {
    const flags = parseFlags(process.argv.slice(2));
    (0, streaming_goals_1.assertStreamingGoalsShape)();
    const rows = [];
    for (const goal of streaming_goals_1.STREAMING_GOALS) {
        const baseline = await (0, run_streaming_1.runStreamingGoal)(goal, { streaming: false });
        const streaming = await (0, run_streaming_1.runStreamingGoal)(goal, { streaming: true });
        const ratio = streaming.totalUsage.outputTokens === 0
            ? Infinity
            : baseline.totalUsage.outputTokens / Math.max(streaming.totalUsage.outputTokens, 1);
        rows.push({
            goal,
            baseline,
            streaming,
            outputTokenRatio: ratio,
            tokensSaved: Math.max(0, baseline.totalUsage.outputTokens - streaming.totalUsage.outputTokens),
        });
        process.stderr.write(`[bench6] ${goal.id} (doomed=${goal.doomed}): baseline-out=${baseline.totalUsage.outputTokens} streaming-out=${streaming.totalUsage.outputTokens} aborted=${streaming.streamingAbortedCandidates} ratio=${ratio.toFixed(3)}× chars-before-abort=${streaming.streamingCharsBeforeAbort}\n`);
    }
    const doomedRows = rows.filter((r) => r.goal.doomed);
    const cleanRows = rows.filter((r) => !r.goal.doomed);
    // §9 (a): every doomed goal aborts mid-generation under streaming.
    const allDoomedAbort = doomedRows.every((r) => r.streaming.streamingAbortedCandidates > 0);
    // §9 (b): streaming output tokens strictly lower on every doomed goal.
    const allCheaper = doomedRows.every((r) => r.streaming.totalUsage.outputTokens < r.baseline.totalUsage.outputTokens);
    // Quality: clean baseline runs do NOT abort (no false positives).
    const noFalseAborts = cleanRows.every((r) => r.streaming.streamingAbortedCandidates === 0);
    const report = renderReport({ rows, allDoomedAbort, allCheaper, noFalseAborts });
    const reportPath = path.join(flags.outDir, 'v8-phase-6-benchmark.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf8');
    fs.mkdirSync(path.dirname(flags.jsonl), { recursive: true });
    const ts = new Date().toISOString();
    for (const r of rows) {
        fs.appendFileSync(flags.jsonl, JSON.stringify({
            ts,
            suite: 'phase6-streaming',
            goalId: r.goal.id,
            doomed: r.goal.doomed,
            baseline: flatten(r.baseline),
            streaming: flatten(r.streaming),
            outputTokenRatio: r.outputTokenRatio,
            tokensSaved: r.tokensSaved,
        }) + '\n', 'utf8');
    }
    fs.appendFileSync(flags.jsonl, JSON.stringify({
        ts,
        suite: 'phase6-summary',
        allDoomedAbort,
        allCheaper,
        noFalseAborts,
        goalCount: rows.length,
    }) + '\n', 'utf8');
    process.stderr.write(`\n[bench6] report:  ${reportPath}\n`);
    process.stderr.write(`[bench6] history: ${flags.jsonl}\n`);
    process.stderr.write(`[bench6] every doomed goal aborts mid-generation (§9 (a)): ${allDoomedAbort ? 'PASS' : 'FAIL'}\n`);
    process.stderr.write(`[bench6] streaming output strictly lower than baseline on doomed goals (§9 (b)): ${allCheaper ? 'PASS' : 'FAIL'}\n`);
    process.stderr.write(`[bench6] clean goals do not produce false aborts: ${noFalseAborts ? 'PASS' : 'FAIL'}\n`);
    if (flags.refuseOnFailure && !(allDoomedAbort && allCheaper && noFalseAborts)) {
        process.exit(1);
    }
}
function flatten(r) {
    return {
        satisfied: r.satisfied,
        failed: r.failed,
        streamingAbortedCandidates: r.streamingAbortedCandidates,
        streamingCharsBeforeAbort: r.streamingCharsBeforeAbort,
        preVerifiedObligations: r.preVerifiedObligations,
        candidateRecordedCount: r.candidateRecordedCount,
        candidateStreamAbortedCount: r.candidateStreamAbortedCount,
        effectiveInput: r.effectiveInput,
        cacheHitRate: r.cacheHitRate,
        wallTimeMs: r.wallTimeMs,
        totalUsage: r.totalUsage,
    };
}
function renderReport(args) {
    const lines = [];
    lines.push('# Phase 6 Streaming-Verification Benchmark');
    lines.push('');
    lines.push('Generated by `node dist/scripts/v8-bench/run-phase6.js`.');
    lines.push('');
    lines.push('## Methodology');
    lines.push('');
    lines.push('Phase 6 §9 says a run with a deliberately doomed obligation aborts mid-generation rather than completing the doomed diff, and that token savings on aborted generations are measurable in run output. The benchmark compares:');
    lines.push('');
    lines.push('- **baseline**: streaming disabled (`--no-streaming`). The architect persona\'s full response is generated even when its first line names a forbidden import.');
    lines.push('- **streaming**: streaming enabled with the `forbidden-imports` assertion configured. The architect\'s response aborts after the assertion fires; the rest of the response is not generated.');
    lines.push('');
    lines.push('Each doomed goal places the forbidden import on the first line of the architect\'s response. The clean baseline goal places no forbidden import; it asserts that streaming runs do not produce false aborts.');
    lines.push('');
    lines.push('## Results');
    lines.push('');
    lines.push('| Goal | Doomed | Baseline out tokens | Streaming out tokens | Aborted | Chars before abort | Ratio (base/stream) | Tokens saved |');
    lines.push('| --- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of args.rows) {
        const ratio = Number.isFinite(r.outputTokenRatio)
            ? `${r.outputTokenRatio.toFixed(3)}×`
            : '∞';
        lines.push(`| ${r.goal.id} | ${r.goal.doomed ? 'yes' : 'no'} | ${r.baseline.totalUsage.outputTokens} | ${r.streaming.totalUsage.outputTokens} | ${r.streaming.streamingAbortedCandidates} | ${r.streaming.streamingCharsBeforeAbort} | ${ratio} | ${r.tokensSaved} |`);
    }
    lines.push('');
    lines.push('## Phase 6 §9 verdict');
    lines.push('');
    lines.push(`- **Every doomed goal aborts mid-generation when streaming is enabled (§9 (a)):** ${args.allDoomedAbort ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Streaming output tokens strictly lower than baseline on every doomed goal (§9 (b)):** ${args.allCheaper ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Clean goals do not produce false aborts:** ${args.noFalseAborts ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push('## Reproducibility');
    lines.push('');
    lines.push('    npm run build');
    lines.push('    node dist/scripts/v8-bench/run-phase6.js');
    lines.push('');
    lines.push('Re-running on the same source tree yields identical numbers because StubSession + the streaming-verifier assertions are both deterministic.');
    lines.push('');
    lines.push('## Caveats');
    lines.push('');
    lines.push('- The benchmark measures **output** tokens, not effective input tokens. Streaming primarily saves output cost: the cached prefix is paid once regardless of abort timing, but generations that get cancelled save the un-generated tail. Effective-input savings come almost entirely from the pre-generation pass (a separate Phase 6 surface) and the existing prompt cache.');
    lines.push('- The forbidden-imports assertion is a stand-in for the broader streaming-assertion surface. Production deployments would extend the assertion list per project; the benchmark exercises the abort mechanism, not the assertion library.');
    lines.push('- `chars before abort` reports characters of partial response before the verifier fired. Real-API runs would expose token counts at abort instead; the StubSession approximation uses the published 4-chars-per-token heuristic so the comparison is fair across runs.');
    lines.push('');
    return lines.join('\n');
}
main().catch((err) => {
    process.stderr.write(`[bench6] fatal: ${err.stack ?? err.message}\n`);
    process.exit(2);
});
