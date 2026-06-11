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
exports.BENCH_PROJECT_CONTEXT = void 0;
exports.runBenchGoal = runBenchGoal;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const compiler_1 = require("../../src/contract/compiler");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const types_1 = require("../../src/session/types");
const v6_model_1 = require("./v6-model");
/**
 * Representative project-context snapshot. Sized to mirror what v8
 * actually caches in production: a codebase summary plus recent ledger
 * highlights, ~100K characters ⇒ ~25K tokens at the 4-chars-per-token
 * estimator. The v6 model in §6 also assumes ~40K tokens of bootstrap
 * input per CLI invocation; sizing v8's cached prefix in the same range
 * keeps the comparison honest — both substrates are paying for "the
 * project," just at different cache rates.
 *
 * The exact text is filler; the size is what matters for the synthetic
 * benchmark. Real-API runs would replace this with the live project
 * summary the contract compiler discovers.
 */
const PROJECT_CONTEXT_PREAMBLE = [
    'You are a persona inside the swarm-orchestrator v8 population.',
    'Project: TypeScript monorepo. Build: tsc. Tests: mocha.',
    'Conventions: kebab-case files, named exports, 300-line ceiling, full JSDoc.',
    '',
    'Repository overview (synthetic, sized to ~25K tokens to match',
    'production cached-prefix scale):',
    '',
].join('\n');
const PROJECT_CONTEXT_BODY = ('package.json declares scripts build, test, lint, format.\n' +
    'src/contract owns goal-to-contract compilation and serialization.\n' +
    'src/persona owns persona registry and trigger predicates.\n' +
    'src/session owns the prompt-cache-native inference session.\n' +
    'src/population owns sequential and tournament-mode obligation execution.\n' +
    'src/ledger owns append-only JSONL evidence with hash-chain in Phase 4.\n' +
    'src/wasm hosts deterministic transformations under WASM sandboxing.\n' +
    'src/verification hosts pre/mid/post-generation verifiers and the run-time gate.\n').repeat(800);
exports.BENCH_PROJECT_CONTEXT = PROJECT_CONTEXT_PREAMBLE + PROJECT_CONTEXT_BODY + '\nEnd of project context.\n';
/**
 * Run a single benchmark goal. v8 path actually executes the population
 * manager against a fresh fixture using a stub session; v6 path is the
 * synthetic model from `v6-model.ts`. Both pass-rate measurements are real
 * for v8 (the manager records them); v6's pass rate is implied to be 1.0
 * because the synthetic model has no failure mode that we can attribute on
 * a per-obligation basis.
 */
async function runBenchGoal(goal, options = {}) {
    const v6Model = options.v6Model ?? v6_model_1.DEFAULT_V6_MODEL;
    const projectContext = options.projectContext ?? exports.BENCH_PROJECT_CONTEXT;
    const work = options.workRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'v8-bench-'));
    fs.mkdirSync(work, { recursive: true });
    const mode = options.mode ?? 'single';
    const contract = makeContract(work, goal.goal, goal.obligations);
    const session = new stub_session_1.StubSession({
        projectContext,
        responder: (req) => buildStubResponse(req),
    });
    const ledger = new jsonl_ledger_1.JsonlLedger(path.join(work, 'ledger.jsonl'), goal.id);
    const runOptions = {
        contract,
        repoRoot: work,
        registry: (0, persona_registry_1.createDefaultRegistry)(),
        session,
        ledger,
        mode,
    };
    if (mode === 'tournament' && options.tournamentCandidates !== undefined) {
        const n = options.tournamentCandidates;
        runOptions.tournamentConfig = {
            'file-must-exist': {
                candidatesPerRound: n,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2, 0.5, 0.8],
            },
            'build-must-pass': {
                candidatesPerRound: n,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.1, 0.4, 0.7],
            },
            'test-must-pass': {
                candidatesPerRound: n,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.1, 0.4, 0.7],
            },
        };
    }
    const result = await (0, manager_1.runPopulation)(runOptions);
    const v8Eff = (0, types_1.effectiveInputTokens)(result.totalUsage);
    const v6Usage = (0, v6_model_1.modelV6Usage)(goal.obligations, v6Model);
    const v6Eff = (0, types_1.effectiveInputTokens)(v6Usage);
    const ratio = v6Eff === 0 ? 0 : v8Eff / v6Eff;
    return {
        goalId: goal.id,
        size: goal.size,
        obligationCount: goal.obligations.length,
        satisfied: result.satisfied,
        failed: result.failed,
        v8Usage: result.totalUsage,
        v8EffectiveInput: v8Eff,
        v8WallTimeMs: result.wallTimeMs,
        v8CacheHitRate: (0, types_1.cacheHitRate)(result.totalUsage),
        v6Usage,
        v6EffectiveInput: v6Eff,
        inputRatio: ratio,
        inputReductionPct: 1 - ratio,
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
    // Tournament-verifier persona expects a strict JSON envelope with a
    // score above the threshold so the synthetic benchmark commits the
    // first candidate deterministically (see Phase 3 verifier-persona.ts).
    if (req.personaId === 'tournament-verifier') {
        return JSON.stringify({ score: 0.85, rationale: 'synthetic-bench score' });
    }
    if (req.personaId === 'architect') {
        return [
            '```',
            `// stub-emitted file for benchmark goal`,
            `// architect persona is the only synthesis path in Phase 2`,
            'export const placeholder = true;',
            '```',
        ].join('\n');
    }
    return 'no-op';
}
