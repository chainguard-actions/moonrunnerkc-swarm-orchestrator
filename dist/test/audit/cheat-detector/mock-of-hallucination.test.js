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
const mock_of_hallucination_1 = require("../../../src/audit/cheat-detector/mock-of-hallucination");
function tempRepo(manifestKind, deps = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-mock-of-h-'));
    if (manifestKind === 'js') {
        const pkg = {
            name: 'fixture',
            dependencies: Object.fromEntries(deps.map((d) => [d, '*'])),
        };
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    }
    else if (manifestKind === 'py') {
        fs.writeFileSync(path.join(dir, 'requirements.txt'), deps.join('\n'));
    }
    else if (manifestKind === 'go') {
        const lines = ['module example.com/m', 'go 1.21', ''];
        for (const d of deps)
            lines.push(`require ${d} v1.0.0`);
        fs.writeFileSync(path.join(dir, 'go.mod'), lines.join('\n'));
    }
    return dir;
}
function runOn(unifiedDiff, repoRoot) {
    const files = (0, parse_diff_1.default)(unifiedDiff);
    return mock_of_hallucination_1.mockOfHallucinationDetector.run({ files, repoRoot });
}
describe('cheat-detector / mock-of-hallucination', () => {
    it('blocks jest.mock against a module missing from package.json', () => {
        const repo = tempRepo('js', ['lodash']);
        const diff = `diff --git a/foo.test.js b/foo.test.js
--- a/foo.test.js
+++ b/foo.test.js
@@ -1,1 +1,2 @@
+jest.mock('hallucinated-billing-sdk');
 const x = 1;
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 1);
        assert_1.strict.equal(findings[0]?.category, 'mock-of-hallucination');
        assert_1.strict.equal(findings[0]?.severity, 'block');
    });
    it('does not flag a mocked module that exists in package.json', () => {
        const repo = tempRepo('js', ['lodash']);
        const diff = `diff --git a/foo.test.js b/foo.test.js
--- a/foo.test.js
+++ b/foo.test.js
@@ -1,1 +1,2 @@
+jest.mock('lodash');
 const x = 1;
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 0);
    });
    it('flags @patch on a Python module missing from requirements.txt', () => {
        const repo = tempRepo('py', ['requests']);
        const diff = `diff --git a/test_x.py b/test_x.py
--- a/test_x.py
+++ b/test_x.py
@@ -1,1 +1,2 @@
+@patch('imaginary.module.thing')
 def test_x(): pass
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 1);
        assert_1.strict.equal(findings[0]?.category, 'mock-of-hallucination');
    });
    it('ignores local-relative mock targets', () => {
        const repo = tempRepo('js', []);
        const diff = `diff --git a/foo.test.js b/foo.test.js
--- a/foo.test.js
+++ b/foo.test.js
@@ -1,1 +1,2 @@
+jest.mock('./local-thing');
 const x = 1;
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 0);
    });
    it('correctly resolves scoped @org/package roots', () => {
        const repo = tempRepo('js', ['@octokit/rest']);
        const diff = `diff --git a/foo.test.js b/foo.test.js
--- a/foo.test.js
+++ b/foo.test.js
@@ -1,1 +1,2 @@
+jest.mock('@octokit/rest');
 const x = 1;
`;
        const findings = runOn(diff, repo);
        assert_1.strict.equal(findings.length, 0);
    });
});
