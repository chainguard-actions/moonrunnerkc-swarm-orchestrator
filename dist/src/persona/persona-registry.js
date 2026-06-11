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
exports.DEFAULT_PERSONA_IDS = exports.TEST_AUTHOR_PERSONA = exports.MIGRATION_SPECIALIST_PERSONA = exports.DOCUMENTATION_WRITER_PERSONA = exports.DEPENDENCY_AUDITOR_PERSONA = exports.SECURITY_REVIEWER_PERSONA = exports.VERIFIER_PERSONA = exports.IMPLEMENTER_PERSONA = exports.ARCHITECT_PERSONA = exports.PersonaRegistry = void 0;
exports.createDefaultRegistry = createDefaultRegistry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("../contract/types");
const VALID_TIERS = ['haiku', 'sonnet', 'opus'];
const OBLIGATION_TYPE_SET = new Set(types_1.OBLIGATION_TYPES);
/**
 * Walk up from this file until a `config/personas/` directory is found. The
 * compiled output lives at `dist/src/persona/persona-registry.js`, so the
 * resolve has to traverse out of `dist/`; running under ts-node the layout
 * starts one level shallower. Either way the package root is where
 * `config/personas/` actually lives.
 */
function findPersonasDir() {
    let current = __dirname;
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(current, 'config', 'personas');
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    throw new Error(`persona-registry: cannot locate config/personas/ from ${__dirname}`);
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asString(v, where) {
    if (typeof v !== 'string') {
        throw new Error(`persona-registry: ${where} must be a string`);
    }
    return v;
}
function asNumber(v, where) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`persona-registry: ${where} must be a finite number`);
    }
    return v;
}
function parsePersonaYaml(file) {
    const text = fs.readFileSync(file, 'utf8');
    const raw = yaml.load(text);
    if (!isRecord(raw)) {
        throw new Error(`persona-registry: ${file} must be a YAML mapping`);
    }
    const sampling = raw.sampling;
    if (!isRecord(sampling)) {
        throw new Error(`persona-registry: ${file} missing 'sampling' mapping`);
    }
    const tier = asString(raw.tier, `${file}: tier`);
    if (!VALID_TIERS.includes(tier)) {
        throw new Error(`persona-registry: ${file}: tier '${tier}' must be one of ${VALID_TIERS.join(', ')}`);
    }
    const handles = raw.handles;
    if (!Array.isArray(handles) || handles.length === 0) {
        throw new Error(`persona-registry: ${file}: handles must be a non-empty array`);
    }
    for (const h of handles) {
        if (typeof h !== 'string' || !OBLIGATION_TYPE_SET.has(h)) {
            throw new Error(`persona-registry: ${file}: handles entry '${String(h)}' is not a known ObligationType`);
        }
    }
    const temperature = asNumber(sampling.temperature, `${file}: sampling.temperature`);
    const maxTokens = asNumber(sampling.maxTokens, `${file}: sampling.maxTokens`);
    const topP = sampling.topP === undefined ? undefined : asNumber(sampling.topP, `${file}: sampling.topP`);
    return {
        id: asString(raw.id, `${file}: id`),
        role: asString(raw.role, `${file}: role`),
        systemSuffix: asString(raw.systemSuffix, `${file}: systemSuffix`),
        sampling: { temperature, maxTokens, ...(topP !== undefined ? { topP } : {}) },
        tier: tier,
        handles: handles,
    };
}
const PERSONAS_DIR = findPersonasDir();
function loadPersona(id) {
    return parsePersonaYaml(path.join(PERSONAS_DIR, `${id}.yaml`));
}
/**
 * Registry of persona specs. The eight default personas are loaded eagerly
 * from `config/personas/*.yaml` at module-init time. The registry itself is
 * a pure in-memory key/value store; persistence happens in the ledger and
 * the contract, not here.
 */
class PersonaRegistry {
    byId;
    constructor(initial = []) {
        this.byId = new Map();
        for (const p of initial)
            this.register(p);
    }
    register(spec) {
        if (this.byId.has(spec.id)) {
            throw new Error(`persona "${spec.id}" already registered; use replace() for explicit overwrite`);
        }
        this.byId.set(spec.id, spec);
    }
    replace(spec) {
        this.byId.set(spec.id, spec);
    }
    get(id) {
        return this.byId.get(id) ?? null;
    }
    require(id) {
        const found = this.byId.get(id);
        if (!found) {
            throw new Error(`persona "${id}" not registered; known: ${[...this.byId.keys()].join(', ') || '(none)'}`);
        }
        return found;
    }
    list() {
        return [...this.byId.values()];
    }
    isEmpty() {
        return this.byId.size === 0;
    }
}
exports.PersonaRegistry = PersonaRegistry;
exports.ARCHITECT_PERSONA = loadPersona('architect');
exports.IMPLEMENTER_PERSONA = loadPersona('implementer');
exports.VERIFIER_PERSONA = loadPersona('verifier');
exports.SECURITY_REVIEWER_PERSONA = loadPersona('security-reviewer');
exports.DEPENDENCY_AUDITOR_PERSONA = loadPersona('dependency-auditor');
exports.DOCUMENTATION_WRITER_PERSONA = loadPersona('documentation-writer');
exports.MIGRATION_SPECIALIST_PERSONA = loadPersona('migration-specialist');
exports.TEST_AUTHOR_PERSONA = loadPersona('test-author');
function createDefaultRegistry() {
    return new PersonaRegistry([
        exports.ARCHITECT_PERSONA,
        exports.IMPLEMENTER_PERSONA,
        exports.VERIFIER_PERSONA,
        exports.SECURITY_REVIEWER_PERSONA,
        exports.DEPENDENCY_AUDITOR_PERSONA,
        exports.DOCUMENTATION_WRITER_PERSONA,
        exports.MIGRATION_SPECIALIST_PERSONA,
        exports.TEST_AUTHOR_PERSONA,
    ]);
}
exports.DEFAULT_PERSONA_IDS = [
    'architect',
    'implementer',
    'verifier',
    'security-reviewer',
    'dependency-auditor',
    'documentation-writer',
    'migration-specialist',
    'test-author',
];
