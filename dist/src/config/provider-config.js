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
exports.emptyProviderConfig = emptyProviderConfig;
exports.loadProviderConfig = loadProviderConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const factory_1 = require("../inference/local/factory");
const factory_2 = require("../contract/extractor/factory");
const factory_3 = require("../session/factory");
const local_provider_types_1 = require("../cli/v8/local-provider-types");
function emptyProviderConfig() {
    return {
        extractor: null,
        session: null,
        local: {
            backend: null,
            baseUrl: null,
            modelExtractor: null,
            modelSession: null,
            personaModelMap: null,
            grammar: null,
            requestTimeoutMs: null,
            maxConcurrency: null,
            seed: null,
        },
    };
}
function loadProviderConfig(projectRoot) {
    const configPath = path.join(projectRoot, '.swarm', 'config.yaml');
    if (!fs.existsSync(configPath))
        return emptyProviderConfig();
    let body;
    try {
        body = fs.readFileSync(configPath, 'utf8');
    }
    catch (err) {
        throw new Error(`cannot read .swarm/config.yaml at ${configPath}: ${err.message}`, { cause: err });
    }
    let parsed;
    try {
        parsed = yaml.load(body);
    }
    catch (err) {
        throw new Error(`.swarm/config.yaml is not valid YAML: ${err.message}`, {
            cause: err,
        });
    }
    if (parsed === null || parsed === undefined)
        return emptyProviderConfig();
    if (!isRecord(parsed)) {
        throw new Error('.swarm/config.yaml must be a mapping at the top level');
    }
    const providerBlock = parsed['provider'];
    if (providerBlock === undefined)
        return emptyProviderConfig();
    if (!isRecord(providerBlock)) {
        throw new Error('.swarm/config.yaml: `provider` must be a mapping');
    }
    return parseProviderBlock(providerBlock);
}
function cfgError(msg) {
    return new Error(`.swarm/config.yaml: ${msg}`);
}
function isRecord(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function asEnum(raw, where, values) {
    if (typeof raw !== 'string')
        throw cfgError(`\`${where}\` must be a string`);
    if (!values.includes(raw)) {
        throw cfgError(`\`${where}\` "${raw}" is not one of: ${values.join(', ')}`);
    }
    return raw;
}
function asNonEmptyString(raw, where) {
    if (typeof raw !== 'string' || raw.length === 0) {
        throw cfgError(`\`${where}\` must be a non-empty string`);
    }
    return raw;
}
function asPositiveNumber(raw, where) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw cfgError(`\`${where}\` must be a positive number`);
    }
    return raw;
}
function asNonNegativeNumber(raw, where) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        throw cfgError(`\`${where}\` must be a non-negative number`);
    }
    return raw;
}
function asStringMap(raw, where) {
    if (!isRecord(raw)) {
        throw cfgError(`\`${where}\` must be a mapping of persona ids to model ids`);
    }
    const map = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v !== 'string')
            throw cfgError(`\`${where}.${k}\` must be a string`);
        map[k] = v;
    }
    return map;
}
const LOCAL_KNOBS = {
    backend: (o, r, w) => {
        o.backend = asEnum(r, w, factory_1.LOCAL_BACKEND_NAMES);
    },
    base_url: (o, r, w) => {
        o.baseUrl = asNonEmptyString(r, w);
    },
    model_extractor: (o, r, w) => {
        o.modelExtractor = asNonEmptyString(r, w);
    },
    model_session: (o, r, w) => {
        o.modelSession = asNonEmptyString(r, w);
    },
    persona_model_map: (o, r, w) => {
        o.personaModelMap = Object.freeze(asStringMap(r, w));
    },
    grammar: (o, r, w) => {
        o.grammar = asEnum(r, w, local_provider_types_1.LOCAL_GRAMMAR_MODES);
    },
    request_timeout_ms: (o, r, w) => {
        o.requestTimeoutMs = asPositiveNumber(r, w);
    },
    max_concurrency: (o, r, w) => {
        o.maxConcurrency = asPositiveNumber(r, w);
    },
    seed: (o, r, w) => {
        o.seed = asNonNegativeNumber(r, w);
    },
};
const PROVIDER_KNOBS = {
    extractor: (o, r, w) => {
        o.extractor = asEnum(r, w, factory_2.EXTRACTOR_PROVIDERS);
    },
    session: (o, r, w) => {
        o.session = asEnum(r, w, factory_3.SESSION_PROVIDERS);
    },
    local: (o, r, _w) => {
        if (!isRecord(r))
            throw cfgError('`provider.local` must be a mapping');
        o.local = parseLocalBlock(r);
    },
};
function parseProviderBlock(block) {
    const out = emptyProviderConfig();
    for (const [key, value] of Object.entries(block)) {
        const apply = PROVIDER_KNOBS[key];
        if (!apply) {
            throw cfgError(`unknown key "provider.${key}"; allowed: ${Object.keys(PROVIDER_KNOBS).join(', ')}`);
        }
        apply(out, value, `provider.${key}`);
    }
    return out;
}
function parseLocalBlock(block) {
    const out = emptyProviderConfig().local;
    for (const [key, value] of Object.entries(block)) {
        const apply = LOCAL_KNOBS[key];
        if (!apply) {
            throw cfgError(`unknown key "provider.local.${key}"; allowed: ${Object.keys(LOCAL_KNOBS).join(', ')}`);
        }
        apply(out, value, `provider.local.${key}`);
    }
    return out;
}
