"use strict";
/**
 * Phase 6 streaming-verification benchmark runner. Drives a single
 * streaming goal through the population manager twice — once with
 * streaming disabled (baseline; full response generated and billed)
 * and once with streaming enabled (doomed responses abort mid-stream
 * via the configured forbidden-imports assertion).
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
exports.runStreamingGoal = runStreamingGoal;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const compiler_1 = require("../../src/contract/compiler");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const types_1 = require("../../src/session/types");
const PROJECT_CONTEXT = ('You are a persona inside the swarm-orchestrator v8 population.\n' +
    'Project context: a TypeScript monorepo with mocha tests and tsc builds.\n').repeat(800);
/**
 * Run a single streaming-verifier goal. Builds an architect response
 * sized to `goal.responseLength`; the doomed variant prepends a
 * forbidden import line so the streaming verifier aborts early.
 */
async function runStreamingGoal(goal, options) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `v8-bench6-${goal.id}-`));
    const contract = makeContract(work, goal.goal, goal.obligations);
    const architectBody = makeArchitectBody(goal);
    const session = new stub_session_1.StubSession({
        projectContext: PROJECT_CONTEXT,
        responder: (req) => buildStubResponse(req, architectBody),
        streamChunkSize: 8,
    });
    const ledgerPath = path.join(work, 'ledger.jsonl');
    const ledger = new jsonl_ledger_1.JsonlLedger(ledgerPath, goal.id);
    const runOptions = {
        contract,
        repoRoot: work,
        registry: (0, persona_registry_1.createDefaultRegistry)(),
        session,
        ledger,
        mode: 'single',
        // Phase 6 floor only — leave Phase 4/5 features off so the
        // benchmark cleanly attributes savings to streaming.
        preGeneration: false,
        postMerge: false,
    };
    if (options.streaming) {
        runOptions.streaming = { forbiddenImports: goal.forbiddenImports };
    }
    const result = await (0, manager_1.runPopulation)(runOptions);
    const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
    const candidateRecordedCount = entries.filter((e) => e.type === 'candidate-recorded').length;
    const candidateStreamAbortedCount = entries.filter((e) => e.type === 'candidate-stream-aborted').length;
    return {
        goalId: goal.id,
        obligationCount: contract.obligations.length,
        satisfied: result.satisfied,
        failed: result.failed,
        streamingAbortedCandidates: result.streamingAbortedCandidates,
        streamingCharsBeforeAbort: result.streamingCharsBeforeAbort,
        preVerifiedObligations: result.preVerifiedObligations,
        candidateRecordedCount,
        candidateStreamAbortedCount,
        totalUsage: result.totalUsage,
        effectiveInput: (0, types_1.effectiveInputTokens)(result.totalUsage),
        cacheHitRate: (0, types_1.cacheHitRate)(result.totalUsage),
        wallTimeMs: result.wallTimeMs,
    };
}
function makeContract(repoRoot, goal, obligations) {
    return (0, compiler_1.finalize)({
        schemaVersion: 'v1',
        goal,
        repoContext: { repoRoot, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
        obligations,
        extractor: { name: 'bench-stub', model: null, temperature: null, promptSha256: null },
    });
}
/**
 * Architect persona response body. The doomed variant places the
 * forbidden import in the first line so the streaming verifier aborts
 * after a small number of chunks; the clean variant generates a body
 * of the same total length without the forbidden line.
 */
function makeArchitectBody(goal) {
    const filler = Array.from({ length: Math.max(1, Math.floor(goal.responseLength / 32)) })
        .map((_, i) => `export const v${i} = ${i};`)
        .join('\n');
    if (goal.doomed) {
        return `import doomed from '${goal.forbiddenImports[0] ?? 'doomed-pkg'}'\n${filler}`;
    }
    return filler;
}
function buildStubResponse(req, architectBody) {
    if (req.personaId === 'architect')
        return architectBody;
    return 'no-op';
}
