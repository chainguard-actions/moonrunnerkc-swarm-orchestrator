"use strict";
/**
 * `scaffold-template` strategy: create a file from a registered
 * boilerplate template. Template selection is keyed by the basename or
 * extension of the obligation's path. When no template matches the
 * obligation reroutes to synthesis (impl guide §8 misclassification
 * recovery).
 *
 * Phase 5 ships a small in-repo template set covering the boilerplate
 * file types the §8 spec calls out (license headers, file naming
 * conventions, scaffolds). Additional templates are registered via
 * `registerTemplate`.
 *
 * The template data and lookup functions have been moved to
 * src/shared-wasm/strategy-constants.ts to break the circular
 * dependency between contract and wasm. This file re-exports them
 * for backward compatibility.
 */
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
exports.scaffoldTemplateStrategy = exports.listTemplateKeys = exports.registerTemplate = exports.hasTemplateFor = void 0;
exports.canScaffold = canScaffold;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const strategy_constants_1 = require("../../shared-wasm/strategy-constants");
Object.defineProperty(exports, "hasTemplateFor", { enumerable: true, get: function () { return strategy_constants_1.hasTemplateFor; } });
Object.defineProperty(exports, "registerTemplate", { enumerable: true, get: function () { return strategy_constants_1.registerTemplate; } });
Object.defineProperty(exports, "listTemplateKeys", { enumerable: true, get: function () { return strategy_constants_1.listTemplateKeys; } });
const wasm_runtime_1 = require("../wasm-runtime");
/** The strategy implementation. */
exports.scaffoldTemplateStrategy = {
    name: 'scaffold-template',
    description: 'Create a file from a registered boilerplate template.',
    handles: ['file-must-exist'],
    async execute(ctx) {
        const obligation = ctx.obligation;
        if (obligation.type !== 'file-must-exist') {
            throw new Error(`scaffold-template only handles file-must-exist; got ${obligation.type}`);
        }
        const relPath = obligation.path;
        const template = (0, strategy_constants_1.getTemplate)(relPath);
        if (template === null) {
            throw new Error(`no template registered for ${relPath} (basename or extension lookup miss)`);
        }
        const abs = (0, wasm_runtime_1.ensureInsideRepoRoot)(ctx.repoRoot, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        if (fs.existsSync(abs)) {
            return {
                applied: false,
                detail: `${relPath} already exists; scaffold-template is non-destructive`,
                filesAffected: [],
            };
        }
        const body = template.endsWith('\n') ? template : template + '\n';
        fs.writeFileSync(abs, body, 'utf8');
        return {
            applied: true,
            detail: `wrote ${relPath} from registered template`,
            filesAffected: [relPath],
        };
    },
};
/** Type guard: confirm the obligation is one this strategy can take on. */
function canScaffold(o) {
    return o.type === 'file-must-exist' && (0, strategy_constants_1.hasTemplateFor)(o.path);
}
