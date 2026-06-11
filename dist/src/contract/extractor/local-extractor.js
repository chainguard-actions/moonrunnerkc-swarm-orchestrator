"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalExtractor = void 0;
const contract_schema_1 = require("./contract-schema");
const scan_pipeline_1 = require("./scan-pipeline");
const logger_1 = require("../../logger");
const logger = (0, logger_1.getLogger)('contract:local-extractor');
/**
 * Extractor backed by a local inference endpoint. Issues a single chat
 * completion against the configured backend with a grammar-constrained
 * decoding request targeting the contract envelope schema; falls back to
 * soft-prompt parsing when the backend doesn't support json-schema
 * grammar (still strict — invalid JSON surfaces as an error).
 *
 * Determinism: every call passes `temperature: 0` and a configurable
 * seed, captured in the provenance via the prompt sha256. Same goal +
 * same workspace + same seed + same model + same backend produces an
 * identical contract hash.
 */
class LocalExtractor {
    backend;
    model;
    grammar;
    temperature;
    seed;
    maxTokens;
    constructor(options) {
        this.backend = options.backend;
        this.model = options.model;
        this.grammar = options.grammar ?? 'auto';
        this.temperature = options.temperature ?? 0;
        this.seed = options.seed ?? 0;
        this.maxTokens = options.maxTokens ?? 4096;
    }
    async extract(input) {
        const systemPrompt = LOCAL_SYSTEM_PROMPT;
        const userPrompt = buildUserPrompt(input);
        const promptSha = (0, scan_pipeline_1.sha256Hex)(`${systemPrompt}\n---\n${userPrompt}`);
        const useGrammar = this.shouldUseGrammar();
        const response = await this.backend.chat({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.temperature,
            maxTokens: this.maxTokens,
            seed: this.seed,
            ...(useGrammar
                ? { grammar: { kind: 'json-schema', schema: contract_schema_1.SUBMIT_CONTRACT_INPUT_SCHEMA } }
                : {}),
        });
        const envelope = parseEnvelopeOrThrow(response.text, this.backend.name, useGrammar);
        return {
            obligations: envelope.obligations,
            provenance: {
                name: 'local',
                model: this.model,
                temperature: this.temperature,
                promptSha256: promptSha,
            },
        };
    }
    shouldUseGrammar() {
        if (this.grammar === 'none')
            return false;
        const supported = this.backend.supportsGrammar();
        if (supported.includes('json-schema'))
            return true;
        if (this.grammar === 'json-schema') {
            logger.warn(`local extractor requested json-schema grammar but backend "${this.backend.name}" ` +
                `advertises [${supported.join(', ')}]; falling back to soft-prompt parsing`);
        }
        return false;
    }
}
exports.LocalExtractor = LocalExtractor;
function buildUserPrompt(input) {
    return [
        `Goal:`,
        input.goal,
        '',
        `Repository context (JSON):`,
        JSON.stringify(input.repoContext, null, 2),
        '',
        `Respond with a JSON object matching the obligations envelope schema. ` +
            `Do not include any prose, markdown, or commentary — only the JSON.`,
    ].join('\n');
}
function parseEnvelopeOrThrow(text, backendName, grammarApplied) {
    const stripped = (0, scan_pipeline_1.stripJsonFences)(text).trim();
    let parsed;
    try {
        parsed = JSON.parse(stripped);
    }
    catch (err) {
        throw new Error(`local extractor: ${backendName} returned text that is not valid JSON ` +
            `(grammar: ${grammarApplied ? 'json-schema' : 'soft-prompt'}). ` +
            `Head of response: ${(0, scan_pipeline_1.truncate)(stripped, 200)}. ` +
            `Underlying parse error: ${err.message}`, { cause: err });
    }
    if (parsed === null ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.obligations)) {
        throw new Error(`local extractor: ${backendName} returned JSON without an obligations array. ` +
            `Got: ${(0, scan_pipeline_1.truncate)(JSON.stringify(parsed), 200)}`);
    }
    return {
        obligations: parsed.obligations,
    };
}
const LOCAL_SYSTEM_PROMPT = [
    'You compile natural-language software goals into machine-checkable contracts.',
    '',
    'Return a JSON object with shape { "obligations": [ ... ] }. Each obligation',
    'is one of the eight discriminated union members:',
    '',
    '  { "type": "file-must-exist", "path": "<repo-relative path>" }',
    '  { "type": "build-must-pass", "command": "<shell command>" }',
    '  { "type": "test-must-pass",  "command": "<shell command>" }',
    '  { "type": "function-must-have-signature", "file": "...", "name": "...", "signature": "..." }',
    '  { "type": "property-must-hold", "predicate": "...", "target": "..." }',
    '  { "type": "import-graph-must-satisfy", "constraint": "no-cycles" | "no-upward-imports", "scope": "..." }',
    '  { "type": "coverage-must-exceed", "scope": "...", "metric": "lines"|"statements"|"branches"|"functions", "threshold": <0..100> }',
    '  { "type": "performance-must-not-regress", "benchmark": "...", "baseline": "...", "threshold": <0..1> }',
    '',
    'Hard rules:',
    '- Output JSON only. No prose, no markdown, no fences.',
    '- The contract MUST contain at least one test-must-pass obligation.',
    '- Paths are repo-relative; never absolute.',
    '- Do not emit obligations the goal does not call for.',
    '- Do not include any field not listed for the obligation type.',
].join('\n');
