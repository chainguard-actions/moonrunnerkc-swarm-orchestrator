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
exports.validateObligations = validateObligations;
const path = __importStar(require("path"));
const loader_1 = require("./schema/loader");
const types_1 = require("./types");
const OBLIGATION_FIELD_CHECKS = {
    'file-must-exist': [{ kind: 'path', field: 'path' }],
    'build-must-pass': [{ kind: 'command', field: 'command' }],
    'test-must-pass': [{ kind: 'command', field: 'command' }],
    'function-must-have-signature': [
        { kind: 'path', field: 'file' },
        { kind: 'nonempty-string', field: 'name' },
        { kind: 'nonempty-string', field: 'signature' },
    ],
    'property-must-hold': [
        { kind: 'command', field: 'predicate' },
        { kind: 'nonempty-string', field: 'target' },
    ],
    'import-graph-must-satisfy': [{ kind: 'path', field: 'scope' }],
    'coverage-must-exceed': [{ kind: 'path', field: 'scope' }],
    'performance-must-not-regress': [
        { kind: 'command', field: 'benchmark' },
        { kind: 'path', field: 'baseline' },
    ],
};
function dedupeKey(o) {
    switch (o.type) {
        case 'file-must-exist':
            return o.path;
        case 'build-must-pass':
            return o.command;
        case 'test-must-pass':
            return o.command;
        case 'function-must-have-signature':
            return `${o.file}|${o.name}|${o.signature}`;
        case 'property-must-hold':
            return `${o.target}|${o.predicate}`;
        case 'import-graph-must-satisfy':
            return `${o.scope}|${o.constraint}`;
        case 'coverage-must-exceed':
            return `${o.scope}|${o.metric}`;
        case 'performance-must-not-regress':
            return `${o.benchmark}|${o.baseline}`;
    }
}
function duplicateMessage(o) {
    switch (o.type) {
        case 'file-must-exist':
            return `duplicate file-must-exist for path "${o.path}"; remove the redundant entry`;
        case 'build-must-pass':
            return `duplicate build-must-pass for command "${o.command}"; remove the redundant entry`;
        case 'test-must-pass':
            return `duplicate test-must-pass for command "${o.command}"; remove the redundant entry`;
        case 'function-must-have-signature':
            return `duplicate function-must-have-signature for ${o.file}:${o.name}; remove the redundant entry`;
        case 'property-must-hold':
            return `duplicate property-must-hold for target "${o.target}"; remove the redundant entry`;
        case 'import-graph-must-satisfy':
            return `duplicate import-graph-must-satisfy for scope "${o.scope}" / constraint "${o.constraint}"; remove the redundant entry`;
        case 'coverage-must-exceed':
            return `duplicate coverage-must-exceed for scope "${o.scope}" / metric "${o.metric}"; remove the redundant entry`;
        case 'performance-must-not-regress':
            return `duplicate performance-must-not-regress for benchmark "${o.benchmark}" / baseline "${o.baseline}"; remove the redundant entry`;
    }
}
function duplicateCode(type) {
    return `duplicate-${type}`;
}
function validateObligations(candidates, options = {}) {
    const errors = [];
    const validate = (0, loader_1.obligationValidator)();
    if (!Array.isArray(candidates) || candidates.length === 0) {
        errors.push({
            index: null,
            code: 'no-obligations',
            message: 'contract must contain at least one obligation; got an empty list. ' +
                'Did the goal parser extract anything?',
        });
        return { valid: false, errors };
    }
    const seenKeys = new Map();
    let hasBuild = false;
    let hasTest = false;
    outer: for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        if (!validate(candidate)) {
            const detail = (validate.errors ?? [])
                .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
                .join('; ');
            errors.push({
                index: i,
                code: 'schema',
                message: `obligation ${i} failed schema: ${detail || 'unknown reason'}`,
            });
            continue;
        }
        const obligation = candidate;
        if (!isKnownType(obligation.type)) {
            errors.push({
                index: i,
                code: 'unknown-type',
                message: `obligation ${i} has unknown type "${String(obligation.type)}"; expected one of ${types_1.OBLIGATION_TYPES.join(', ')}`,
            });
            continue;
        }
        for (const check of OBLIGATION_FIELD_CHECKS[obligation.type]) {
            const value = readStringField(obligation, check.field);
            let err;
            if (check.kind === 'path')
                err = checkPath(value, i);
            else if (check.kind === 'command')
                err = checkCommand(value, i);
            else
                err = checkNonemptyField(value, i, check.field);
            if (err) {
                errors.push(err);
                continue outer;
            }
        }
        let set = seenKeys.get(obligation.type);
        if (!set) {
            set = new Set();
            seenKeys.set(obligation.type, set);
        }
        const key = dedupeKey(obligation);
        if (set.has(key)) {
            errors.push({
                index: i,
                code: duplicateCode(obligation.type),
                message: duplicateMessage(obligation),
            });
            continue;
        }
        set.add(key);
        if (obligation.type === 'build-must-pass')
            hasBuild = true;
        else if (obligation.type === 'test-must-pass')
            hasTest = true;
    }
    const requireBuild = options.requireBuild ?? true;
    if (!hasBuild && requireBuild) {
        errors.push({
            index: null,
            code: 'missing-build-must-pass',
            message: 'contract must contain at least one build-must-pass obligation. ' +
                'Add an obligation referencing the project\'s build command (e.g. "npm run build").',
        });
    }
    if (!hasTest) {
        errors.push({
            index: null,
            code: 'missing-test-must-pass',
            message: 'contract must contain at least one test-must-pass obligation. ' +
                'Add an obligation referencing the project\'s test command (e.g. "npm test").',
        });
    }
    return { valid: errors.length === 0, errors };
}
function readStringField(o, field) {
    return o[field] ?? '';
}
function isKnownType(t) {
    return typeof t === 'string' && types_1.OBLIGATION_TYPES.includes(t);
}
function checkPath(p, index) {
    if (p.length === 0) {
        return {
            index,
            code: 'empty-path',
            message: `obligation ${index} has empty path`,
        };
    }
    if (path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p)) {
        return {
            index,
            code: 'absolute-path',
            message: `obligation ${index} path "${p}" is absolute; paths must be relative to the repository root`,
        };
    }
    return null;
}
function checkCommand(cmd, index) {
    if (cmd.trim().length === 0) {
        return {
            index,
            code: 'empty-command',
            message: `obligation ${index} has empty command`,
        };
    }
    return null;
}
function checkNonemptyField(value, index, field) {
    if (value.trim().length === 0) {
        return {
            index,
            code: 'empty-field',
            message: `obligation ${index} has empty ${field}`,
        };
    }
    return null;
}
