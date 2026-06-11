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
exports.REPEATED_PROJECT_CONTEXT = void 0;
exports.runRepeatedGoal = runRepeatedGoal;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const compiler_1 = require("../../src/contract/compiler");
const jsonl_ledger_1 = require("../../src/ledger/jsonl-ledger");
const memoization_1 = require("../../src/ledger/memoization");
const persona_registry_1 = require("../../src/persona/persona-registry");
const manager_1 = require("../../src/population/manager");
const stub_session_1 = require("../../src/session/stub-session");
const types_1 = require("../../src/session/types");
/**
 * Synthetic project-context preamble matching the Phase 2 bench harness
 * (~25K tokens of cached prefix). Lifted from `run-goal.ts` to keep the
 * cache amortization shape identical across phases.
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
exports.REPEATED_PROJECT_CONTEXT = PROJECT_CONTEXT_PREAMBLE + PROJECT_CONTEXT_BODY + '\nEnd of project context.\n';
/**
 * Run a single repeated-pattern goal through the population manager. The
 * synthetic responder emits an identical architect body for every
 * file-must-exist obligation so the cross-obligation memoization layer
 * can demonstrate the savings.
 */
async function runRepeatedGoal(goal, options) {
    const projectContext = options.projectContext ?? exports.REPEATED_PROJECT_CONTEXT;
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v8-bench4-'));
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
        mode: options.mode,
    };
    if (options.memoization) {
        runOptions.memoStore = new memoization_1.MemoStore([]);
    }
    if (options.mode === 'tournament' && options.tournamentCandidates !== undefined) {
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
    return {
        goalId: goal.id,
        obligationCount: goal.obligations.length,
        satisfied: result.satisfied,
        failed: result.failed,
        memoizedObligations: result.memoizedObligations,
        verifierCallsSavedByMemoization: result.verifierCallsSavedByMemoization,
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
        // Identical body for every architect dispatch — the natural shape
        // for "the same code in N services."
        return [
            '```',
            '// stub-emitted health-check file',
            'export function healthCheck() { return 200; }',
            '```',
        ].join('\n');
    }
    return 'no-op';
}
