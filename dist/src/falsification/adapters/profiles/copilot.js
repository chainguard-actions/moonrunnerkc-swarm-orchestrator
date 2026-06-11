"use strict";
// GitHub Copilot CLI profile + parser + cost. Strategy: import-graph
// perturbation and function-signature drift. Prompt templates live in
// `prompts/*.md` next to this file and are eager-loaded at module
// init via __dirname-relative fs.readFileSync. The integration test
// relaxes the per-tool grant set to `--allow-all-tools`; production
// leaves the default `['view']` in place because the prompt forbids
// tool use.
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
exports.copilotProfile = exports.COPILOT_CANDIDATE_COUNT = void 0;
exports.parseCopilotCandidates = parseCopilotCandidates;
exports.buildCopilotPrompt = buildCopilotPrompt;
exports.copilotUsdPerPremiumRequest = copilotUsdPerPremiumRequest;
exports.copilotApiEquivalentUsdPerPremiumRequest = copilotApiEquivalentUsdPerPremiumRequest;
exports.dollarsForRequestsByAuth = dollarsForRequestsByAuth;
exports.parseCopilotPremiumRequests = parseCopilotPremiumRequests;
exports.detectCopilotAuthMethod = detectCopilotAuthMethod;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cli_falsifier_1 = require("../cli-falsifier");
const candidate_runners_1 = require("../candidate-runners");
const fenced_json_1 = require("../fenced-json");
exports.COPILOT_CANDIDATE_COUNT = 3;
const DEFAULT_ALLOWED_TOOLS = ['view'];
const PRO_PLUS_USD_PER_REQUEST = 0.026;
const API_EQUIV_USD_PER_REQUEST = 0.05;
const REQUEST_LINE_RE = /^\s*Requests\s+(\d+)\s+Premium\b/m;
const PROMPTS_DIR = path.join(__dirname, 'copilot', 'prompts');
const PATH_IMPORT_GRAPH = path.join(PROMPTS_DIR, 'import-graph-must-satisfy.md');
const PATH_SIGNATURE = path.join(PROMPTS_DIR, 'function-must-have-signature.md');
const PATH_NO_CYCLES = path.join(PROMPTS_DIR, 'no-cycles.md');
const PATH_NO_UPWARD = path.join(PROMPTS_DIR, 'no-upward-imports.md');
const TPL_IMPORT_GRAPH = fs.readFileSync(PATH_IMPORT_GRAPH, 'utf8');
const TPL_SIGNATURE = fs.readFileSync(PATH_SIGNATURE, 'utf8');
const TPL_NO_CYCLES = fs.readFileSync(PATH_NO_CYCLES, 'utf8');
const TPL_NO_UPWARD = fs.readFileSync(PATH_NO_UPWARD, 'utf8');
/** Parse Copilot's stdout into a candidate list. Throws on any deviation. */
function parseCopilotCandidates(rawOutput) {
    return (0, fenced_json_1.parseFencedCandidates)(rawOutput, { label: 'Copilot', requiredCount: exports.COPILOT_CANDIDATE_COUNT });
}
/** Build the Copilot prompt for an AST-backed obligation. */
function buildCopilotPrompt(obligation) {
    if (obligation.type === 'import-graph-must-satisfy') {
        const constraintExplanation = obligation.constraint === 'no-cycles' ? TPL_NO_CYCLES : TPL_NO_UPWARD;
        return (0, cli_falsifier_1.substituteTemplate)(TPL_IMPORT_GRAPH, {
            constraint: obligation.constraint,
            scope: obligation.scope,
            candidateCount: String(exports.COPILOT_CANDIDATE_COUNT),
            constraintExplanation,
        });
    }
    return (0, cli_falsifier_1.substituteTemplate)(TPL_SIGNATURE, {
        file: obligation.file,
        name: obligation.name,
        signature: obligation.signature,
        candidateCount: String(exports.COPILOT_CANDIDATE_COUNT),
    });
}
/** Per-Premium-request USD rate (env-overridable). */
function copilotUsdPerPremiumRequest(env = process.env) {
    return readEnvUsdRate(env, 'COPILOT_USD_PER_PREMIUM_REQUEST', PRO_PLUS_USD_PER_REQUEST);
}
/** API-equivalent per-Premium-request rate (env-overridable). */
function copilotApiEquivalentUsdPerPremiumRequest(env = process.env) {
    return readEnvUsdRate(env, 'COPILOT_USD_PER_PREMIUM_REQUEST_API_EQUIV', API_EQUIV_USD_PER_REQUEST);
}
/** Compute (billed, token-estimate, api-equivalent) for `premiumRequests`. */
function dollarsForRequestsByAuth(premiumRequests, authMethod, env = process.env) {
    const tokenEstimate = round(premiumRequests * copilotUsdPerPremiumRequest(env));
    const apiEquivalent = round(premiumRequests * copilotApiEquivalentUsdPerPremiumRequest(env));
    return {
        dollarsBilled: authMethod === 'chatgpt' ? 0 : tokenEstimate,
        dollarsTokenEstimate: tokenEstimate,
        dollarsApiEquivalent: apiEquivalent,
    };
}
/** Extract Premium-request count from Copilot output; null when absent. */
function parseCopilotPremiumRequests(rawOutput) {
    if (rawOutput.length === 0)
        return null;
    const m = REQUEST_LINE_RE.exec(rawOutput);
    if (m === null)
        return null;
    const n = Number.parseInt(m[1] ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Auth-method probe. Copilot CLI is subscription-only today. */
function detectCopilotAuthMethod() {
    return 'chatgpt';
}
const astStrategy = {
    buildPrompt: buildCopilotPrompt,
    checkBaseline: candidate_runners_1.checkAstBaseline,
    parseCandidates: parseCopilotCandidates,
    runCandidate: (c, o, w) => (0, candidate_runners_1.runAstCandidate)(c, o, w, 'Copilot'),
};
exports.copilotProfile = {
    name: 'copilot',
    errorLabel: 'copilot',
    defaultBinary: 'copilot',
    defaultModel: null,
    handles: ['import-graph-must-satisfy', 'function-must-have-signature'],
    strategies: {
        'import-graph-must-satisfy': astStrategy,
        'function-must-have-signature': astStrategy,
    },
    promptTemplatePath: {
        'import-graph-must-satisfy': PATH_IMPORT_GRAPH,
        'function-must-have-signature': PATH_SIGNATURE,
    },
    promptDelivery: { kind: 'flag', flag: '-p' },
    maxOutputBytes: 1_000_000,
    notApplicableDetail: 'copilot only handles import-graph-must-satisfy and function-must-have-signature obligations',
    transientRetry: { maxAttempts: 3 },
    loggerScope: 'copilot-falsifier',
    buildArgs: ({ options }) => buildCopilotArgs(options),
    detectAuthMethod: detectCopilotAuthMethod,
    computeCost: ({ stdout, stderr, authMethod, options }) => {
        const combined = `${stdout}\n${stderr}`;
        const parser = options.premiumRequestsOverride ?? parseCopilotPremiumRequests;
        const n = parser(combined);
        if (n === null)
            return { dollarsBilled: 0, dollarsTokenEstimate: 0, dollarsApiEquivalent: 0 };
        return dollarsForRequestsByAuth(n, authMethod);
    },
    binaryMissingHint: 'Install the copilot CLI (npm i -g @github/copilot) or set CliFalsifierOptions.binaryPath.',
};
function buildCopilotArgs(options) {
    const allowedTools = options.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    const args = ['--no-ask-user', '--no-color', '--output-format', 'text', '--allow-all-paths'];
    if (allowedTools === 'all')
        args.push('--allow-all-tools');
    else
        for (const tool of allowedTools)
            args.push('--allow-tool', tool);
    if (options.model !== undefined && options.model !== null)
        args.push('--model', options.model);
    return args;
}
function readEnvUsdRate(env, key, fallback) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '')
        return fallback;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}
function round(value) {
    return Math.round(value * 1_000_000) / 1_000_000;
}
