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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterministicExtractorError = void 0;
exports.sha256Hex = sha256Hex;
exports.envelopeSha = envelopeSha;
exports.stripJsonFences = stripJsonFences;
exports.truncate = truncate;
exports.loadEnvelopeFile = loadEnvelopeFile;
exports.loadEnvelopeModule = loadEnvelopeModule;
exports.validateContractEnvelope = validateContractEnvelope;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
const yaml = __importStar(require("js-yaml"));
const contract_schema_1 = require("./contract-schema");
/**
 * Name pinned to `DeterministicExtractorError` so the deterministic
 * extractor's existing public surface (and the `err instanceof` test
 * assertions) keep working after the move.
 */
class DeterministicExtractorError extends Error {
    issues;
    constructor(issues, summary) {
        super(summary);
        this.name = 'DeterministicExtractorError';
        this.issues = issues;
    }
}
exports.DeterministicExtractorError = DeterministicExtractorError;
function sha256Hex(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
function envelopeSha(envelope) {
    return sha256Hex(JSON.stringify(envelope.obligations));
}
function stripJsonFences(text) {
    return text.replace(/^```(?:json)?\s*\n/i, '').replace(/\n?```\s*$/i, '');
}
function truncate(text, max) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}...`;
}
function loadEnvelopeFile(filePath) {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) {
        throw fileError(`contract file not found: ${absolute}; check the --contract-file path`);
    }
    const raw = fs.readFileSync(absolute, 'utf8');
    const ext = path.extname(absolute).toLowerCase();
    if (ext === '.json') {
        return tryParse(() => JSON.parse(raw), absolute, 'JSON', 'YAML', '.yaml');
    }
    if (ext === '.yaml' || ext === '.yml') {
        return tryParse(() => yaml.load(raw), absolute, 'YAML', 'JSON', '.json');
    }
    throw fileError(`contract file ${absolute} has unsupported extension "${ext}"; use .json, .yaml, or .yml`);
}
function fileError(message) {
    return new DeterministicExtractorError([], message);
}
function tryParse(parse, absolute, from, fallback, fallbackExt) {
    try {
        return parse();
    }
    catch (err) {
        throw fileError(`contract file ${absolute} is not valid ${from}: ${err.message}; ` +
            `fix the ${from} syntax or use a ${fallbackExt} extension to parse as ${fallback}`);
    }
}
async function loadEnvelopeModule(modulePath) {
    const absolute = path.resolve(modulePath);
    if (!fs.existsSync(absolute)) {
        throw fileError(`contract module not found: ${absolute}; check the --contract-module path`);
    }
    let mod;
    try {
        mod = await Promise.resolve(`${absolute}`).then(s => __importStar(require(s)));
    }
    catch (err) {
        throw fileError(`failed to import contract module ${absolute}: ${err.message}; ` +
            `the module must be a TS/JS file the runtime can load`);
    }
    return mod.default ?? mod;
}
function validateContractEnvelope(raw, sourceLabel) {
    const validator = compiledValidator();
    if (!validator(raw)) {
        const issues = (validator.errors ?? []).map(formatIssue);
        const summary = `deterministic extractor rejected ${sourceLabel}: ` +
            `${issues.length} validation issue(s)\n` +
            issues.map((i) => `  - ${i.pointer || '/'}: ${i.fix}`).join('\n');
        throw new DeterministicExtractorError(issues, summary);
    }
    return raw;
}
let cachedValidator;
function compiledValidator() {
    if (cachedValidator)
        return cachedValidator;
    const ajv = new ajv_1.default({ allErrors: true, strict: false });
    cachedValidator = ajv.compile(contract_schema_1.SUBMIT_CONTRACT_INPUT_SCHEMA);
    return cachedValidator;
}
function formatIssue(err) {
    return {
        pointer: err.instancePath || '',
        rule: err.keyword,
        message: err.message ?? '',
        fix: correctiveActionFor(err),
    };
}
function correctiveActionFor(err) {
    const at = err.instancePath || '/';
    switch (err.keyword) {
        case 'required': {
            const params = err.params;
            const field = params.missingProperty ?? 'required field';
            return `add the missing "${field}" property at ${at}`;
        }
        case 'additionalProperties': {
            const params = err.params;
            const field = params.additionalProperty ?? 'unknown';
            return `remove the unknown field "${field}" at ${at}`;
        }
        case 'enum': {
            const params = err.params;
            const allowed = (params.allowedValues ?? []).map((v) => JSON.stringify(v)).join(', ');
            return `value at ${at} must be one of: ${allowed}`;
        }
        case 'const': {
            const params = err.params;
            return `value at ${at} must equal ${JSON.stringify(params.allowedValue)}`;
        }
        case 'type':
            return `value at ${at} must be of type ${err.params.type ?? 'expected'}`;
        case 'minLength':
            return `value at ${at} must be a non-empty string`;
        case 'minItems':
            return `array at ${at || '/obligations'} must contain at least one obligation`;
        case 'minimum':
        case 'maximum':
            return `value at ${at} is out of the allowed numeric range (${err.message ?? ''})`;
        case 'oneOf':
            return (`obligation at ${at} does not match any of the eight allowed obligation types ` +
                `(file-must-exist, build-must-pass, test-must-pass, function-must-have-signature, ` +
                `property-must-hold, import-graph-must-satisfy, coverage-must-exceed, ` +
                `performance-must-not-regress); check the "type" field and required properties`);
        default:
            return `${at} failed rule "${err.keyword}": ${err.message ?? 'see schema'}`;
    }
}
