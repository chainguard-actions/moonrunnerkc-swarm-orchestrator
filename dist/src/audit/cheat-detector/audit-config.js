"use strict";
// Project-level audit configuration. Read from `.swarm/audit-config.yaml`
// at the repo root (when present); silently absent otherwise. The single
// supported field is `excludePaths`, a list of glob patterns that should
// be exempted from cheat detection on top of the engine's built-in
// subject-path filter.
//
// The intended use is for repos whose own source code legitimately
// contains literal cheat patterns: detector tests with embedded
// fixture diffs, rule packs that quote `if (false)` as documentation,
// generator scripts that emit broken patches by design. Without this
// hook those files force the dogfood audit to self-block on every
// commit and there is no way to fix the root cause without rewriting
// the detector to be AST-aware (out of scope for the regex engine).
//
// The glob syntax is minimal on purpose: `*` matches a path segment
// except `/`, `**` matches any number of segments. Anchored at the
// repo root unless the pattern begins with `**/`. Patterns are
// case-sensitive (paths on Linux/macOS are case-sensitive; Windows
// callers should write patterns to match).
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
exports.loadAuditConfig = loadAuditConfig;
exports.buildExcludeMatcher = buildExcludeMatcher;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CONFIG_FILE = path.join('.swarm', 'audit-config.yaml');
const EMPTY_CONFIG = { excludePaths: [] };
function loadAuditConfig(repoRoot) {
    const file = path.join(repoRoot, CONFIG_FILE);
    if (!fs.existsSync(file))
        return EMPTY_CONFIG;
    const text = fs.readFileSync(file, 'utf8');
    const excludePaths = parseExcludePaths(text);
    return { excludePaths };
}
// Hand-rolled tiny YAML scan for the one supported field. Avoids a
// runtime YAML dep on a hot-path for what is effectively a list of
// strings; the project already keeps its YAML loader scoped to
// contract parsing.
function parseExcludePaths(text) {
    const lines = text.split(/\r?\n/);
    let inExcludeBlock = false;
    const out = [];
    for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, '');
        const trimmed = line.trim();
        if (trimmed.length === 0)
            continue;
        if (/^excludePaths\s*:/.test(trimmed)) {
            inExcludeBlock = true;
            continue;
        }
        if (inExcludeBlock) {
            const m = trimmed.match(/^-\s*(['"]?)(.+?)\1\s*$/);
            if (m && m[2] !== undefined) {
                out.push(m[2]);
                continue;
            }
            // Any non-list line ends the block.
            if (!trimmed.startsWith('-'))
                inExcludeBlock = false;
        }
    }
    return out;
}
function buildExcludeMatcher(patterns) {
    if (patterns.length === 0)
        return () => false;
    const regexes = patterns.map(globToRegex);
    return (filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        return regexes.some((re) => re.test(normalized));
    };
}
function globToRegex(glob) {
    let i = 0;
    let pattern = '';
    while (i < glob.length) {
        const ch = glob[i];
        if (ch === '*' && glob[i + 1] === '*') {
            // `**/` matches zero or more path segments
            if (glob[i + 2] === '/') {
                pattern += '(?:.*/)?';
                i += 3;
            }
            else {
                pattern += '.*';
                i += 2;
            }
        }
        else if (ch === '*') {
            pattern += '[^/]*';
            i += 1;
        }
        else if (ch === '?') {
            pattern += '[^/]';
            i += 1;
        }
        else if (ch !== undefined && /[.+^$()|{}\[\]\\]/.test(ch)) {
            pattern += `\\${ch}`;
            i += 1;
        }
        else {
            pattern += ch ?? '';
            i += 1;
        }
    }
    return new RegExp(`^${pattern}$`);
}
