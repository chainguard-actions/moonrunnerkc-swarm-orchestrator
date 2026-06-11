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
exports.LocalSession = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const logger_1 = require("../logger");
const logger = (0, logger_1.getLogger)('session:local');
/**
 * Session backed by a local inference endpoint. Each `complete()` call
 * issues one chat completion against the backend with the unified-diff
 * grammar requested when the backend supports it. Token usage is taken
 * from the backend's reported counts; when the backend doesn't report
 * (Ollama, llama.cpp without `--verbose`), `usageEstimated: true` is
 * recorded on the provider info so the ledger can flag the entry.
 *
 * Persona routing: when `personaModelMap` is set, a request's persona id
 * selects the model id over the session's default. The map is open-ended;
 * keys not present fall back to the default.
 */
class LocalSession {
    contextText;
    backend;
    defaultModel;
    personaModelMap;
    requestedGrammar;
    seed;
    cumulative = (0, types_1.emptyUsage)();
    anyEstimated = false;
    constructor(options) {
        this.contextText = options.projectContext;
        this.backend = options.backend;
        this.defaultModel = options.model;
        this.personaModelMap = options.personaModelMap ?? {};
        this.requestedGrammar = options.grammar ?? 'auto';
        this.seed = options.seed ?? 0;
    }
    projectContext() {
        return this.contextText;
    }
    totalUsage() {
        return { ...this.cumulative };
    }
    providerInfo() {
        return {
            provider: 'local',
            model: this.defaultModel,
            backend: this.backend.name,
            grammar: this.resolvedGrammarKind(),
            seed: this.seed,
            usageEstimated: this.anyEstimated,
        };
    }
    async complete(request) {
        const model = this.resolveModel(request);
        const grammar = this.selectGrammar();
        const messages = this.renderMessages(request);
        const response = await this.backend.chat({
            model,
            messages,
            temperature: request.sampling.temperature,
            maxTokens: request.sampling.maxTokens,
            seed: this.seed,
            grammar,
        });
        const usage = toSessionUsage(response.usage);
        this.cumulative = (0, types_1.addUsage)(this.cumulative, usage);
        if (response.usageEstimated)
            this.anyEstimated = true;
        return {
            text: response.text,
            usage,
            model,
            stopReason: 'end_turn',
        };
    }
    async stream(request, observer) {
        const model = this.resolveModel(request);
        const grammar = this.selectGrammar();
        const messages = this.renderMessages(request);
        let observerAbortReason = null;
        const result = await this.backend.stream({
            model,
            messages,
            temperature: request.sampling.temperature,
            maxTokens: request.sampling.maxTokens,
            seed: this.seed,
            grammar,
        }, (event) => {
            const decision = observer(toSessionStreamEvent(event));
            if (decision.kind === 'abort') {
                observerAbortReason = decision.reason;
                return false;
            }
            return true;
        });
        const usage = toSessionUsage(result.usage);
        this.cumulative = (0, types_1.addUsage)(this.cumulative, usage);
        if (result.usageEstimated)
            this.anyEstimated = true;
        const aborted = result.aborted;
        return {
            response: {
                text: result.text,
                usage,
                model,
                stopReason: aborted ? 'observer_abort' : 'end_turn',
            },
            aborted,
            abortReason: aborted ? observerAbortReason ?? 'observer aborted' : null,
        };
    }
    resolveModel(request) {
        if (request.model)
            return request.model;
        return this.personaModelMap[request.personaId] ?? this.defaultModel;
    }
    renderMessages(request) {
        const systemContent = request.personaSystemSuffix.length > 0
            ? `${this.contextText}\n\n---\n${request.personaSystemSuffix}`
            : this.contextText;
        return [
            { role: 'system', content: systemContent },
            { role: 'user', content: request.userMessage },
        ];
    }
    resolvedGrammarKind() {
        const supported = this.backend.supportsGrammar();
        if (this.requestedGrammar === 'none')
            return 'none';
        if (this.requestedGrammar === 'gbnf' && supported.includes('gbnf'))
            return 'gbnf';
        if (this.requestedGrammar === 'json-schema' && supported.includes('json-schema')) {
            return 'json-schema';
        }
        if (this.requestedGrammar === 'auto') {
            if (supported.includes('gbnf'))
                return 'gbnf';
            if (supported.includes('json-schema'))
                return 'json-schema';
            return 'none';
        }
        logger.warn(`local session: requested grammar "${this.requestedGrammar}" but backend ` +
            `"${this.backend.name}" advertises [${supported.join(', ')}]; falling back to none`);
        return 'none';
    }
    selectGrammar() {
        const kind = this.resolvedGrammarKind();
        if (kind === 'gbnf')
            return { kind: 'gbnf', grammar: loadUnifiedDiffGrammar() };
        // JSON Schema grammar for the session is intentionally unset: the
        // session's job is to emit FORMAT 1/2/3 patches, not structured JSON.
        return { kind: 'none' };
    }
}
exports.LocalSession = LocalSession;
function toSessionUsage(u) {
    return {
        inputTokens: u.inputTokens,
        cacheReadTokens: u.cacheReadTokens,
        cacheCreationTokens: u.cacheCreationTokens,
        outputTokens: u.outputTokens,
    };
}
function toSessionStreamEvent(event) {
    return {
        chunk: event.chunk,
        partialText: event.partialText,
        charsObserved: event.partialText.length,
    };
}
let cachedGrammar;
function loadUnifiedDiffGrammar() {
    if (cachedGrammar !== undefined)
        return cachedGrammar;
    const candidates = [
        path.join(__dirname, '..', 'inference', 'local', 'grammars', 'unified-diff.gbnf'),
        path.join(__dirname, '..', '..', 'src', 'inference', 'local', 'grammars', 'unified-diff.gbnf'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedGrammar = fs.readFileSync(candidate, 'utf8');
            return cachedGrammar;
        }
    }
    throw new Error('local session: unified-diff.gbnf not found; expected next to the compiled local-session module. ' +
        'Re-run `npm run build` to copy grammar files into dist/.');
}
