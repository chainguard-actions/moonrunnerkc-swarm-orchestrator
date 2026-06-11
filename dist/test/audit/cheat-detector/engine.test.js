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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const cheat_detector_1 = require("../../../src/audit/cheat-detector");
const CLEAN_DIFF = `diff --git a/src/add.ts b/src/add.ts
--- a/src/add.ts
+++ b/src/add.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number): number {
+  if (a < 0 || b < 0) throw new Error('non-negative only');
   return a + b;
 }
diff --git a/test/add.test.ts b/test/add.test.ts
--- a/test/add.test.ts
+++ b/test/add.test.ts
@@ -1,4 +1,6 @@
 import { add } from '../src/add';
 it('adds positives', () => {
   expect(add(2, 3)).toBe(5);
+  expect(add(0, 0)).toBe(0);
 });
+it('rejects negatives', () => { expect(() => add(-1, 0)).toThrow(); });
`;
const RELAXED_DIFF = `diff --git a/test/add.test.ts b/test/add.test.ts
--- a/test/add.test.ts
+++ b/test/add.test.ts
@@ -1,3 +1,3 @@
 it('adds', () => {
-  expect(add(2,3)).toBe(5);
+  expect(add(2,3)).toBeDefined();
 });
`;
describe('cheat-detector engine', () => {
    it('exposes a stable, non-empty detector registry', () => {
        assert_1.strict.ok(cheat_detector_1.DETECTORS.length >= 10);
        const names = cheat_detector_1.DETECTORS.map((d) => d.name);
        assert_1.strict.deepEqual(names.sort(), [
            'assertion-strip',
            'comment-only-fix',
            'coverage-erosion',
            'dead-branch-insertion',
            'error-swallow',
            'exception-rethrow-lost-context',
            'fake-refactor',
            'mock-of-hallucination',
            'no-op-fix',
            'test-relaxation',
        ].sort());
    });
    it('returns pass:true on a clean PR', () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-engine-'));
        const result = (0, cheat_detector_1.runCheatDetectors)({ unifiedDiff: CLEAN_DIFF, repoRoot: repo });
        assert_1.strict.equal(result.pass, true);
    });
    it('returns pass:false when any detector reports a blocking finding', () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-engine-'));
        const result = (0, cheat_detector_1.runCheatDetectors)({ unifiedDiff: RELAXED_DIFF, repoRoot: repo });
        assert_1.strict.equal(result.pass, false);
        assert_1.strict.ok(result.findings.some((f) => f.category === 'test-relaxation'));
    });
    it('carries detectorVersions into the result', () => {
        const result = (0, cheat_detector_1.runCheatDetectors)({ unifiedDiff: CLEAN_DIFF, repoRoot: '.' });
        for (const det of cheat_detector_1.DETECTORS) {
            assert_1.strict.equal(result.detectorVersions[det.name], det.version);
        }
    });
    it('attaches agent attribution and PR metadata when provided', () => {
        const result = (0, cheat_detector_1.runCheatDetectors)({
            unifiedDiff: CLEAN_DIFF,
            repoRoot: '.',
            agent: { vendor: 'claude-code', confidence: 'high', source: 'bot-author' },
            pr: {
                number: 123,
                headSha: 'abc',
                baseSha: 'def',
                title: 'fix: test',
                body: 'Generated with Claude Code',
                author: 'claude-code[bot]',
                headRef: 'claude/fix-1',
                repository: 'owner/repo',
            },
        });
        assert_1.strict.equal(result.agent?.vendor, 'claude-code');
        assert_1.strict.equal(result.pr?.number, 123);
    });
});
