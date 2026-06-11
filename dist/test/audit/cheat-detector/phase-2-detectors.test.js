"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const parse_diff_1 = __importDefault(require("parse-diff"));
const coverage_erosion_1 = require("../../../src/audit/cheat-detector/coverage-erosion");
const fake_refactor_1 = require("../../../src/audit/cheat-detector/fake-refactor");
const comment_only_fix_1 = require("../../../src/audit/cheat-detector/comment-only-fix");
const error_swallow_1 = require("../../../src/audit/cheat-detector/error-swallow");
const exception_rethrow_lost_context_1 = require("../../../src/audit/cheat-detector/exception-rethrow-lost-context");
const dead_branch_insertion_1 = require("../../../src/audit/cheat-detector/dead-branch-insertion");
function run(detector, diff) {
    return detector.run({ files: (0, parse_diff_1.default)(diff), repoRoot: '.' });
}
describe('cheat-detector / coverage-erosion', () => {
    it('warns when a source branch is added with no test addition', () => {
        const diff = `diff --git a/src/feat.ts b/src/feat.ts
--- a/src/feat.ts
+++ b/src/feat.ts
@@ -1,3 +1,4 @@
 function f(x) {
+  if (x < 0) return -1;
   return x * 2;
 }
`;
        assert_1.strict.equal(run(coverage_erosion_1.coverageErosionDetector, diff).length, 1);
    });
    it('does not fire when a matching test was added', () => {
        const diff = `diff --git a/src/feat.ts b/src/feat.ts
--- a/src/feat.ts
+++ b/src/feat.ts
@@ -1,3 +1,4 @@
 function f(x) {
+  if (x < 0) return -1;
   return x * 2;
 }
diff --git a/src/feat.test.ts b/src/feat.test.ts
--- a/src/feat.test.ts
+++ b/src/feat.test.ts
@@ -1,1 +1,2 @@
 it('positive', () => { expect(f(2)).toBe(4); });
+it('negative', () => { expect(f(-1)).toBe(-1); });
`;
        assert_1.strict.equal(run(coverage_erosion_1.coverageErosionDetector, diff).length, 0);
    });
});
describe('cheat-detector / fake-refactor', () => {
    it('blocks a rename whose callers were not updated', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,3 @@
-export function compute(x: number): number {
+export function computeV2(x: number): number {
   return x;
 }
`;
        const f = run(fake_refactor_1.fakeRefactorDetector, diff);
        assert_1.strict.equal(f.length, 1);
    });
    it('does not fire when callers are also updated in the same PR', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,3 @@
-export function compute(x: number): number {
+export function computeV2(x: number): number {
   return x;
 }
diff --git a/src/caller.ts b/src/caller.ts
--- a/src/caller.ts
+++ b/src/caller.ts
@@ -1,1 +1,1 @@
-import { compute } from './x';
+import { computeV2 } from './x';
`;
        assert_1.strict.equal(run(fake_refactor_1.fakeRefactorDetector, diff).length, 0);
    });
});
describe('cheat-detector / comment-only-fix', () => {
    it('warns when the only source addition is a comment', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,4 @@
 function f() {
+  // FIXME: still broken
   return 1;
 }
`;
        assert_1.strict.equal(run(comment_only_fix_1.commentOnlyFixDetector, diff).length, 1);
    });
    it('does not fire when real code was added', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,2 +1,3 @@
 function f() {
+  return 42;
 }
`;
        // Body matches a top-level "return" addition, which is non-comment.
        assert_1.strict.equal(run(comment_only_fix_1.commentOnlyFixDetector, diff).length, 0);
    });
});
describe('cheat-detector / error-swallow', () => {
    it('blocks an added empty catch block', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,5 @@
 function f() {
+  try {
   doIt();
+  } catch {}
 }
`;
        assert_1.strict.equal(run(error_swallow_1.errorSwallowDetector, diff).length, 1);
    });
    it('does not fire when the catch logs and rethrows', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,7 @@
 function f() {
+  try {
   doIt();
+  } catch (err) {
+    logger.error('inner failed');
+    throw err;
+  }
 }
`;
        assert_1.strict.equal(run(error_swallow_1.errorSwallowDetector, diff).length, 0);
    });
});
describe('cheat-detector / exception-rethrow-lost-context', () => {
    it('blocks throw err → throw new Error without cause', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,5 +1,5 @@
 function f() {
   try { inner(); } catch (err) {
-    throw err;
+    throw new Error('inner failed');
   }
 }
`;
        assert_1.strict.equal(run(exception_rethrow_lost_context_1.exceptionRethrowLostContextDetector, diff).length, 1);
    });
    it('does not fire when { cause } is preserved', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,5 +1,5 @@
 function f() {
   try { inner(); } catch (err) {
-    throw err;
+    throw new Error('inner failed', { cause: err });
   }
 }
`;
        assert_1.strict.equal(run(exception_rethrow_lost_context_1.exceptionRethrowLostContextDetector, diff).length, 0);
    });
});
describe('cheat-detector / dead-branch-insertion', () => {
    it('blocks an added if (false) block', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,4 @@
 function f() {
+  if (false) { return -1; }
   return 1;
 }
`;
        assert_1.strict.equal(run(dead_branch_insertion_1.deadBranchInsertionDetector, diff).length, 1);
    });
    it('does not fire on a meaningful condition', () => {
        const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,3 +1,4 @@
 function f(x) {
+  if (x < 0) { return -1; }
   return x;
 }
`;
        assert_1.strict.equal(run(dead_branch_insertion_1.deadBranchInsertionDetector, diff).length, 0);
    });
});
