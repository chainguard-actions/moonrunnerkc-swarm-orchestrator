"use strict";
/**
 * Phase 5 deterministic-floor benchmark runner. Drives a single goal
 * through the population manager twice — once with the WASM runtime
 * disabled (baseline) and once with it enabled (deterministic) — and
 * captures comparable cost, satisfaction, and ledger-shape metrics.
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
exports.runDeterministicGoal = runDeterministicGoal;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const compiler_1 = require("../../src/contract/compiler");
const tagger_1 = require("../../src/contract/tagger");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const types_1 = require("../../src/session/types");
const registry_1 = require("../../src/wasm/registry");
/** Cached project-context preamble matching prior phase benches. */
const PROJECT_CONTEXT = ('You are a persona inside the swarm-orchestrator v8 population.\n' +
    'Project context: a TypeScript monorepo with mocha tests and tsc builds.\n').repeat(800);
/**
 * Run a single deterministic-floor goal. Auto-tagging is on by default
 * so the §8 dispatch surface is exercised end-to-end.
 */
async function runDeterministicGoal(goal, options) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `v8-bench5-${goal.id}-`));
    const tagged = options.autoTag === false
        ? goal.obligations.slice()
        : (0, tagger_1.tagObligations)(goal.obligations, { availableStrategies: registry_1.DEFAULT_STRATEGY_NAMES });
    const contract = makeContract(work, goal.goal, tagged);
    const session = new stub_session_1.StubSession({
        projectContext: PROJECT_CONTEXT,
        responder: (req) => buildStubResponse(req),
    });
    const ledgerPath = path.join(work, 'ledger.jsonl');
    const ledger = new jsonl_ledger_1.JsonlLedger(ledgerPath, goal.id);
    const runOptions = {
        contract,
        repoRoot: work,
        registry: (0, persona_registry_1.createDefaultRegistry)(),
        session,
        ledger,
        mode: options.mode,
    };
    if (options.deterministic) {
        runOptions.wasmRuntime = (0, registry_1.createDefaultRuntime)();
    }
    const result = await (0, manager_1.runPopulation)(runOptions);
    const entries = (0, jsonl_ledger_1.readEntries)(ledgerPath);
    const candidateRecordedCount = entries.filter((e) => e.type === 'candidate-recorded').length;
    return {
        goalId: goal.id,
        obligationCount: contract.obligations.length,
        satisfied: result.satisfied,
        failed: result.failed,
        deterministicObligations: result.deterministicObligations,
        deterministicReroutes: result.deterministicReroutes,
        candidateRecordedCount,
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
function buildStubResponse(req) {
    if (req.personaId === 'tournament-verifier') {
        return JSON.stringify({ score: 0.85, rationale: 'synthetic-bench score' });
    }
    if (req.personaId === 'architect') {
        return [
            '```',
            '// stub-emitted boilerplate file',
            'export const placeholder = true;',
            '```',
        ].join('\n');
    }
    return 'no-op';
}
