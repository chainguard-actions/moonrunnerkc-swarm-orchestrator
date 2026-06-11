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
exports.handleCompile = handleCompile;
exports.parseCompileFlags = parseCompileFlags;
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
const compiler_1 = require("../../contract/compiler");
const serializer_1 = require("../../contract/serializer");
const approval_1 = require("../../contract/approval");
const factory_1 = require("../../contract/extractor/factory");
const local_provider_flags_1 = require("./local-provider-flags");
const argv_schema_1 = require("./argv-schema");
const provider_config_1 = require("../../config/provider-config");
const grammar_resolve_1 = require("./grammar-resolve");
const logger = (0, logger_1.getLogger)('cli:v8:compile');
/**
 * Implementation of `swarm v8 compile <goal> [flags]`.
 *
 * Returns an exit code:
 *   0 — contract written
 *   1 — validation or runtime error
 *   2 — user rejected the contract
 *   3 — missing API key for default extractor
 */
async function handleCompile(argv, injections = {}) {
    let flags;
    try {
        flags = parseCompileFlags(argv);
    }
    catch (err) {
        logger.error(err.message);
        printCompileUsage();
        return 1;
    }
    const repoContext = (0, compiler_1.discoverRepoContext)(path.resolve(flags.repoRoot));
    // Precedence chain: flag > env > config > default. parseCompileFlags
    // already applied flag-or-env precedence at parse time (the parser
    // tracks whether --extractor was supplied via flagsSource). Fold the
    // config-file values in below env for any field neither the flag nor
    // the env set explicitly.
    try {
        const providerConfig = (0, provider_config_1.loadProviderConfig)(path.resolve(flags.repoRoot));
        flags.local = (0, local_provider_flags_1.resolveEffectiveLocalProvider)(flags.local, providerConfig.local);
        if (providerConfig.extractor &&
            !flags.flagsSource.extractorFromFlag &&
            process.env['EXTRACTOR_PROVIDER'] === undefined) {
            flags.extractor = providerConfig.extractor;
        }
    }
    catch (err) {
        logger.error(err.message);
        return 1;
    }
    let extractor;
    try {
        extractor = injections.extractor ?? buildExtractor(flags);
    }
    catch (err) {
        logger.error(err.message);
        return 3;
    }
    let draft;
    try {
        draft = await (0, compiler_1.compileGoal)({
            goal: flags.goal,
            repoContext,
            extractor,
        });
    }
    catch (err) {
        if (err instanceof compiler_1.ContractValidationError) {
            logger.error(err.message);
            return 1;
        }
        logger.error(`contract compilation failed: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
    }
    // Surface dropped tautological predicates so users see why the
    // satisfied-count from a run won't include them. Without this trace,
    // a user re-running the same goal sees a different contract size
    // and has no explanation.
    if (draft.tautologyWarnings && draft.tautologyWarnings.length > 0) {
        logger.warn(`dropped ${draft.tautologyWarnings.length} tautological obligation(s) ` +
            `(predicate already holds against the baseline workspace):`);
        for (const w of draft.tautologyWarnings) {
            const target = w.obligation.type === 'property-must-hold' ? w.obligation.target : '';
            logger.warn(`  - [${w.obligation.type}] ${target}: ${w.reason}`);
        }
    }
    let approved;
    try {
        approved = await (0, approval_1.runApproval)(draft, {
            autoApprove: flags.autoApprove,
            disableEditor: flags.disableEditor,
        });
    }
    catch (err) {
        if (err instanceof approval_1.ContractRejectedError) {
            logger.warn(err.message);
            return 2;
        }
        throw err;
    }
    const finalContract = (0, compiler_1.finalize)(approved);
    const outDir = flags.out ??
        path.join(flags.repoRoot, '.swarm', 'contracts', finalContract.manifest.contractId);
    (0, serializer_1.writeContract)(outDir, finalContract);
    logger.info(`contract written: ${outDir}`);
    logger.info(`contract id:      ${finalContract.manifest.contractId}`);
    logger.info(`contract hash:    ${finalContract.manifest.contractHash}`);
    return 0;
}
function buildExtractor(flags) {
    const resolution = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', flags.local.grammar);
    // The warning fires only when this extractor is the local one — the
    // deterministic and anthropic branches ignore `localGrammar` entirely,
    // and emitting a coercion message for a consumer that isn't reading
    // the value would be misleading.
    if (resolution.coercion && flags.extractor === 'local') {
        process.stderr.write((0, grammar_resolve_1.formatGrammarWarning)(resolution.coercion) + '\n');
    }
    return (0, factory_1.buildExtractor)({
        provider: flags.extractor,
        contractFile: flags.contractFile,
        contractModule: flags.contractModule,
        apiKey: flags.apiKey,
        model: flags.model,
        temperature: flags.temperature,
        localBackend: flags.local.backend,
        localBaseUrl: flags.local.baseUrl,
        localModel: flags.local.modelExtractor,
        localGrammar: resolution.effective,
        localSeed: flags.local.seed,
        localApiKey: flags.local.apiKey,
    });
}
const COMPILE_SCHEMA = {
    ...local_provider_flags_1.LOCAL_PROVIDER_FLAG_SCHEMA,
    yes: { type: 'boolean', short: 'y' },
    'no-editor': { type: 'boolean' },
    out: { type: 'string' },
    'repo-root': { type: 'string' },
    extractor: { type: 'string' },
    'contract-file': { type: 'string' },
    'contract-module': { type: 'string' },
    model: { type: 'string' },
    temperature: { type: 'string' },
    'api-key': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
};
/**
 * Parse `swarm v8 compile` argv. The first positional is the goal; flags
 * may appear in any order. Multiple positionals are joined with spaces so
 * unquoted goals work (`swarm v8 compile add a health check endpoint`).
 */
function parseCompileFlags(argv) {
    const { values, positionals } = (0, argv_schema_1.runParseArgs)(argv, COMPILE_SCHEMA);
    if ((0, argv_schema_1.readBoolean)(values, 'help')) {
        printCompileUsage();
        throw new Error('help requested');
    }
    const repoRoot = (0, argv_schema_1.readString)(values, 'repo-root') ?? process.cwd();
    const extractorRaw = (0, argv_schema_1.readString)(values, 'extractor');
    const temperatureRaw = (0, argv_schema_1.readString)(values, 'temperature');
    const flags = {
        goal: '',
        out: (0, argv_schema_1.readString)(values, 'out') ?? null,
        repoRoot,
        autoApprove: (0, argv_schema_1.readBoolean)(values, 'yes'),
        disableEditor: (0, argv_schema_1.readBoolean)(values, 'no-editor'),
        extractor: (0, factory_1.resolveExtractorProvider)(extractorRaw ?? null),
        contractFile: (0, argv_schema_1.readString)(values, 'contract-file') ?? null,
        contractModule: (0, argv_schema_1.readString)(values, 'contract-module') ?? null,
        model: (0, argv_schema_1.readString)(values, 'model') ?? null,
        temperature: temperatureRaw !== undefined ? (0, argv_schema_1.requireFiniteFloat)(temperatureRaw, '--temperature') : null,
        apiKey: (0, argv_schema_1.readString)(values, 'api-key') ?? null,
        local: (0, local_provider_flags_1.buildLocalProviderFlagValues)(values, (raw) => path.resolve(repoRoot, raw)),
        flagsSource: { extractorFromFlag: extractorRaw !== undefined },
    };
    if (positionals.length === 0) {
        throw new Error('missing goal: usage `swarm v8 compile <goal> [flags]`');
    }
    flags.goal = positionals.join(' ').trim();
    if (flags.goal.length === 0) {
        throw new Error('goal is empty');
    }
    return flags;
}
function printCompileUsage() {
    process.stderr.write([
        'usage: swarm v8 compile <goal> [flags]',
        '',
        'flags:',
        '  --out <dir>           where to write the contract (default .swarm/contracts/<id>/)',
        '  --repo-root <path>    project root for repo-context discovery (default cwd)',
        '  --yes, -y             auto-approve without prompting',
        '  --no-editor           disable the [e]dit option in the approval prompt',
        `  --extractor <name>    ${factory_1.EXTRACTOR_PROVIDERS.join(' | ')} (default deterministic)`,
        '  --contract-file <p>   YAML or JSON contract file (deterministic provider)',
        '  --contract-module <p> TS/JS contract module default export (deterministic provider)',
        '  --model <id>          model id override (anthropic provider)',
        '  --temperature <n>     sampling temperature override (default 0)',
        '  --api-key <key>       API key override (anthropic provider)',
        '  --local-backend <name>          openai-compatible | ollama | llama-cpp | vllm',
        '  --local-base-url <url>          local-provider base URL',
        '  --local-model-extractor <id>    local-provider extractor model id',
        '  --local-grammar <mode>          auto | json-schema | none (default auto)',
        '  --local-request-timeout-ms <n>  per-call timeout (default 120000)',
        '  --local-max-concurrency <n>     concurrent requests (default 1)',
        '  --local-api-key <key>           local-backend API key (when required)',
        '  --local-seed <n>                sampling seed (default 0)',
        '  --help, -h            show this message',
        '',
    ].join('\n'));
}
