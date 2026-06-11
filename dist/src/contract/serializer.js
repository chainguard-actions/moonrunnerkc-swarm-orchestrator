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
exports.MANIFEST_FILENAME = exports.CONTRACT_FILENAME = void 0;
exports.writeContract = writeContract;
exports.readContract = readContract;
exports.parseJsonl = parseJsonl;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const canonicalize_1 = require("./canonicalize");
const validator_1 = require("./validator");
/** Filenames for the on-disk artifacts of a finalized contract. */
exports.CONTRACT_FILENAME = 'contract.jsonl';
exports.MANIFEST_FILENAME = 'manifest.json';
/**
 * Write a finalized contract to `<dir>/contract.jsonl` and
 * `<dir>/manifest.json`. The directory is created if absent. Existing files
 * are overwritten (idempotent for the same input).
 */
function writeContract(dir, contract) {
    fs.mkdirSync(dir, { recursive: true });
    const jsonl = (0, canonicalize_1.canonicalSerialize)(contract.obligations);
    fs.writeFileSync(path.join(dir, exports.CONTRACT_FILENAME), jsonl, 'utf8');
    const manifestJson = JSON.stringify(contract.manifest, null, 2) + '\n';
    fs.writeFileSync(path.join(dir, exports.MANIFEST_FILENAME), manifestJson, 'utf8');
}
/**
 * Read a finalized contract from `<dir>/contract.jsonl` and
 * `<dir>/manifest.json`. Validates obligations against the v1 schema before
 * returning; throws on schema mismatch or missing files.
 */
function readContract(dir) {
    const manifestPath = path.join(dir, exports.MANIFEST_FILENAME);
    const obligationsPath = path.join(dir, exports.CONTRACT_FILENAME);
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`contract manifest not found at ${manifestPath}`);
    }
    if (!fs.existsSync(obligationsPath)) {
        throw new Error(`contract obligations not found at ${obligationsPath}`);
    }
    const manifest = readManifest(manifestPath);
    const obligations = parseJsonl(fs.readFileSync(obligationsPath, 'utf8'));
    // Mirror compileGoal/finalize: build is only required when the captured
    // repoContext indicates the project actually has a build step.
    const requireBuild = manifest.repoContext.buildCommand !== null;
    const validation = (0, validator_1.validateObligations)(obligations, { requireBuild });
    if (!validation.valid) {
        throw new Error(`contract obligations at ${obligationsPath} failed validation: ` +
            validation.errors.map((e) => e.message).join('; '));
    }
    return { manifest, obligations: obligations };
}
function readManifest(file) {
    const raw = fs.readFileSync(file, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`contract manifest ${file} is not valid JSON: ${err.message}`, {
            cause: err,
        });
    }
    if (!isManifestShape(parsed)) {
        throw new Error(`contract manifest ${file} is missing required fields`);
    }
    if (parsed.schemaVersion !== types_1.CONTRACT_SCHEMA_VERSION) {
        throw new Error(`contract manifest ${file} declares schemaVersion "${parsed.schemaVersion}"; this build only supports "${types_1.CONTRACT_SCHEMA_VERSION}"`);
    }
    return parsed;
}
function isManifestShape(x) {
    if (typeof x !== 'object' || x === null)
        return false;
    const m = x;
    return (typeof m.schemaVersion === 'string' &&
        typeof m.contractHash === 'string' &&
        typeof m.contractId === 'string' &&
        typeof m.goal === 'string' &&
        typeof m.createdAt === 'string' &&
        typeof m.repoContext === 'object' &&
        m.repoContext !== null &&
        typeof m.extractor === 'object' &&
        m.extractor !== null);
}
/**
 * Parse a JSONL string into an array of obligation candidates. Blank lines
 * are tolerated (skipped); any non-blank line that isn't valid JSON throws.
 * Returns `unknown[]` so the caller can run schema validation.
 */
function parseJsonl(text) {
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        if (line.trim().length === 0)
            continue;
        try {
            out.push(JSON.parse(line));
        }
        catch (err) {
            throw new Error(`line ${i + 1} of contract.jsonl is not valid JSON: ${err.message}`, { cause: err });
        }
    }
    return out;
}
