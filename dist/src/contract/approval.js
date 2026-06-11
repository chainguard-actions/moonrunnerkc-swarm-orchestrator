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
exports.ContractRejectedError = void 0;
exports.runApproval = runApproval;
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const errors_1 = require("../errors");
const canonicalize_1 = require("./canonicalize");
const serializer_1 = require("./serializer");
const validator_1 = require("./validator");
/** Thrown when the user explicitly rejects a contract. */
class ContractRejectedError extends errors_1.SwarmError {
    constructor(remediation) {
        super('contract rejected by user', 'CONTRACT_REJECTED', remediation !== undefined ? { remediation } : undefined);
        this.name = 'ContractRejectedError';
    }
}
exports.ContractRejectedError = ContractRejectedError;
/**
 * Run the user-approval loop on a draft contract.
 *
 * Returns the (possibly edited) draft when the user approves; throws
 * ContractRejectedError when the user rejects. Edits that produce an
 * invalid contract are reported and the loop re-prompts; the original
 * draft is preserved across failed edits.
 */
async function runApproval(draft, options = {}) {
    if (options.autoApprove)
        return draft;
    const io = options.io ?? defaultApprovalIO();
    let current = draft;
    for (;;) {
        renderDraft(current, io);
        const choiceText = options.disableEditor
            ? '[a]pprove / [r]eject'
            : '[a]pprove / [e]dit / [r]eject';
        const answer = (await io.prompt(`${choiceText}: `)).trim().toLowerCase();
        if (answer === 'a' || answer === 'approve')
            return current;
        if (answer === 'r' || answer === 'reject')
            throw new ContractRejectedError('Try: review the contract and re-run with a modified contract, or use --auto-approve to skip approval');
        if (!options.disableEditor && (answer === 'e' || answer === 'edit')) {
            const next = await editAndValidate(current, io);
            if (next)
                current = next;
            continue;
        }
        io.print(`unknown choice "${answer}"; please answer "a", "e", or "r".`);
    }
}
async function editAndValidate(draft, io) {
    const before = (0, canonicalize_1.canonicalSerialize)(draft.obligations);
    const after = await io.openEditor(before, 'contract.jsonl');
    if (after === before) {
        io.print('no changes; returning to prompt.');
        return null;
    }
    let parsed;
    try {
        parsed = (0, serializer_1.parseJsonl)(after);
    }
    catch (err) {
        io.print(`edit produced invalid JSONL: ${err.message}`);
        return null;
    }
    const requireBuild = draft.repoContext.buildCommand !== null;
    const validation = (0, validator_1.validateObligations)(parsed, { requireBuild });
    if (!validation.valid) {
        io.print('edit produced an invalid contract:');
        for (const e of validation.errors)
            io.print(`  [${e.code}] ${e.message}`);
        return null;
    }
    return {
        ...draft,
        obligations: (0, canonicalize_1.canonicalSort)(parsed),
    };
}
function renderDraft(draft, io) {
    io.print('');
    io.print(`Goal: ${draft.goal}`);
    const lang = draft.repoContext.language;
    io.print(`Repository: ${draft.repoContext.repoRoot} (language: ${lang})`);
    const ext = draft.extractor;
    const extLabel = ext.model ? `${ext.name} (${ext.model})` : ext.name;
    io.print(`Extractor: ${extLabel}`);
    io.print('Obligations:');
    for (let i = 0; i < draft.obligations.length; i += 1) {
        const obligation = draft.obligations[i];
        if (obligation === undefined)
            continue;
        io.print(`  ${i + 1}. ${formatObligation(obligation)}`);
    }
    io.print('');
}
function formatObligation(o) {
    switch (o.type) {
        case 'file-must-exist':
            return `file-must-exist: ${o.path}`;
        case 'build-must-pass':
        case 'test-must-pass':
            return `${o.type}: ${o.command}`;
        case 'function-must-have-signature':
            return `function-must-have-signature: ${o.file}::${o.name}${o.signature}`;
        case 'property-must-hold':
            return `property-must-hold: ${o.target} via "${o.predicate}"`;
        case 'import-graph-must-satisfy':
            return `import-graph-must-satisfy: ${o.scope} (${o.constraint})`;
        case 'coverage-must-exceed':
            return `coverage-must-exceed: ${o.scope} ${o.metric} >= ${o.threshold}%`;
        case 'performance-must-not-regress':
            return `performance-must-not-regress: "${o.benchmark}" vs ${o.baseline} (≤${(o.threshold * 100).toFixed(1)}%)`;
    }
}
function defaultApprovalIO() {
    return {
        print(line) {
            process.stdout.write(line + '\n');
        },
        prompt(question) {
            return new Promise((resolve) => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question(question, (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });
        },
        openEditor(initialContent, filename) {
            return new Promise((resolve, reject) => {
                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-v8-edit-'));
                const tmpPath = path.join(tmpDir, filename);
                fs.writeFileSync(tmpPath, initialContent, 'utf8');
                const editor = process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi');
                const child = child_process.spawn(editor, [tmpPath], { stdio: 'inherit' });
                child.on('error', (err) => {
                    reject(new Error(`failed to spawn editor "${editor}": ${err.message}`, { cause: err }));
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error(`editor "${editor}" exited with code ${code}`));
                        return;
                    }
                    try {
                        const content = fs.readFileSync(tmpPath, 'utf8');
                        resolve(content);
                    }
                    catch (err) {
                        reject(new Error(`failed to read post-edit content: ${err.message}`, {
                            cause: err,
                        }));
                    }
                });
            });
        },
    };
}
