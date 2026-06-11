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
exports.main = main;
const path = __importStar(require("path"));
const label_store_1 = require("../label-store");
const loader_1 = require("../loader");
/** Prints which corpus entries have usable labels and which still need review. */
async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const entries = await (0, loader_1.loadCorpus)(args.corpusDir);
    const rows = await (0, label_store_1.buildLabelStatus)(entries, args.labelsDir);
    const summary = (0, label_store_1.summarizeLabelStatus)(rows);
    console.log(`Corpus: ${path.resolve(args.corpusDir)}`);
    console.log(`Labels: ${path.resolve(args.labelsDir)}`);
    console.log(`Entries: ${entries.length}`);
    console.log(`Labeled: ${summary.labeled ?? 0}`);
    console.log(`Unlabeled: ${summary.unlabeled ?? 0}`);
    console.log(`Invalid: ${summary.invalid ?? 0}`);
    console.log(`Verdicts: clean=${summary['verdict:clean'] ?? 0}, broken=${summary['verdict:broken'] ?? 0}, ambiguous=${summary['verdict:ambiguous'] ?? 0}`);
    console.log('');
    for (const row of rows) {
        const verdict = row.verdict === undefined ? '' : ` ${row.verdict}`;
        const issues = row.issues.length === 0 ? '' : ` ${row.issues.join('; ')}`;
        console.log(`${row.status.toUpperCase()}${verdict} ${row.entryId} ${row.labelPath}${issues}`);
    }
}
function parseArgs(argv) {
    let corpusDir = path.resolve('verification-runs');
    let labelsDir = path.resolve('benchmarks/falsification-corpus/labels');
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--corpus') {
            corpusDir = path.resolve(requireValue(argv, i += 1, '--corpus'));
        }
        else if (arg === '--labels') {
            labelsDir = path.resolve(requireValue(argv, i += 1, '--labels'));
        }
        else {
            throw new Error(`label-status [args]: unknown option ${arg ?? ''}`);
        }
    }
    return { corpusDir, labelsDir };
}
function requireValue(argv, index, option) {
    const value = argv[index];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`label-status [args]: ${option} requires a value`);
    }
    return value;
}
if (require.main === module) {
    main().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
    });
}
