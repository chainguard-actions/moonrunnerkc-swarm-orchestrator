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
exports.loadObligationSchema = loadObligationSchema;
exports.obligationValidator = obligationValidator;
exports.resetSchemaCacheForTest = resetSchemaCacheForTest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
/**
 * Load and compile the v1 obligation schema. Cached after first call so the
 * Ajv compilation cost is paid once per process.
 *
 * Schema JSON is read from disk (not `require()`d) so the TypeScript build
 * doesn't try to copy it implicitly; the `scripts/copy-non-ts-assets.js`
 * post-build hook places it next to the compiled loader at runtime.
 */
let cachedValidator;
function resolveSchemaPath() {
    const candidates = [
        path.join(__dirname, 'v1.json'),
        path.join(__dirname, '..', '..', '..', '..', 'src', 'contract', 'schema', 'v1.json'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    throw new Error('contract schema v1.json not found; expected one of: ' +
        candidates.join(', ') +
        '. Re-run `npm run build` to copy schemas into dist/.');
}
/** Read the raw v1 obligation schema JSON. Exported for tests. */
function loadObligationSchema() {
    const file = resolveSchemaPath();
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
/**
 * Get the compiled Ajv validator for the v1 obligation schema. Validates a
 * single obligation object (one JSONL line), not a whole contract.
 */
function obligationValidator() {
    if (cachedValidator)
        return cachedValidator;
    const ajv = new ajv_1.default({ allErrors: true, strict: false });
    const schema = loadObligationSchema();
    cachedValidator = ajv.compile(schema);
    return cachedValidator;
}
/** Reset the cached validator. Test helper only. */
function resetSchemaCacheForTest() {
    cachedValidator = undefined;
}
