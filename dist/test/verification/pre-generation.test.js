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
const pre_generation_1 = require("../../src/verification/pre-generation");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-pre-gen-'));
}
describe('pre-generation verification (Phase 6)', () => {
    it('pre-verifies local-state obligations the live workspace already satisfies', () => {
        const root = tmpDir();
        fs.writeFileSync(path.join(root, 'README.md'), '# x');
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [
                { type: 'file-must-exist', path: 'README.md' },
                { type: 'file-must-exist', path: 'MISSING.md' },
            ],
            verifyOptions: { repoRoot: root },
        });
        assert_1.strict.equal(r.checks.length, 2);
        assert_1.strict.deepEqual([...r.satisfiedIndexes].sort((a, b) => a - b), [0]);
        assert_1.strict.equal(r.checks[0]?.satisfied, true);
        assert_1.strict.equal(r.checks[1]?.satisfied, false);
    });
    it('refuses to pre-verify global-state obligations while local synthesis is pending', () => {
        // Soundness rule: build/test/property/coverage/performance verifiers
        // depend on the integrated workspace. If a file-must-exist obligation
        // is still pending (will land a synthesis diff), the global verifier's
        // outcome is not stable; pre-verifying it would record a vacuous
        // "satisfied" that the post-merge check then has to flip to "failed".
        // The fix: defer global obligations until pass 1 finds nothing pending.
        const root = tmpDir();
        fs.writeFileSync(path.join(root, 'README.md'), '# x');
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [
                { type: 'file-must-exist', path: 'README.md' }, // pre-verifies (local, satisfied)
                { type: 'file-must-exist', path: 'MISSING.md' }, // pending (local, not yet)
                { type: 'build-must-pass', command: 'true' }, // global; would vacuously pass
                { type: 'test-must-pass', command: 'false' }, // global; not pre-verified either
            ],
            verifyOptions: { repoRoot: root },
        });
        // Only the 2 local obligations got checked. The 2 global obligations
        // are NOT recorded (no vacuous "pre-verified" entries).
        assert_1.strict.equal(r.checks.length, 2);
        assert_1.strict.deepEqual([...r.satisfiedIndexes].sort((a, b) => a - b), [0]);
        assert_1.strict.equal(r.checks[0]?.obligation.type, 'file-must-exist');
        assert_1.strict.equal(r.checks[1]?.obligation.type, 'file-must-exist');
    });
    it('pre-verifies global-state obligations once every local obligation is satisfied', () => {
        // When every local-state obligation already passes (either satisfied
        // by pass 1 or excluded via skipIndexes), pass 2 fires and global
        // obligations get pre-verified normally. This is the path the
        // memoized re-run uses: the second invocation against an unchanged
        // workspace skips synthesis entirely.
        const root = tmpDir();
        fs.writeFileSync(path.join(root, 'README.md'), '# x');
        fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# changelog');
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [
                { type: 'file-must-exist', path: 'README.md' },
                { type: 'file-must-exist', path: 'CHANGELOG.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            verifyOptions: { repoRoot: root },
        });
        assert_1.strict.equal(r.checks.length, 4);
        assert_1.strict.deepEqual([...r.satisfiedIndexes].sort((a, b) => a - b), [0, 1, 2, 3]);
    });
    it('pre-verifies global obligations when the only pending local obligations are skip-listed', () => {
        const root = tmpDir();
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [
                { type: 'file-must-exist', path: 'X.md' }, // not on disk, but skip-listed
                { type: 'build-must-pass', command: 'true' },
            ],
            skipIndexes: new Set([0]),
            verifyOptions: { repoRoot: root },
        });
        // Index 0 excluded. Index 1 is global; with no pending local work it pre-verifies.
        assert_1.strict.equal(r.checks.length, 1);
        assert_1.strict.equal(r.checks[0]?.obligationIndex, 1);
        assert_1.strict.equal(r.checks[0]?.satisfied, true);
    });
    it('honors skipIndexes and never invokes a verify on excluded indexes', () => {
        const root = tmpDir();
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [
                { type: 'file-must-exist', path: 'X.md' },
                { type: 'build-must-pass', command: 'true' },
            ],
            skipIndexes: new Set([0, 1]),
            verifyOptions: { repoRoot: root },
        });
        // Both excluded — no checks ran.
        assert_1.strict.equal(r.checks.length, 0);
        assert_1.strict.equal(r.satisfiedIndexes.size, 0);
    });
    it('returns empty when the contract has no obligations', () => {
        const root = tmpDir();
        const r = (0, pre_generation_1.preVerifyObligations)({
            obligations: [],
            verifyOptions: { repoRoot: root },
        });
        assert_1.strict.equal(r.checks.length, 0);
        assert_1.strict.equal(r.satisfiedIndexes.size, 0);
    });
});
