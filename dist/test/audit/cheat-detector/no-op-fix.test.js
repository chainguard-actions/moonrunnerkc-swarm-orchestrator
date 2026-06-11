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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const parse_diff_1 = __importDefault(require("parse-diff"));
const no_op_fix_1 = require("../../../src/audit/cheat-detector/no-op-fix");
function tempRepo(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-noop-'));
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return dir;
}
function runOn(diff, repoRoot) {
    const files = (0, parse_diff_1.default)(diff);
    return no_op_fix_1.noOpFixDetector.run({ files, repoRoot });
}
describe('cheat-detector / no-op-fix', () => {
    it('blocks a PR that modifies only tests (no source change)', () => {
        const repo = tempRepo();
        const diff = `diff --git a/x.test.ts b/x.test.ts
--- a/x.test.ts
+++ b/x.test.ts
@@ -1,1 +1,1 @@
-  expect(addNumbers(1,2)).toBe(3);
+  expect(addNumbers(1,2)).toBeGreaterThan(0);
`;
        const findings = runOn(diff, repo);
        assert_1.strict.ok(findings.some((f) => f.category === 'no-op-fix' && f.severity === 'block'));
    });
    it('warns when source changes do not share any symbol with test changes', () => {
        const repo = tempRepo();
        const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,2 @@
+export function totallyUnrelated() { return 'foo'; }
diff --git a/test/bar.test.ts b/test/bar.test.ts
--- a/test/bar.test.ts
+++ b/test/bar.test.ts
@@ -1,1 +1,2 @@
+  expect(bazQuux).toBe(42);
`;
        const findings = runOn(diff, repo);
        assert_1.strict.ok(findings.some((f) => f.category === 'no-op-fix' && f.severity === 'warn'));
    });
    it('passes when source and test changes share a symbol', () => {
        const repo = tempRepo();
        const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,2 @@
+export function totallyUnrelated() { return 'foo'; }
diff --git a/test/bar.test.ts b/test/bar.test.ts
--- a/test/bar.test.ts
+++ b/test/bar.test.ts
@@ -1,1 +1,2 @@
+  expect(totallyUnrelated()).toBe('foo');
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 0);
    });
});
