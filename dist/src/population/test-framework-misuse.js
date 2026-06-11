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
exports.isTestFilePath = isTestFilePath;
exports.detectTestFrameworkMisuse = detectTestFrameworkMisuse;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TEST_FILE_PATTERN = /(\.|_)(test|spec)\.[a-zA-Z0-9]+$|(^|\/)__tests__\//;
function isTestFilePath(relPath) {
    return TEST_FILE_PATTERN.test(relPath);
}
// Conservative: only obvious cross-framework imports/API references
// trip it. Lookalike frameworks (Jest vs Vitest) are not flagged
// against each other — a false positive (rewrite a valid file) is
// costlier than letting an ambiguous case through.
function detectTestFrameworkMisuse(repoRoot, relPath, framework) {
    const abs = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
    let body;
    try {
        body = fs.readFileSync(abs, 'utf8');
    }
    catch {
        return null;
    }
    const usesJestExpect = /\bexpect\s*\(/.test(body) && /\.\s*to(Be|Equal|StrictEqual|HaveLength|Contain|MatchObject|Throw)/i.test(body);
    const importsNodeTest = /from\s+['"]node:test['"]/.test(body) || /from\s+['"]node:assert/.test(body);
    const importsJestGlobals = /from\s+['"]@jest\/globals['"]/.test(body);
    const importsVitest = /from\s+['"]vitest['"]/.test(body);
    const importsMocha = /from\s+['"]mocha['"]/.test(body);
    const wrong = (msg) => `architect wrote ${relPath} using the wrong test framework for this project (project uses ${framework}). ${msg} Re-emit using the project's framework API.`;
    switch (framework) {
        case 'node-test':
            if (usesJestExpect)
                return wrong('File uses Jest-style `expect(x).toBe(y)`, which node:test does not support.');
            if (importsJestGlobals)
                return wrong('File imports from `@jest/globals`.');
            if (importsVitest)
                return wrong('File imports from `vitest`.');
            if (importsMocha)
                return wrong('File imports from `mocha`.');
            return null;
        case 'jest':
            if (importsNodeTest)
                return wrong('File imports from `node:test` / `node:assert`.');
            if (importsVitest)
                return wrong('File imports from `vitest`.');
            if (importsMocha)
                return wrong('File imports from `mocha`.');
            return null;
        case 'vitest':
            if (importsNodeTest)
                return wrong('File imports from `node:test` / `node:assert`.');
            if (importsJestGlobals)
                return wrong('File imports from `@jest/globals`.');
            if (importsMocha)
                return wrong('File imports from `mocha`.');
            return null;
        case 'mocha':
            if (usesJestExpect)
                return wrong('File uses Jest-style `expect(x).toBe(y)`; Mocha + chai uses `expect(x).to.equal(y)`.');
            if (importsNodeTest)
                return wrong('File imports from `node:test` / `node:assert`.');
            if (importsJestGlobals)
                return wrong('File imports from `@jest/globals`.');
            if (importsVitest)
                return wrong('File imports from `vitest`.');
            return null;
        case 'pytest':
            // pytest has no single confusable peer to flag against.
            return null;
    }
}
