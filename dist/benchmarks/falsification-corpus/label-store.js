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
exports.labelPathFor = labelPathFor;
exports.readLabel = readLabel;
exports.writeLabel = writeLabel;
exports.loadLabeledEntries = loadLabeledEntries;
exports.buildLabelStatus = buildLabelStatus;
exports.summarizeLabelStatus = summarizeLabelStatus;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const label_rules_1 = require("./label-rules");
/** Returns the absolute label-file path for one corpus entry. */
function labelPathFor(labelsDir, entryId) {
    return path.join(path.resolve(labelsDir), `${entryId}.label.json`);
}
/** Reads and validates a label file, returning undefined when it does not exist. */
async function readLabel(labelsDir, entryId) {
    const labelPath = labelPathFor(labelsDir, entryId);
    try {
        const parsed = JSON.parse(await fs.readFile(labelPath, 'utf8'));
        if (!isGroundTruthLabelShape(parsed)) {
            return { label: emptyInvalidLabel(), issues: ['label file does not match GroundTruthLabel shape'] };
        }
        return { label: parsed, issues: (0, label_rules_1.validateGroundTruthLabel)(parsed) };
    }
    catch (error) {
        if (isNotFound(error))
            return undefined;
        return { label: emptyInvalidLabel(), issues: [`label file could not be read: ${reasonOf(error)}`] };
    }
}
/** Writes one validated label file and refuses accidental overwrites by default. */
async function writeLabel(labelsDir, entryId, label, options = {}) {
    const issues = (0, label_rules_1.validateGroundTruthLabel)(label);
    if (issues.length > 0) {
        throw new Error(`${entryId} [label]: invalid label: ${issues.join('; ')}`);
    }
    const labelPath = labelPathFor(labelsDir, entryId);
    await fs.mkdir(path.dirname(labelPath), { recursive: true });
    if (!options.replace && await exists(labelPath)) {
        throw new Error(`${entryId} [label]: ${labelPath} already exists. Re-run with --replace to overwrite.`);
    }
    await fs.writeFile(labelPath, `${JSON.stringify(label, null, 2)}\n`, 'utf8');
    return labelPath;
}
/** Combines unlabeled corpus entries with existing labels, skipping invalid labels. */
async function loadLabeledEntries(entries, labelsDir) {
    const status = await buildLabelStatus(entries, labelsDir);
    const labeled = [];
    for (const entry of entries) {
        const label = await readLabel(labelsDir, entry.id);
        if (label !== undefined && label.issues.length === 0) {
            labeled.push({ ...entry, groundTruth: label.label });
        }
    }
    return { labeled, status };
}
/** Builds label-status rows for every corpus entry. */
async function buildLabelStatus(entries, labelsDir) {
    const rows = [];
    for (const entry of entries) {
        const labelPath = labelPathFor(labelsDir, entry.id);
        const label = await readLabel(labelsDir, entry.id);
        if (label === undefined) {
            rows.push({ entryId: entry.id, labelPath, status: 'unlabeled', issues: [] });
            continue;
        }
        rows.push({
            entryId: entry.id,
            labelPath,
            status: label.issues.length === 0 ? 'labeled' : 'invalid',
            verdict: label.label.verdict,
            issues: label.issues,
        });
    }
    return rows;
}
/** Summarizes label status rows by status and verdict. */
function summarizeLabelStatus(rows) {
    const summary = {};
    for (const row of rows) {
        summary[row.status] = (summary[row.status] ?? 0) + 1;
        if (row.verdict !== undefined && row.status === 'labeled') {
            summary[`verdict:${row.verdict}`] = (summary[`verdict:${row.verdict}`] ?? 0) + 1;
        }
    }
    return summary;
}
async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function isGroundTruthLabelShape(value) {
    if (!isRecord(value))
        return false;
    const categories = value.brokenCategories;
    return typeof value.verdict === 'string'
        && typeof value.rationale === 'string'
        && typeof value.labeledBy === 'string'
        && typeof value.labeledAt === 'string'
        && (value.reviewedBy === undefined || typeof value.reviewedBy === 'string')
        && (categories === undefined || (Array.isArray(categories) && categories.every(item => typeof item === 'string')));
}
function emptyInvalidLabel() {
    return {
        verdict: 'ambiguous',
        rationale: '',
        labeledBy: '',
        labeledAt: '',
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNotFound(error) {
    return isRecord(error) && error.code === 'ENOENT';
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
