"use strict";
// Anthropic Claude Code CLI profile + envelope parser + cost.
// Phase 4 redo (DECISIONS.md 2026-05-09): same-family control arm.
// AST obligations reuse Copilot's prompt + AST candidate runner;
// `property-must-hold` reuses Codex's prompt + shell candidate
// runner. The cross-adapter comparison is "same task, different
// model family".
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
exports.claudeCodeProfile = exports.CLAUDE_CODE_CANDIDATE_COUNT = void 0;
exports.parseClaudeCodeEnvelope = parseClaudeCodeEnvelope;
exports.parseClaudeCodeCandidates = parseClaudeCodeCandidates;
exports.detectClaudeCodeAuthMethod = detectClaudeCodeAuthMethod;
exports.dollarsForEnvelopeByAuth = dollarsForEnvelopeByAuth;
const predicate_runner_1 = require("../../../verification/predicate-runner");
const candidate_runners_1 = require("../candidate-runners");
const path = __importStar(require("path"));
const copilot_1 = require("./copilot");
const codex_1 = require("./codex");
const fenced_json_1 = require("../fenced-json");
const COPILOT_PROMPTS = path.join(__dirname, 'copilot', 'prompts');
const CODEX_PROMPTS = path.join(__dirname, 'codex', 'prompts');
exports.CLAUDE_CODE_CANDIDATE_COUNT = copilot_1.COPILOT_CANDIDATE_COUNT;
const DEFAULT_MAX_BUDGET_USD = 1.0;
/** Parse the Claude Code JSON envelope. Throws on any structural deviation. */
function parseClaudeCodeEnvelope(stdout) {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
        throw new Error('Claude Code emitted no stdout — investigate auth or binary state');
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (cause) {
        throw new Error('Claude Code stdout did not parse as a single JSON envelope. With ' +
            '--output-format json the CLI should emit one JSON object; if it instead ' +
            'streamed multiple events, the harness must be re-checked. Inspect captured ' +
            'stdout to debug.', { cause });
    }
    if (parsed === null || typeof parsed !== 'object') {
        throw new Error('Claude Code envelope was not a JSON object');
    }
    const obj = parsed;
    const usage = (obj.usage ?? {});
    return {
        type: requireString(obj, 'type'),
        subtype: requireString(obj, 'subtype'),
        isError: obj.is_error === true,
        result: typeof obj.result === 'string' ? obj.result : '',
        totalCostUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : 0,
        inputTokens: numberOrZero(usage.input_tokens),
        outputTokens: numberOrZero(usage.output_tokens),
        cacheReadInputTokens: numberOrZero(usage.cache_read_input_tokens),
        cacheCreationInputTokens: numberOrZero(usage.cache_creation_input_tokens),
        stopReason: typeof obj.stop_reason === 'string' ? obj.stop_reason : null,
        numTurns: numberOrZero(obj.num_turns),
    };
}
/** Extract the fenced candidate document from the agent's reply and validate it. */
function parseClaudeCodeCandidates(stdout) {
    const envelope = readEnvelopeForCandidates(stdout);
    if (envelope.result.length === 0) {
        throw new Error('Claude Code envelope had empty `result`. Cannot extract candidates from an empty reply.');
    }
    // Reuses the "Copilot" label so the candidate-block error surface
    // matches what the AST strategy already exposes to operators.
    return (0, fenced_json_1.parseFencedCandidates)(envelope.result, {
        label: 'Copilot',
        requiredCount: exports.CLAUDE_CODE_CANDIDATE_COUNT,
    });
}
function readEnvelopeForCandidates(stdout) {
    const envelope = parseClaudeCodeEnvelope(stdout);
    if (envelope.isError) {
        throw new Error(`Claude Code envelope reported is_error=true (subtype=${envelope.subtype}); ` +
            `agent reply: ${envelope.result.slice(0, 240)}`);
    }
    return envelope;
}
/** Infer the auth tier from the environment. */
function detectClaudeCodeAuthMethod(env = process.env) {
    const k = env.ANTHROPIC_API_KEY;
    return typeof k === 'string' && k.length > 0 ? 'api' : 'chatgpt';
}
/** Project the envelope's `total_cost_usd` into the (billed, token-estimate, api-equivalent) triple. */
function dollarsForEnvelopeByAuth(totalCostUsd, authMethod) {
    const tokenEstimate = round(totalCostUsd);
    return {
        dollarsBilled: authMethod === 'chatgpt' ? 0 : tokenEstimate,
        dollarsTokenEstimate: tokenEstimate,
        dollarsApiEquivalent: tokenEstimate,
    };
}
const astStrategy = {
    buildPrompt: copilot_1.buildCopilotPrompt,
    checkBaseline: candidate_runners_1.checkAstBaseline,
    parseCandidates: parseClaudeCodeCandidates,
    runCandidate: (c, o, w) => (0, candidate_runners_1.runAstCandidate)(c, o, w, 'Copilot'),
};
const propertyMustHoldStrategy = {
    buildPrompt: codex_1.buildCodexPrompt,
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
    parseCandidates: (stdout) => (0, codex_1.parseCodexCandidates)(readEnvelopeForCandidates(stdout).result),
    runCandidate: (c, o, w) => (0, candidate_runners_1.runShellCandidate)(c, o.predicate, w, 'Codex'),
};
exports.claudeCodeProfile = {
    name: 'claude-code',
    errorLabel: 'claude',
    defaultBinary: 'claude',
    defaultModel: null,
    handles: ['import-graph-must-satisfy', 'function-must-have-signature', 'property-must-hold'],
    strategies: {
        'import-graph-must-satisfy': astStrategy,
        'function-must-have-signature': astStrategy,
        'property-must-hold': propertyMustHoldStrategy,
    },
    promptTemplatePath: {
        'import-graph-must-satisfy': path.join(COPILOT_PROMPTS, 'import-graph-must-satisfy.md'),
        'function-must-have-signature': path.join(COPILOT_PROMPTS, 'function-must-have-signature.md'),
        'property-must-hold': path.join(CODEX_PROMPTS, 'property-must-hold.md'),
    },
    promptDelivery: { kind: 'stdin' },
    maxOutputBytes: 4_000_000,
    notApplicableDetail: 'claude-code only handles import-graph-must-satisfy, function-must-have-signature, and property-must-hold obligations',
    transientRetry: null,
    loggerScope: 'claude-code-falsifier',
    buildArgs: ({ model, workspaceRoot, options }) => buildClaudeCodeArgs(model, options, workspaceRoot),
    detectAuthMethod: () => detectClaudeCodeAuthMethod(),
    computeCost: ({ stdout, authMethod }) => dollarsForEnvelopeByAuth(parseClaudeCodeEnvelope(stdout).totalCostUsd, authMethod),
    binaryMissingHint: 'Install the claude-code CLI (npm i -g @anthropic-ai/claude-code) or set CliFalsifierOptions.binaryPath.',
};
function buildClaudeCodeArgs(model, options, workspaceRoot) {
    const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;
    const args = [
        '-p',
        '--output-format',
        'json',
        '--max-budget-usd',
        String(maxBudgetUsd),
        '--add-dir',
        workspaceRoot,
        '--no-session-persistence',
        '--exclude-dynamic-system-prompt-sections',
    ];
    if (model !== null)
        args.push('--model', model);
    return args;
}
function requireString(obj, key) {
    const v = obj[key];
    if (typeof v !== 'string') {
        throw new Error(`Claude Code envelope missing string field "${key}"`);
    }
    return v;
}
function numberOrZero(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function round(value) {
    return Math.round(value * 1_000_000) / 1_000_000;
}
