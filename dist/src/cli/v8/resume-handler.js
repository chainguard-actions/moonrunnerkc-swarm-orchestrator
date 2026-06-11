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
exports.handleResume = handleResume;
exports.parseResumeFlags = parseResumeFlags;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
const serializer_1 = require("../../contract/serializer");
const ledger_1 = require("../../ledger/ledger");
const memoization_1 = require("../../ledger/memoization");
const resume_1 = require("../../ledger/resume");
const persona_registry_1 = require("../../persona/persona-registry");
const manager_1 = require("../../population/manager");
const factory_1 = require("../../session/factory");
const types_1 = require("../../session/types");
const wasm_1 = require("../../wasm");
const local_provider_flags_1 = require("./local-provider-flags");
const argv_schema_1 = require("./argv-schema");
const provider_config_1 = require("../../config/provider-config");
const grammar_resolve_1 = require("./grammar-resolve");
const logger = (0, logger_1.getLogger)('cli:v8:resume');
const DEFAULT_PROJECT_CONTEXT_PREAMBLE = 'You are a persona inside the swarm-orchestrator v8 population. ' +
    'Multiple personas share this prefix; per-call instructions follow.';
/**
 * Implementation of `swarm v8 resume <run-id> [flags]`.
 *
 * Returns an exit code:
 *   0 — every remaining obligation satisfied (or all already satisfied)
 *   1 — argv parsing or runtime error
 *   2 — at least one obligation failed verification
 *   3 — missing API key for the default session
 *   4 — ledger chain is tampered; resume aborts
 *   5 — resume preconditions not met (no matching prior run, etc.)
 */
async function handleResume(argv, injections = {}) {
    let flags;
    try {
        flags = parseResumeFlags(argv);
    }
    catch (err) {
        logger.error(err.message);
        printResumeUsage();
        return 1;
    }
    const repoRoot = path.resolve(flags.repoRoot);
    let ledgerPath = flags.ledgerPath
        ? path.resolve(flags.ledgerPath)
        : path.join(repoRoot, '.swarm', 'ledger', `${flags.runId}.jsonl`);
    if (!fs.existsSync(ledgerPath)) {
        // If the exact path is missing, scan .swarm/ledger for any .jsonl file
        // whose first line is a run-started entry with a matching run id. This
        // covers resumes of runs that wrote to a custom --ledger name.
        const ledgerDir = path.join(repoRoot, '.swarm', 'ledger');
        if (fs.existsSync(ledgerDir)) {
            for (const name of fs.readdirSync(ledgerDir)) {
                if (!name.endsWith('.jsonl'))
                    continue;
                const candidate = path.join(ledgerDir, name);
                try {
                    const firstLine = fs.readFileSync(candidate, 'utf8').split('\n')[0];
                    if (firstLine) {
                        const entry = JSON.parse(firstLine);
                        if (entry.runId === flags.runId || entry.id === flags.runId) {
                            ledgerPath = candidate;
                            break;
                        }
                    }
                }
                catch {
                    // skip unreadable or malformed ledger files
                }
            }
        }
    }
    if (!fs.existsSync(ledgerPath)) {
        logger.error(`ledger not found at ${ledgerPath}`);
        return 1;
    }
    // Verify the chain BEFORE reading any decisions out of it. Tampered
    // ledgers are not a valid resume source.
    let priorEntries;
    try {
        priorEntries = (0, ledger_1.readEntries)(ledgerPath);
        (0, ledger_1.verifyChainEntries)(priorEntries);
    }
    catch (err) {
        if (err instanceof ledger_1.ChainTamperedError) {
            logger.error(`ledger chain integrity check failed at line ${err.lineNumber}: ${err.message}`);
            return 4;
        }
        logger.error(`failed to read ledger ${ledgerPath}: ${err.message}`);
        return 1;
    }
    // Resolve the contract directory. Default discovery: walk back the
    // ledger to find a run-started entry whose contractId we can map to
    // `<repo>/.swarm/contracts/<id>/`.
    let contractPath = flags.contractPath;
    if (contractPath === null) {
        const inferred = inferContractPath(repoRoot, priorEntries);
        if (inferred === null) {
            logger.error('could not infer contract path; pass --contract <dir> pointing at the contract used for the prior run');
            return 1;
        }
        contractPath = inferred;
    }
    let contract;
    try {
        contract = (0, serializer_1.readContract)(contractPath);
    }
    catch (err) {
        logger.error(`failed to read contract at ${contractPath}: ${err.message}`);
        return 1;
    }
    let resumeState;
    try {
        resumeState = (0, resume_1.deriveResumeState)(priorEntries, contract);
    }
    catch (err) {
        if (err instanceof resume_1.ResumeError) {
            logger.error(`resume precondition failed (${err.code}): ${err.message}`);
            return 5;
        }
        logger.error(`failed to derive resume state: ${err.message}`);
        return 1;
    }
    logger.info(`resume id:     ${flags.runId}`);
    logger.info(`contract:      ${contractPath}`);
    logger.info(`contract hash: ${resumeState.contractHash}`);
    logger.info(`already satisfied: ${resumeState.satisfiedIndexes.size}/${contract.obligations.length}`);
    logger.info(`pending:       ${resumeState.pendingIndexes.size}`);
    logger.info(`prior failed:  ${resumeState.failedIndexes.size} (will retry)`);
    // Short-circuit: nothing to resume. Skip session construction (which
    // would otherwise demand a patch source) and exit cleanly.
    if (resumeState.pendingIndexes.size === 0 && resumeState.failedIndexes.size === 0) {
        logger.info('nothing to resume; all obligations already satisfied.');
        return 0;
    }
    // Open the ledger for append. The constructor verifies the chain
    // again and inherits the next seq number from the on-disk tail.
    const ledger = new ledger_1.HashChainedLedger(ledgerPath, flags.runId);
    ledger.append({
        type: 'run-resumed',
        contractId: contract.manifest.contractId,
        contractHash: contract.manifest.contractHash,
        resumeOf: resumeState.resumeOf,
        alreadySatisfied: resumeState.satisfiedIndexes.size,
        pending: resumeState.pendingIndexes.size,
    });
    const projectContext = renderProjectContext(contract.manifest.goal, repoRoot);
    // Precedence chain: flag > env > config > default. Fold config
    // fallback into any local-provider field still null after the flag
    // and env parsed at parseResumeFlags time; do the same for the
    // session provider when neither the flag nor the env explicitly set
    // it.
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
    let session;
    try {
        session = injections.session ?? buildSession(flags, projectContext);
    }
    catch (err) {
        logger.error(err.message);
        return 3;
    }
    const registry = injections.registry ?? (0, persona_registry_1.createDefaultRegistry)();
    const memoStore = new memoization_1.MemoStore(priorEntries);
    const wasmRuntime = injections.wasmRuntime ?? (flags.deterministic ? (0, wasm_1.createDefaultRuntime)() : undefined);
    const runOptions = {
        contract,
        repoRoot,
        registry,
        session,
        ledger,
        mode: flags.mode,
        skipObligationIndexes: resumeState.satisfiedIndexes,
        memoStore,
        preGeneration: flags.preGeneration,
        postMerge: flags.postMerge,
        falsifiers: flags.falsifiers,
    };
    if (flags.streaming) {
        runOptions.streaming = { forbiddenImports: flags.forbiddenImports };
    }
    if (wasmRuntime)
        runOptions.wasmRuntime = wasmRuntime;
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
    logger.info(`run id:        ${flags.runId} (resumed)`);
    logger.info(`mode:          ${result.mode}`);
    logger.info(`obligations:   ${result.satisfied}/${result.outcomes.length + result.memoizedObligations} satisfied`);
    logger.info(`memoized:      ${result.memoizedObligations} obligations skipped`);
    logger.info(`verifier saved:${result.verifierCallsSavedByMemoization} calls`);
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
            runId: flags.runId,
            resumeOf: resumeState.resumeOf,
            contractId: contract.manifest.contractId,
            contractHash: contract.manifest.contractHash,
            mode: result.mode,
            obligationCount: contract.obligations.length,
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
    return result.failed === 0 ? 0 : 2;
}
/**
 * Walk a ledger entry list backwards to find a `run-started` entry, then
 * try `<repo>/.swarm/contracts/<contractId>/`. Returns null when no
 * matching directory exists.
 */
function inferContractPath(repoRoot, entries) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const e = entries[i];
        if (e?.type === 'run-started') {
            const candidate = path.join(repoRoot, '.swarm', 'contracts', e.contractId);
            if (fs.existsSync(path.join(candidate, 'manifest.json'))) {
                return candidate;
            }
        }
    }
    return null;
}
function buildSession(flags, projectContext) {
    const resolution = (0, grammar_resolve_1.resolveGrammarForConsumer)('session', flags.local.grammar);
    // Only the local session reads `localGrammar`; emitting a warning when
    // the deterministic or anthropic branch would ignore the value would be
    // misleading.
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
/** Build the static project-context prefix the session caches. */
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
const RESUME_SCHEMA = {
    ...local_provider_flags_1.LOCAL_PROVIDER_FLAG_SCHEMA,
    ledger: { type: 'string' },
    contract: { type: 'string' },
    'repo-root': { type: 'string' },
    session: { type: 'string' },
    'external-patches-dir': { type: 'string' },
    'external-patches-queue': { type: 'string' },
    'external-patches-stdin': { type: 'boolean' },
    'external-patches-timeout-ms': { type: 'string' },
    model: { type: 'string' },
    'api-key': { type: 'string' },
    'command-timeout-ms': { type: 'string' },
    result: { type: 'string' },
    mode: { type: 'string' },
    candidates: { type: 'string' },
    falsifiers: { type: 'string' },
    'no-deterministic': { type: 'boolean' },
    'no-streaming': { type: 'boolean' },
    'no-post-merge': { type: 'boolean' },
    'no-pre-generation': { type: 'boolean' },
    'forbid-import': { type: 'string', multiple: true },
    'cost-cap': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
};
function parseResumeFlags(argv) {
    const { values, positionals } = (0, argv_schema_1.runParseArgs)(argv, RESUME_SCHEMA);
    if ((0, argv_schema_1.readBoolean)(values, 'help')) {
        printResumeUsage();
        throw new Error('help requested');
    }
    const repoRoot = (0, argv_schema_1.readString)(values, 'repo-root') ?? process.cwd();
    const sessionRaw = (0, argv_schema_1.readString)(values, 'session');
    const modeRaw = (0, argv_schema_1.readString)(values, 'mode');
    const candidatesRaw = (0, argv_schema_1.readString)(values, 'candidates');
    const falsifiersRaw = (0, argv_schema_1.readString)(values, 'falsifiers');
    const externalPatchesTimeoutRaw = (0, argv_schema_1.readString)(values, 'external-patches-timeout-ms');
    const commandTimeoutRaw = (0, argv_schema_1.readString)(values, 'command-timeout-ms');
    const tokenBudgetRaw = (0, argv_schema_1.readString)(values, 'cost-cap');
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
    const flags = {
        runId: '',
        ledgerPath: (0, argv_schema_1.readString)(values, 'ledger') ?? null,
        contractPath: (0, argv_schema_1.readString)(values, 'contract') ?? null,
        repoRoot,
        sessionKind: (0, factory_1.resolveSessionProvider)(sessionRaw ?? null),
        model: (0, argv_schema_1.readString)(values, 'model') ?? null,
        apiKey: (0, argv_schema_1.readString)(values, 'api-key') ?? null,
        externalPatchesDir: (0, argv_schema_1.readString)(values, 'external-patches-dir') ?? process.env.EXTERNAL_PATCHES_DIR ?? null,
        externalPatchesQueue: (0, argv_schema_1.readString)(values, 'external-patches-queue') ?? process.env.EXTERNAL_PATCHES_QUEUE ?? null,
        externalPatchesStdin: (0, argv_schema_1.readBoolean)(values, 'external-patches-stdin'),
        externalPatchesTimeoutMs: externalPatchesTimeoutRaw !== undefined
            ? (0, argv_schema_1.requireNonNegativeInt)(externalPatchesTimeoutRaw, '--external-patches-timeout-ms')
            : null,
        commandTimeoutMs: commandTimeoutRaw !== undefined
            ? (0, argv_schema_1.requirePositiveInt)(commandTimeoutRaw, '--command-timeout-ms')
            : null,
        resultPath: (0, argv_schema_1.readString)(values, 'result') ?? null,
        mode: modeRaw !== undefined ? (0, argv_schema_1.requireEnum)(modeRaw, '--mode', ['single', 'tournament']) : 'single',
        candidates: candidatesRaw !== undefined ? parseCandidates(candidatesRaw) : null,
        falsifiers: falsifiersRaw !== undefined ? (0, argv_schema_1.requireEnum)(falsifiersRaw, '--falsifiers', ['on', 'off']) : 'on',
        deterministic: !(0, argv_schema_1.readBoolean)(values, 'no-deterministic'),
        streaming: !(0, argv_schema_1.readBoolean)(values, 'no-streaming'),
        postMerge: !(0, argv_schema_1.readBoolean)(values, 'no-post-merge'),
        preGeneration: !(0, argv_schema_1.readBoolean)(values, 'no-pre-generation'),
        forbiddenImports,
        tokenBudget: tokenBudgetRaw !== undefined ? (0, argv_schema_1.requirePositiveInt)(tokenBudgetRaw, '--cost-cap') : null,
        local: (0, local_provider_flags_1.buildLocalProviderFlagValues)(values, (raw) => path.resolve(repoRoot, raw)),
        flagsSource: { sessionFromFlag: sessionRaw !== undefined },
    };
    if (positionals.length === 0) {
        throw new Error('missing run id: usage `swarm v8 resume <run-id> [flags]`');
    }
    if (positionals.length > 1) {
        throw new Error(`too many positionals: ${positionals.join(' ')}`);
    }
    flags.runId = positionals[0] ?? '';
    return flags;
}
function parseCandidates(raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 8) {
        throw new Error(`invalid --candidates "${raw}"; must be a positive integer ≤ 8`);
    }
    return n;
}
function writeResultFile(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}
function printResumeUsage() {
    process.stderr.write([
        'usage: swarm v8 resume <run-id> [flags]',
        '',
        'flags:',
        '  --ledger <path>              ledger jsonl path (default .swarm/ledger/<run-id>.jsonl)',
        '  --contract <dir>             contract dir (default inferred from ledger)',
        '  --repo-root <path>           project root (default cwd)',
        '  --session <name>             deterministic | local | anthropic (default deterministic)',
        '  --external-patches-dir <p>   watched dir of patch envelopes (deterministic session)',
        '  --external-patches-queue <p> JSONL queue of patch envelopes (deterministic session)',
        '  --external-patches-stdin     read patch envelopes from stdin (deterministic session)',
        '  --model <id>                 model id override',
        '  --api-key <key>              Anthropic API key override',
        '  --local-backend <name>       openai-compatible | ollama | llama-cpp | vllm',
        '  --local-base-url <url>       local-provider base URL',
        '  --local-model-session <id>   local-provider session model id',
        '  --local-persona-model-map <p|json>  inline JSON or path to JSON/YAML persona→model map',
        '  --local-grammar <mode>       auto | gbnf | json-schema | outlines | none (default auto)',
        '  --local-request-timeout-ms <n>  per-call timeout (default 120000)',
        '  --local-max-concurrency <n>  concurrent local-backend requests (default 1)',
        '  --local-api-key <key>        local-backend API key (when required)',
        '  --local-seed <n>             sampling seed (default 0)',
        '  --command-timeout-ms <ms>    per-command timeout (default 300000)',
        '  --result <path>              write structured run result to this JSON file',
        '  --mode single|tournament     execution mode (default single)',
        '  --candidates <n>             tournament candidates per round (1-8)',
        '  --no-deterministic           disable the WASM deterministic floor (default: enabled)',
        '  --no-streaming               disable Phase 6 streaming verification (default: enabled)',
        '  --no-pre-generation          disable Phase 6 pre-generation skip pass (default: enabled)',
        '  --no-post-merge              disable Phase 6 post-merge integration check (default: enabled)',
        '  --forbid-import <names>      comma-separated module names the streaming verifier rejects',
        '  --cost-cap <n>               output-token budget logged at end of resume',
        '  --help, -h                   show this message',
        '',
    ].join('\n'));
}
