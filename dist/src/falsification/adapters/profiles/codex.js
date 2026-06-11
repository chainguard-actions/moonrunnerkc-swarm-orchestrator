"use strict";
// OpenAI Codex CLI profile + prompt + parser + cost. Strategy:
// adversarial test-input generation on `property-must-hold`. Runs
// under workspace-write sandbox with `--ask-for-approval never`; the
// orchestrator re-runs the predicate locally so the dispatcher
// doesn't trust Codex's self-report.
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
exports.codexProfile = exports.CODEX_CANDIDATE_COUNT = void 0;
exports.parseCodexCandidates = parseCodexCandidates;
exports.buildCodexPrompt = buildCodexPrompt;
exports.dollarsForUsage = dollarsForUsage;
exports.dollarsForUsageByAuth = dollarsForUsageByAuth;
exports.detectCodexAuthMethod = detectCodexAuthMethod;
exports.parseCodexUsage = parseCodexUsage;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const predicate_runner_1 = require("../../../verification/predicate-runner");
const cli_falsifier_1 = require("../cli-falsifier");
const fenced_json_1 = require("../fenced-json");
const candidate_runners_1 = require("../candidate-runners");
const PATH_PROPERTY_MUST_HOLD = path.join(__dirname, 'codex', 'prompts', 'property-must-hold.md');
const TPL_PROPERTY_MUST_HOLD = fs.readFileSync(PATH_PROPERTY_MUST_HOLD, 'utf8');
exports.CODEX_CANDIDATE_COUNT = 3;
// USD per million tokens; refresh on price changes. Conservative
// fallback picks the highest output rate so unknown models never
// under-report cost.
const RATES = {
    'o4-mini': { inputUsdPerMillion: 1.1, outputUsdPerMillion: 4.4 },
    'o3-mini': { inputUsdPerMillion: 1.1, outputUsdPerMillion: 4.4 },
    'gpt-5-codex': { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10.0 },
    'gpt-4.1-mini': { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 },
};
const FALLBACK_RATE = { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10.0 };
let cachedAuthMethod = null;
/** Parse Codex's stdout into a candidate list. */
function parseCodexCandidates(rawOutput) {
    return (0, fenced_json_1.parseFencedCandidates)(rawOutput, { label: 'Codex', requiredCount: exports.CODEX_CANDIDATE_COUNT });
}
/** Build the Codex prompt for a single `property-must-hold` obligation. */
function buildCodexPrompt(o) {
    return (0, cli_falsifier_1.substituteTemplate)(TPL_PROPERTY_MUST_HOLD, {
        target: o.target,
        predicate: o.predicate,
        candidateCount: String(exports.CODEX_CANDIDATE_COUNT),
    });
}
/** Compute USD spend for a Codex call from token counts. */
function dollarsForUsage(usage) {
    const r = RATES[usage.model] ?? FALLBACK_RATE;
    const input = (usage.inputTokens / 1_000_000) * r.inputUsdPerMillion;
    const output = (usage.outputTokens / 1_000_000) * r.outputUsdPerMillion;
    return round(input + output);
}
/** Project usage into the (billed, token-estimate, api-equivalent) triple. */
function dollarsForUsageByAuth(usage, authMethod) {
    const tokenEstimate = dollarsForUsage(usage);
    return {
        dollarsBilled: authMethod === 'chatgpt' ? 0 : tokenEstimate,
        dollarsTokenEstimate: tokenEstimate,
        dollarsApiEquivalent: tokenEstimate,
    };
}
/** Probe codex auth-tier. Cached per process — auth doesn't change mid-run. */
function detectCodexAuthMethod(binaryPath = 'codex') {
    if (cachedAuthMethod !== null)
        return cachedAuthMethod;
    const r = (0, child_process_1.spawnSync)(binaryPath, ['login', 'status'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
    });
    if (r.error !== undefined)
        return 'unknown';
    cachedAuthMethod = parseAuthMethod(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
    return cachedAuthMethod;
}
/**
 * Extract token usage from Codex's stdout/stderr. Three accepted
 * formats, in priority order: input=/output= line, JSON `tokens`
 * envelope, or the 0.130.0 footer (single total bucketed as
 * outputTokens for conservative pricing).
 */
function parseCodexUsage(rawOutput, model) {
    const lineMatch = /tokens?\s*used\s*:\s*input\s*=\s*(\d+)\s+output\s*=\s*(\d+)/i.exec(rawOutput);
    if (lineMatch !== null) {
        const inputTokens = Number.parseInt(lineMatch[1] ?? '0', 10);
        const outputTokens = Number.parseInt(lineMatch[2] ?? '0', 10);
        if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
            return { inputTokens, outputTokens, model };
        }
    }
    const jsonMatch = /"tokens"\s*:\s*\{[^}]*"input"\s*:\s*(\d+)[^}]*"output"\s*:\s*(\d+)/.exec(rawOutput);
    if (jsonMatch !== null) {
        const inputTokens = Number.parseInt(jsonMatch[1] ?? '0', 10);
        const outputTokens = Number.parseInt(jsonMatch[2] ?? '0', 10);
        if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
            return { inputTokens, outputTokens, model };
        }
    }
    const totalMatch = /tokens\s+used\s*\n\s*([\d,]+)/i.exec(rawOutput);
    if (totalMatch !== null) {
        const totalTokens = Number.parseInt((totalMatch[1] ?? '0').replace(/,/g, ''), 10);
        if (Number.isFinite(totalTokens) && totalTokens >= 0) {
            return { inputTokens: 0, outputTokens: totalTokens, model };
        }
    }
    return null;
}
const propertyMustHoldStrategy = {
    buildPrompt: buildCodexPrompt,
    checkBaseline: (o, w) => {
        const b = (0, predicate_runner_1.checkPredicateBaseline)(o.predicate, w);
        return {
            ok: b.ok,
            detail: b.ok
                ? ''
                : `predicate exited ${b.exitCode} against the unmodified workspace; ` +
                    `obligation is pre-tainted. Snapshot a clean SHA or fix the predicate before retrying.`,
        };
    },
    parseCandidates: parseCodexCandidates,
    runCandidate: (c, o, w) => (0, candidate_runners_1.runShellCandidate)(c, o.predicate, w, 'Codex'),
};
exports.codexProfile = {
    name: 'codex',
    errorLabel: 'codex',
    defaultBinary: 'codex',
    defaultModel: null,
    handles: ['property-must-hold'],
    strategies: { 'property-must-hold': propertyMustHoldStrategy },
    promptTemplatePath: { 'property-must-hold': PATH_PROPERTY_MUST_HOLD },
    promptDelivery: { kind: 'positional' },
    maxOutputBytes: 1_000_000,
    notApplicableDetail: 'codex only handles property-must-hold obligations',
    transientRetry: null,
    loggerScope: 'codex-falsifier',
    buildArgs: ({ model }) => buildCodexArgs(model),
    detectAuthMethod: ({ binaryPath }) => detectCodexAuthMethod(binaryPath),
    computeCost: ({ stdout, stderr, authMethod, model }) => {
        const combined = `${stdout}\n${stderr}`;
        const observedModel = extractModelFromBanner(combined);
        const usage = parseCodexUsage(combined, observedModel ?? model ?? 'unknown');
        if (usage === null)
            return { dollarsBilled: 0, dollarsTokenEstimate: 0, dollarsApiEquivalent: 0 };
        return dollarsForUsageByAuth(usage, authMethod);
    },
    binaryMissingHint: 'Install the codex CLI or set CliFalsifierOptions.binaryPath.',
};
function buildCodexArgs(model) {
    const args = ['--ask-for-approval', 'never', '--sandbox', 'workspace-write', 'exec', '--skip-git-repo-check'];
    if (model !== null)
        args.push('--model', model);
    return args;
}
function extractModelFromBanner(output) {
    const m = /(^|\n)\s*model:\s*(\S+)/.exec(output);
    return m !== null ? m[2] ?? null : null;
}
function parseAuthMethod(output) {
    if (/logged in using chatgpt/i.test(output))
        return 'chatgpt';
    if (/logged in using api(\s+key)?/i.test(output))
        return 'api';
    if (/"auth_method"\s*:\s*"chatgpt"/i.test(output))
        return 'chatgpt';
    if (/"auth_method"\s*:\s*"api(?:_key)?"/i.test(output))
        return 'api';
    return 'unknown';
}
function round(value) {
    return Math.round(value * 1_000_000) / 1_000_000;
}
