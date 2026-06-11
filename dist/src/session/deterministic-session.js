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
exports.DeterministicSession = void 0;
exports.validatePatchFormat = validatePatchFormat;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const DEFAULT_COMPLETE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 50;
/**
 * The deterministic session. Implements the `Session` interface without
 * generating any text. Each call pulls the next pre-staged patch envelope
 * matching the requesting persona (or the next un-tagged envelope when no
 * persona-specific one is available), validates it against FORMAT 1/2/3,
 * and returns it as the assistant text. `totalUsage()` is zero on every
 * counter; no inference happened.
 *
 * Patches that violate the strict FORMAT grammar are rejected with an error
 * identifying the malformed region; they never reach the verifier.
 *
 * @throws when no matching envelope arrives within `externalPatchesTimeoutMs`.
 * @throws when an envelope's patch text fails FORMAT 1/2/3 validation.
 */
class DeterministicSession {
    contextText;
    source;
    completeTimeoutMs;
    streamTimeoutMs;
    queue;
    queueFileCursor = 0;
    streamChunkSize;
    constructor(options) {
        this.contextText = options.projectContext;
        this.source = options.source;
        this.completeTimeoutMs = options.externalPatchesTimeoutMs ?? DEFAULT_COMPLETE_TIMEOUT_MS;
        this.streamTimeoutMs = options.externalPatchesTimeoutMs ?? Number.POSITIVE_INFINITY;
        this.queue = options.preloaded ? [...options.preloaded] : [];
        this.streamChunkSize = Math.max(1, options.streamChunkSize ?? 64);
    }
    projectContext() {
        return this.contextText;
    }
    totalUsage() {
        return (0, types_1.emptyUsage)();
    }
    providerInfo() {
        return {
            provider: 'deterministic',
            model: null,
            backend: null,
            grammar: null,
            seed: null,
            usageEstimated: false,
        };
    }
    async complete(request) {
        const envelope = await this.nextEnvelope(request.personaId, this.completeTimeoutMs);
        const text = consumeEnvelope(envelope);
        return {
            text,
            usage: (0, types_1.emptyUsage)(),
            model: 'deterministic',
            stopReason: 'end_turn',
        };
    }
    async stream(request, observer) {
        const envelope = await this.nextEnvelope(request.personaId, this.streamTimeoutMs);
        const fullText = consumeEnvelope(envelope);
        let partialText = '';
        let aborted = false;
        let abortReason = null;
        const chunkSize = this.streamChunkSize;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            const chunk = fullText.slice(i, i + chunkSize);
            partialText += chunk;
            const decision = observer({
                partialText,
                chunk,
                charsObserved: partialText.length,
            });
            if (decision.kind === 'abort') {
                aborted = true;
                abortReason = decision.reason;
                break;
            }
        }
        const finalText = aborted ? partialText : fullText;
        return {
            response: {
                text: finalText,
                usage: (0, types_1.emptyUsage)(),
                model: 'deterministic',
                stopReason: aborted ? 'observer_abort' : 'end_turn',
            },
            aborted,
            abortReason,
        };
    }
    async nextEnvelope(personaId, timeoutMs) {
        const deadline = Number.isFinite(timeoutMs) ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY;
        while (true) {
            this.refillQueue();
            const idx = matchingEnvelopeIndex(this.queue, personaId);
            if (idx >= 0) {
                const [envelope] = this.queue.splice(idx, 1);
                if (!envelope) {
                    throw new Error('internal: matchingEnvelopeIndex returned an empty slot');
                }
                return envelope;
            }
            if (Date.now() >= deadline) {
                throw new Error(`deterministic session: no external patch envelope available for persona "${personaId}" ` +
                    `within ${timeoutMs} ms. Source: ${describeSource(this.source)}.`);
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }
    refillQueue() {
        if (this.source.kind === 'dir')
            this.refillFromDir(this.source.path);
        else if (this.source.kind === 'queue')
            this.refillFromQueueFile(this.source.path);
        // 'stdin' relies on the `preloaded` array provided at construction.
    }
    refillFromDir(dirPath) {
        if (!fs.existsSync(dirPath))
            return;
        const consumedDir = path.join(dirPath, 'consumed');
        const entries = fs
            .readdirSync(dirPath, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .sort();
        for (const name of entries) {
            const filePath = path.join(dirPath, name);
            const text = fs.readFileSync(filePath, 'utf8');
            const envelope = parseEnvelopeFile(text, filePath);
            this.queue.push(envelope);
            fs.mkdirSync(consumedDir, { recursive: true });
            fs.renameSync(filePath, path.join(consumedDir, name));
        }
    }
    refillFromQueueFile(filePath) {
        if (!fs.existsSync(filePath))
            return;
        const stat = fs.statSync(filePath);
        if (stat.size <= this.queueFileCursor)
            return;
        const fd = fs.openSync(filePath, 'r');
        try {
            const length = stat.size - this.queueFileCursor;
            const buffer = Buffer.alloc(length);
            fs.readSync(fd, buffer, 0, length, this.queueFileCursor);
            this.queueFileCursor = stat.size;
            const text = buffer.toString('utf8');
            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.length === 0)
                    continue;
                this.queue.push(parseEnvelopeLine(trimmed, filePath));
            }
        }
        finally {
            fs.closeSync(fd);
        }
    }
}
exports.DeterministicSession = DeterministicSession;
function matchingEnvelopeIndex(queue, personaId) {
    const personaTagged = queue.findIndex((e) => e.persona === personaId);
    if (personaTagged >= 0)
        return personaTagged;
    return queue.findIndex((e) => e.persona === undefined);
}
function consumeEnvelope(envelope) {
    const result = validatePatchFormat(envelope.patch);
    if (!result.valid) {
        throw new Error(`deterministic session: rejected external patch from ${envelope.source ?? 'unknown source'}: ` +
            `${result.reason ?? 'patch does not match FORMAT 1, FORMAT 2, or FORMAT 3'}`);
    }
    return envelope.patch;
}
/**
 * Strict FORMAT 1/2/3 validator. The accepted shapes are:
 *
 *   - FORMAT 1: one or more `<<<FILE <path>` blocks terminated by `FILE>>>`.
 *   - FORMAT 2: a unified diff whose first two lines are `--- ...` / `+++ ...`.
 *   - FORMAT 3: the literal three characters `no-op` (whitespace trimmed).
 *
 * Anything else is rejected. The validator is intentionally strict: the
 * deterministic session refuses to forward prose, fenced bodies, or
 * partially-formed patches, because those are exactly the failure modes
 * that motivated the FORMAT grammar in the first place.
 */
function validatePatchFormat(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return { valid: false, format: null, reason: 'patch text is empty' };
    }
    if (trimmed === 'no-op') {
        return { valid: true, format: 'format-3-no-op' };
    }
    if (looksLikeWholeFile(text)) {
        if (wholeFileBalanced(text)) {
            return { valid: true, format: 'format-1-whole-file' };
        }
        return {
            valid: false,
            format: null,
            reason: 'FORMAT 1 detected but <<<FILE / FILE>>> markers are not balanced',
        };
    }
    if (looksLikeStrictUnifiedDiff(text)) {
        return { valid: true, format: 'format-2-unified-diff' };
    }
    return {
        valid: false,
        format: null,
        reason: 'patch does not start with <<<FILE (FORMAT 1), --- (FORMAT 2), or equal "no-op" (FORMAT 3); ' +
            'prose preambles and markdown fences are not accepted at the deterministic-session boundary',
    };
}
function looksLikeWholeFile(text) {
    return /^<<<FILE\s+\S/m.test(text);
}
function wholeFileBalanced(text) {
    const opens = (text.match(/^<<<FILE\s+\S/gm) ?? []).length;
    const closes = (text.match(/^FILE>>>\s*$/gm) ?? []).length;
    return opens > 0 && opens === closes;
}
function looksLikeStrictUnifiedDiff(text) {
    // Strict: first non-empty line is `--- ` followed by either /dev/null or
    // a/<path>; second non-empty line is `+++ ` followed by /dev/null or
    // b/<path>. The body may include `@@` hunks; we only validate the headers
    // here because hunk-body validity is the unified-diff applier's job.
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].length === 0)
        i += 1;
    const first = lines[i] ?? '';
    if (!/^---\s+(\/dev\/null|a\/\S+)/.test(first))
        return false;
    i += 1;
    while (i < lines.length && lines[i].length === 0)
        i += 1;
    const second = lines[i] ?? '';
    return /^\+\+\+\s+(\/dev\/null|b\/\S+)/.test(second);
}
function parseEnvelopeFile(text, source) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (err) {
        throw new Error(`deterministic session: failed to parse patch file ${source} as JSON: ${err.message}; ` +
            `each file in a watched directory must be a JSON envelope { patch, persona?, source? }`, { cause: err });
    }
    return coerceEnvelope(parsed, source);
}
function parseEnvelopeLine(line, source) {
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch (err) {
        throw new Error(`deterministic session: failed to parse queue line in ${source}: ${err.message}; ` +
            `each line must be a JSON envelope { patch, persona?, source? }`, { cause: err });
    }
    return coerceEnvelope(parsed, source);
}
function coerceEnvelope(value, where) {
    if (value === null || typeof value !== 'object') {
        throw new Error(`deterministic session: envelope from ${where} is not an object; ` +
            `expected { patch: string, persona?: string, source?: string }`);
    }
    const obj = value;
    const patch = obj.patch;
    if (typeof patch !== 'string' || patch.length === 0) {
        throw new Error(`deterministic session: envelope from ${where} is missing a non-empty "patch" string field`);
    }
    const envelope = { patch };
    if (typeof obj.source === 'string')
        envelope.source = obj.source;
    if (typeof obj.persona === 'string')
        envelope.persona = obj.persona;
    return envelope;
}
function describeSource(source) {
    if (source.kind === 'dir')
        return `dir=${source.path}`;
    if (source.kind === 'queue')
        return `queue=${source.path}`;
    return 'stdin';
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
