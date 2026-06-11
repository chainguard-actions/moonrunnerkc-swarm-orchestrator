"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterministicExtractor = exports.DeterministicExtractorError = void 0;
const scan_pipeline_1 = require("./scan-pipeline");
Object.defineProperty(exports, "DeterministicExtractorError", { enumerable: true, get: function () { return scan_pipeline_1.DeterministicExtractorError; } });
/**
 * Deterministic extractor: accepts a hand-authored contract envelope from
 * a file (YAML or JSON), a TypeScript/JavaScript module's default export,
 * or an inline literal, validates it against the shared schema, and emits
 * the obligations unchanged. Performs zero inference. Provenance carries
 * `promptSha256 = sha256(canonical envelope bytes)` so the contract
 * identity is reproducible across runs.
 *
 * @throws {DeterministicExtractorError} when the source's contents fail
 *         validation against the shared contract schema.
 */
class DeterministicExtractor {
    source;
    constructor(options) {
        this.source = options.source;
    }
    static fromFile(filePath) {
        return new DeterministicExtractor({ source: { kind: 'file', path: filePath } });
    }
    static fromModule(modulePath) {
        return new DeterministicExtractor({ source: { kind: 'module', path: modulePath } });
    }
    static fromInline(envelope) {
        return new DeterministicExtractor({ source: { kind: 'inline', envelope } });
    }
    async extract(_input) {
        const raw = await this.loadRaw();
        const envelope = (0, scan_pipeline_1.validateContractEnvelope)(raw, this.sourceLabel());
        return {
            obligations: envelope.obligations,
            provenance: {
                name: 'deterministic',
                model: null,
                temperature: null,
                promptSha256: (0, scan_pipeline_1.envelopeSha)(envelope),
            },
        };
    }
    async loadRaw() {
        if (this.source.kind === 'inline')
            return this.source.envelope;
        if (this.source.kind === 'file')
            return (0, scan_pipeline_1.loadEnvelopeFile)(this.source.path);
        return (0, scan_pipeline_1.loadEnvelopeModule)(this.source.path);
    }
    sourceLabel() {
        if (this.source.kind === 'inline')
            return '<inline>';
        return this.source.path;
    }
}
exports.DeterministicExtractor = DeterministicExtractor;
