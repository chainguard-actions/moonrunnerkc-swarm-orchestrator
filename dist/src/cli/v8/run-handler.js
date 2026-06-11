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
exports.handleRun = handleRun;
exports.parseRunFlags = parseRunFlags;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../../logger");
const serializer_1 = require("../../contract/serializer");
const auto_discover_1 = require("../../contract/auto-discover");
const auto_discover_2 = require("../../session/auto-discover");
const jsonl_ledger_1 = require("../../ledger/jsonl-ledger");
const persona_registry_1 = require("../../persona/persona-registry");
const manager_1 = require("../../population/manager");
const factory_1 = require("../../session/factory");
const local_provider_flags_1 = require("./local-provider-flags");
const argv_schema_1 = require("./argv-schema");
const provider_config_1 = require("../../config/provider-config");
const grammar_resolve_1 = require("./grammar-resolve");
const types_1 = require("../../session/types");
const wasm_1 = require("../../wasm");
const adapters_1 = require("../../falsification/adapters");
const snapshot_cleanup_1 = require("../../population/snapshot-cleanup");
const live_cost_tracker_1 = require("../../verification/live-cost-tracker");
const scheduler_1 = require("../../falsification/scheduler");
const pipeline_config_1 = require("../../population/pipeline-config");
const logger = (0, logger_1.getLogger)('cli:v8:run');
const DEFAULT_PROJECT_CONTEXT_PREAMBLE = 'You are a persona inside the swarm-orchestrator v8 population. ' +
    'Multiple personas share this prefix; per-call instructions follow.';
/**
 * Implementation of `swarm v8 run <contract-path> [flags]`. Returns an
 * exit code:
 *   0 — every obligation satisfied
 *   1 — argv parsing or runtime error
 *   2 — at least one obligation failed verification
 *   3 — missing API key for the default session
 */
async function handleRun(argv, injections = {}) {
    let flags;
    try {
        flags = parseRunFlags(argv);
    }
    catch (err) {
        logger.error(err.message);
        printRunUsage();
        return 1;
    }
    let contract;
    try {
        contract = (0, serializer_1.readContract)(flags.contractPath);
    }
    catch (err) {
        logger.error(`failed to read contract at ${flags.contractPath}: ${err.message}`);
        return 1;
    }
    const repoRoot = path.resolve(flags.repoRoot);
    const runId = flags.runId ?? `run-${Date.now().toString(36)}-${randomToken(6)}`;
    const ledgerPath = flags.ledgerPath ?? path.join(repoRoot, '.swarm', 'ledger', `${runId}.jsonl`);
    const projectContext = renderProjectContext(contract.manifest.goal, repoRoot);
    // Precedence chain: flag > env > config > default. Fold config
    // fallback into any local-provider field still null after the flag
    // and env parsed at parseRunFlags time; do the same for the session
    // provider when neither the flag nor the env explicitly set it.
    try {
        const providerConfig = (0, provider_config_1.loadProviderConfig)(repoRoot);
        flags.local = (0, local_provider_flags_1.resolveEffectiveLocalProvider)(flags.local, providerConfig.local);
        if (providerConfig.session &&
            !flags.flagsSource.sessionFromFlag &&
            process.env['SESSION_PROVIDER'] === undefined) {
            flags.sessionKind = providerConfig.session;
        }
    }
    catch (err) {
        logger.error(err.message);
        return 1;
    }
    if (flags.falsifiers === 'off' && !flags.falsifiersExplicitlySet) {
        logger.info('falsifiers: off (auto; deterministic provider has no adapter CLIs by default)');
    }
    let session;
    try {
        session = injections.session ?? buildSession(flags, projectContext);
    }
    catch (err) {
        logger.error(err.message);
        return 3;
    }
    const registry = injections.registry ?? (0, persona_registry_1.createDefaultRegistry)();
    const ledger = new jsonl_ledger_1.JsonlLedger(ledgerPath, runId);
    const wasmRuntime = injections.wasmRuntime ?? (flags.deterministic ? (0, wasm_1.createDefaultRuntime)() : undefined);
    // Adapter-reintegration: build the falsifier registry the population
    // manager dispatches against after each obligation. Phase 1's flag
    // plumbing in `RunFlags.falsifiers` finally wires through to the run
    // path. Tests can inject a fake (or null) via `injections.adapterRegistry`.
    const adapterRegistry = injections.adapterRegistry === null
        ? undefined
        : injections.adapterRegistry ??
            (flags.falsifiers === 'on' ? (0, adapters_1.defaultAdapterRegistry)() : undefined);
    const runOptions = {
        contract,
        repoRoot,
        registry,
        session,
        ledger,
        runId,
        mode: flags.mode,
        preGeneration: flags.preGeneration,
        postMerge: flags.postMerge,
        falsifiers: flags.falsifiers,
    };
    if (adapterRegistry)
        runOptions.adapterRegistry = adapterRegistry;
    if (flags.streaming) {
        runOptions.streaming = { forbiddenImports: flags.forbiddenImports };
    }
    if (wasmRuntime)
        runOptions.wasmRuntime = wasmRuntime;
    // Phase 7: snapshot cleanup policy. Parsed early so a malformed spec
    // surfaces before we spend tokens.
    if (flags.snapshotCleanup) {
        try {
            runOptions.snapshotCleanupPolicy = (0, snapshot_cleanup_1.parseSnapshotPolicy)(flags.snapshotCleanup);
        }
        catch (err) {
            logger.error(err.message);
            return 1;
        }
    }
    if (flags.tokenBudget !== null) {
        runOptions.costTracker = new live_cost_tracker_1.LiveCostTracker({ budgetTokens: flags.tokenBudget });
    }
    // Phase 7: adaptive falsifier scheduler. Default sequential preserves
    // historical behavior; ucb1 enables the bandit. Stats persist to
    // `.swarm/falsifier-stats.json` by default; override via flag.
    if (flags.falsifierScheduler === 'ucb1') {
        const statsPath = flags.falsifierStatsPath
            ? path.resolve(flags.falsifierStatsPath)
            : path.join(repoRoot, '.swarm', 'falsifier-stats.json');
        runOptions.falsifierScheduler = new scheduler_1.FalsifierScheduler({
            kind: 'ucb1',
            statsPath,
        });
    }
    if (flags.maxObligations !== null)
        runOptions.maxObligations = flags.maxObligations;
    if (flags.commandTimeoutMs !== null)
        runOptions.commandTimeoutMs = flags.commandTimeoutMs;
    if (flags.candidates !== null && flags.mode === 'tournament') {
        runOptions.tournamentConfig = {
            'file-must-exist': {
                candidatesPerRound: flags.candidates,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2, 0.5, 0.8],
            },
            'build-must-pass': {
                candidatesPerRound: flags.candidates,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.1, 0.4, 0.7],
            },
            'test-must-pass': {
                candidatesPerRound: flags.candidates,
                roundCap: 3,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.1, 0.4, 0.7],
            },
        };
    }
    const result = await (0, manager_1.runPopulation)(runOptions);
    const eff = (0, types_1.effectiveInputTokens)(result.totalUsage);
    const rate = (0, types_1.cacheHitRate)(result.totalUsage);
    logger.info(`run id:        ${runId}`);
    logger.info(`contract id:   ${contract.manifest.contractId}`);
    logger.info(`mode:          ${result.mode}`);
    logger.info(`obligations:   ${result.satisfied}/${result.outcomes.length} satisfied`);
    logger.info(`deterministic: ${result.deterministicObligations} satisfied / ${result.deterministicReroutes} rerouted`);
    logger.info(`pre-verified:  ${result.preVerifiedObligations} obligations`);
    logger.info(`streaming:     ${result.streamingAbortedCandidates} aborted (${result.streamingCharsBeforeAbort} chars before abort)`);
    if (result.postMerge) {
        logger.info(`post-merge:    ${result.postMerge.passed ? 'PASS' : 'FAIL'} (${result.postMerge.failedCount}/${result.postMerge.obligationCount} regressed)`);
    }
    logger.info(`tokens (in):   ${result.totalUsage.inputTokens} std + ${result.totalUsage.cacheReadTokens} cache-read + ${result.totalUsage.cacheCreationTokens} cache-write`);
    logger.info(`effective in:  ${eff.toFixed(2)} tokens`);
    logger.info(`tokens (out):  ${result.totalUsage.outputTokens}`);
    logger.info(`cache hit:     ${(rate * 100).toFixed(1)}%`);
    logger.info(`wall time:     ${result.wallTimeMs}ms`);
    logger.info(`ledger:        ${ledgerPath}`);
    if (flags.resultPath) {
        writeResultFile(flags.resultPath, {
            runId,
            contractId: contract.manifest.contractId,
            contractHash: contract.manifest.contractHash,
            mode: result.mode,
            obligationCount: result.outcomes.length,
            satisfied: result.satisfied,
            failed: result.failed,
            memoizedObligations: result.memoizedObligations,
            verifierCallsSavedByMemoization: result.verifierCallsSavedByMemoization,
            deterministicObligations: result.deterministicObligations,
            deterministicReroutes: result.deterministicReroutes,
            preVerifiedObligations: result.preVerifiedObligations,
            streamingAbortedCandidates: result.streamingAbortedCandidates,
            streamingCharsBeforeAbort: result.streamingCharsBeforeAbort,
            postMerge: result.postMerge,
            totalUsage: result.totalUsage,
            effectiveInputTokens: eff,
            cacheHitRate: rate,
            wallTimeMs: result.wallTimeMs,
            ledgerPath,
            outcomes: result.outcomes.map((o) => ({
                obligationIndex: o.obligationIndex,
                type: o.obligation.type,
                personaId: o.personaId,
                satisfied: o.satisfied,
                detail: o.detail,
                tournament: o.tournament
                    ? {
                        rounds: o.tournament.rounds.length,
                        escalated: o.tournament.escalated,
                        bestScore: o.tournament.bestScore,
                        winner: o.tournament.winner,
                        verifierCallsSavedByMemoization: o.tournament.verifierCallsSavedByMemoization,
                    }
                    : null,
            })),
        });
    }
    if (flags.tokenBudget !== null) {
        logger.info(`token budget:  ${flags.tokenBudget} output tokens (spent: ${result.totalUsage.outputTokens})`);
    }
    // Exit non-zero when any obligation regressed, even if the regression
    // was downgraded by the post-merge handler (e.g. predicate-only
    // regressions where the work is kept rather than rolled back). The
    // applied work staying in place is a rollback policy decision — it
    // does not change the fact that a contract obligation failed.
    const postMergeFailed = result.postMerge !== null && !result.postMerge.passed;
    if (result.failed === 0 && !postMergeFailed)
        return 0;
    return 2;
}
function buildSession(flags, projectContext) {
    const resolution = (0, grammar_resolve_1.resolveGrammarForConsumer)('session', flags.local.grammar);
    // Only the local session reads `localGrammar`; the deterministic and
    // anthropic branches ignore it. Emitting a coercion warning for a
    // consumer that isn't reading the value would be misleading.
    if (resolution.coercion && flags.sessionKind === 'local') {
        process.stderr.write((0, grammar_resolve_1.formatGrammarWarning)(resolution.coercion) + '\n');
    }
    const opts = {
        provider: flags.sessionKind,
        projectContext,
        apiKey: flags.apiKey,
        model: flags.model,
        externalPatchesDir: flags.externalPatchesDir,
        externalPatchesQueue: flags.externalPatchesQueue,
        externalPatchesStdin: flags.externalPatchesStdin,
        externalPatchesTimeoutMs: flags.externalPatchesTimeoutMs,
        localBackend: flags.local.backend,
        localBaseUrl: flags.local.baseUrl,
        localModel: flags.local.modelSession,
        localGrammar: resolution.effective,
        localSeed: flags.local.seed,
        localApiKey: flags.local.apiKey,
        localRequestTimeoutMs: flags.local.requestTimeoutMs,
        localMaxConcurrency: flags.local.maxConcurrency,
    };
    if (flags.local.personaModelMap)
        opts.localPersonaModelMap = flags.local.personaModelMap;
    return (0, factory_1.buildSession)(opts);
}
/**
 * Build the static project-context prefix the session caches. Phase 2's
 * version is intentionally minimal: contract goal + repo root. Phase 3+
 * will fold in per-language toolchain summaries and ledger highlights.
 */
function renderProjectContext(goal, repoRoot) {
    return [
        DEFAULT_PROJECT_CONTEXT_PREAMBLE,
        '',
        `Repository root: ${repoRoot}`,
        `User goal: ${goal}`,
        '',
        'Persona-specific instructions follow this block.',
    ].join('\n');
}
const RUN_SCHEMA = {
    ...local_provider_flags_1.LOCAL_PROVIDER_FLAG_SCHEMA,
    'repo-root': { type: 'string' },
    session: { type: 'string' },
    'external-patches-dir': { type: 'string' },
    'external-patches-queue': { type: 'string' },
    'external-patches-stdin': { type: 'boolean' },
    'external-patches-timeout-ms': { type: 'string' },
    model: { type: 'string' },
    'api-key': { type: 'string' },
    ledger: { type: 'string' },
    'max-obligations': { type: 'string' },
    'command-timeout-ms': { type: 'string' },
    'run-id': { type: 'string' },
    result: { type: 'string' },
    mode: { type: 'string' },
    candidates: { type: 'string' },
    'no-deterministic': { type: 'boolean' },
    'no-streaming': { type: 'boolean' },
    'no-post-merge': { type: 'boolean' },
    'no-pre-generation': { type: 'boolean' },
    'forbid-import': { type: 'string', multiple: true },
    'cost-cap': { type: 'string' },
    falsifiers: { type: 'string' },
    'snapshot-cleanup': { type: 'string' },
    'falsifier-scheduler': { type: 'string' },
    'falsifier-stats-path': { type: 'string' },
    preset: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
};
function parseRunFlags(argv) {
    const { values, positionals } = (0, argv_schema_1.runParseArgs)(argv, RUN_SCHEMA);
    if ((0, argv_schema_1.readBoolean)(values, 'help')) {
        printRunUsage();
        throw new Error('help requested');
    }
    const repoRoot = (0, argv_schema_1.readString)(values, 'repo-root') ?? process.cwd();
    const sessionRaw = (0, argv_schema_1.readString)(values, 'session');
    const modeRaw = (0, argv_schema_1.readString)(values, 'mode');
    const candidatesRaw = (0, argv_schema_1.readString)(values, 'candidates');
    const externalPatchesTimeoutRaw = (0, argv_schema_1.readString)(values, 'external-patches-timeout-ms');
    const maxObligationsRaw = (0, argv_schema_1.readString)(values, 'max-obligations');
    const commandTimeoutRaw = (0, argv_schema_1.readString)(values, 'command-timeout-ms');
    const tokenBudgetRaw = (0, argv_schema_1.readString)(values, 'cost-cap');
    const falsifiersRaw = (0, argv_schema_1.readString)(values, 'falsifiers');
    const falsifierSchedulerRaw = (0, argv_schema_1.readString)(values, 'falsifier-scheduler');
    const forbidImports = values['forbid-import'];
    const forbiddenImports = [];
    if (Array.isArray(forbidImports)) {
        for (const entry of forbidImports) {
            if (typeof entry !== 'string')
                continue;
            for (const part of entry.split(',')) {
                const p = part.trim();
                if (p.length > 0)
                    forbiddenImports.push(p);
            }
        }
    }
    const sessionKind = (0, factory_1.resolveSessionProvider)(sessionRaw ?? null);
    // --preset: resolve pipeline config from a named preset, with
    // per-flag overrides taking precedence.
    const presetRaw = (0, argv_schema_1.readString)(values, 'preset');
    if (presetRaw !== undefined && !pipeline_config_1.PRESET_NAMES.includes(presetRaw)) {
        throw new Error(`invalid --preset "${presetRaw}"; must be one of ${pipeline_config_1.PRESET_NAMES.join(' | ')}`);
    }
    const preset = presetRaw !== undefined ? presetRaw : null;
    // Track which pipeline flags were explicitly provided so they
    // override preset values.
    const pipelineOverrides = {};
    if (modeRaw !== undefined) {
        pipelineOverrides.mode = (0, argv_schema_1.requireEnum)(modeRaw, '--mode', ['single', 'tournament']);
    }
    if (candidatesRaw !== undefined) {
        pipelineOverrides.candidates = parseCandidates(candidatesRaw);
    }
    if ((0, argv_schema_1.readBoolean)(values, 'no-deterministic')) {
        pipelineOverrides.deterministic = false;
    }
    if ((0, argv_schema_1.readBoolean)(values, 'no-streaming')) {
        pipelineOverrides.streaming = false;
    }
    if ((0, argv_schema_1.readBoolean)(values, 'no-post-merge')) {
        pipelineOverrides.postMerge = false;
    }
    if ((0, argv_schema_1.readBoolean)(values, 'no-pre-generation')) {
        pipelineOverrides.preGeneration = false;
    }
    if (forbiddenImports.length > 0) {
        pipelineOverrides.forbiddenImports = forbiddenImports;
    }
    if (tokenBudgetRaw !== undefined) {
        pipelineOverrides.tokenBudget = (0, argv_schema_1.requirePositiveInt)(tokenBudgetRaw, '--cost-cap');
    }
    const falsifiersExplicitlySet = falsifiersRaw !== undefined;
    if (falsifiersRaw !== undefined) {
        pipelineOverrides.falsifiers = (0, argv_schema_1.requireEnum)(falsifiersRaw, '--falsifiers', ['on', 'off']);
    }
    else if (!preset) {
        // When no preset is active and the user didn't explicitly set
        // falsifiers, fall back to the session-kind-based default
        // (deterministic providers have no adapter CLIs by default).
        pipelineOverrides.falsifiers = sessionKind === 'deterministic' ? 'off' : 'on';
    }
    if (falsifierSchedulerRaw !== undefined) {
        pipelineOverrides.falsifierScheduler = (0, argv_schema_1.requireEnum)(falsifierSchedulerRaw, '--falsifier-scheduler', ['sequential', 'ucb1']);
    }
    {
        const sc = (0, argv_schema_1.readString)(values, 'snapshot-cleanup');
        if (sc !== undefined)
            pipelineOverrides.snapshotCleanup = sc;
    }
    if (maxObligationsRaw !== undefined) {
        pipelineOverrides.maxObligations = (0, argv_schema_1.requirePositiveInt)(maxObligationsRaw, '--max-obligations');
    }
    if (commandTimeoutRaw !== undefined) {
        pipelineOverrides.commandTimeoutMs = (0, argv_schema_1.requirePositiveInt)(commandTimeoutRaw, '--command-timeout-ms');
    }
    const pipelineConfig = (0, pipeline_config_1.resolvePipelineConfig)({
        preset: preset,
        overrides: pipelineOverrides,
    });
    const flags = {
        contractPath: '',
        repoRoot,
        sessionKind,
        model: (0, argv_schema_1.readString)(values, 'model') ?? null,
        apiKey: (0, argv_schema_1.readString)(values, 'api-key') ?? null,
        externalPatchesDir: (0, argv_schema_1.readString)(values, 'external-patches-dir') ?? process.env.EXTERNAL_PATCHES_DIR ?? null,
        externalPatchesQueue: (0, argv_schema_1.readString)(values, 'external-patches-queue') ?? process.env.EXTERNAL_PATCHES_QUEUE ?? null,
        externalPatchesStdin: (0, argv_schema_1.readBoolean)(values, 'external-patches-stdin'),
        externalPatchesTimeoutMs: externalPatchesTimeoutRaw !== undefined
            ? (0, argv_schema_1.requireNonNegativeInt)(externalPatchesTimeoutRaw, '--external-patches-timeout-ms')
            : null,
        ledgerPath: (0, argv_schema_1.readString)(values, 'ledger') ?? null,
        maxObligations: pipelineConfig.maxObligations,
        commandTimeoutMs: pipelineConfig.commandTimeoutMs,
        runId: (0, argv_schema_1.readString)(values, 'run-id') ?? null,
        resultPath: (0, argv_schema_1.readString)(values, 'result') ?? null,
        mode: pipelineConfig.mode,
        candidates: pipelineConfig.candidates,
        deterministic: pipelineConfig.deterministic,
        streaming: pipelineConfig.streaming,
        postMerge: pipelineConfig.postMerge,
        preGeneration: pipelineConfig.preGeneration,
        forbiddenImports: [...pipelineConfig.forbiddenImports],
        tokenBudget: pipelineConfig.tokenBudget,
        falsifiers: pipelineConfig.falsifiers,
        snapshotCleanup: pipelineConfig.snapshotCleanup,
        falsifierScheduler: pipelineConfig.falsifierScheduler,
        falsifierStatsPath: (0, argv_schema_1.readString)(values, 'falsifier-stats-path') ?? '',
        local: (0, local_provider_flags_1.buildLocalProviderFlagValues)(values, (raw) => path.resolve(repoRoot, raw)),
        flagsSource: { sessionFromFlag: sessionRaw !== undefined },
        falsifiersExplicitlySet,
        preset,
        pipelineConfig,
    };
    if (positionals.length === 0) {
        // Auto-detect contract file when no positional path provided
        const autoContract = (0, auto_discover_1.findContractFile)(repoRoot);
        if (autoContract !== undefined) {
            flags.contractPath = autoContract;
        }
        else {
            throw new Error('missing contract path: usage `swarm v8 run <contract-path> [flags]`');
        }
    }
    else if (positionals.length > 1) {
        throw new Error(`too many positionals: ${positionals.join(' ')}`);
    }
    else {
        flags.contractPath = path.resolve(positionals[0] ?? '');
    }
    // Auto-detect patches source when none explicitly provided
    if (flags.externalPatchesDir === null && flags.externalPatchesQueue === null && !flags.externalPatchesStdin) {
        const autoPatches = (0, auto_discover_2.findPatchesSource)(repoRoot);
        if (autoPatches) {
            logger.debug(`auto-detected patches source at ${autoPatches}`);
            const stat = fs.statSync(autoPatches);
            if (stat.isDirectory()) {
                flags.externalPatchesDir = autoPatches;
            }
            else {
                flags.externalPatchesQueue = autoPatches;
            }
        }
    }
    return flags;
}
function parseCandidates(raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 8) {
        throw new Error(`invalid --candidates "${raw}"; must be a positive integer ≤ 8`);
    }
    return n;
}
function randomToken(n) {
    return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}
function writeResultFile(filePath, payload) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}
function printRunUsage() {
    process.stderr.write([
        'usage: swarm v8 run <contract-path> [flags]',
        '',
        'flags:',
        '  --repo-root <path>           project root (default cwd)',
        `  --session <name>             ${factory_1.SESSION_PROVIDERS.join(' | ')} (default deterministic)`,
        '  --external-patches-dir <p>   watched dir of patch envelopes (deterministic session)',
        '  --external-patches-queue <p> JSONL queue of patch envelopes (deterministic session)',
        '  --external-patches-stdin     read patch envelopes from stdin (deterministic session)',
        '  --external-patches-timeout-ms <n>  per-call wait (default 30000 for complete)',
        '  --model <id>                 model id override (anthropic session)',
        '  --api-key <key>              API key override (anthropic session)',
        '  --local-backend <name>       openai-compatible | ollama | llama-cpp | vllm',
        '  --local-base-url <url>       local-provider base URL',
        '  --local-model-session <id>   local-provider session model id',
        '  --local-persona-model-map <p|json>  inline JSON or path to JSON/YAML persona→model map',
        '  --local-grammar <mode>       auto | gbnf | json-schema | outlines | none (default auto)',
        '  --local-request-timeout-ms <n>  per-call timeout for local backend (default 120000)',
        '  --local-max-concurrency <n>  concurrent local-backend requests (default 1)',
        '  --local-api-key <key>        local-backend API key (when required)',
        '  --local-seed <n>             sampling seed for local provider (default 0)',
        '  --ledger <path>              ledger jsonl path (default .swarm/ledger/<run-id>.jsonl)',
        '  --max-obligations <n>        cap on obligations attempted',
        '  --command-timeout-ms <ms>    per-command timeout (default 300000)',
        '  --run-id <id>                run id override (default time-based)',
        '  --result <path>              write structured run result to this JSON file',
        '  --mode single|tournament     execution mode (default single)',
        '  --candidates <n>             tournament candidates per round (1-8, type-default otherwise)',
        '  --no-deterministic           disable the WASM deterministic floor (default: enabled)',
        '  --no-streaming               disable Phase 6 streaming verification (default: enabled)',
        '  --no-pre-generation          disable Phase 6 pre-generation skip pass (default: enabled)',
        '  --no-post-merge              disable Phase 6 post-merge integration check (default: enabled)',
        '  --forbid-import <names>      comma-separated module names the streaming verifier rejects',
        '  --cost-cap <n>               live output-token ceiling (positive integer); aborts streams once projected output crosses it',
        '  --snapshot-cleanup <spec>    snapshot policy (retain-on-failure|always|never|',
        '                               retain-last:<n>|max-age:<duration>|max-disk:<size>)',
        '  --falsifier-scheduler <kind> sequential (default) | ucb1 (adaptive bandit)',
        '  --falsifier-stats-path <p>   override path for persisted bandit stats',
        '  --preset full|fast|minimal   pipeline preset (full: all features, fast: skip pre-gen+falsifiers+streaming, minimal: deterministic-only)',
        '  --help, -h                   show this message',
        '',
    ].join('\n'));
}
