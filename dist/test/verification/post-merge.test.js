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
const compiler_1 = require("../../src/contract/compiler");
const post_merge_1 = require("../../src/verification/post-merge");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-post-merge-'));
}
describe('post-merge integration verification (Phase 6)', () => {
    it('passes when every obligation re-verifies', () => {
        const root = tmpDir();
        fs.writeFileSync(path.join(root, 'README.md'), '# x');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: root, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'README.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const r = (0, post_merge_1.postMergeVerify)({ contract, verifyOptions: { repoRoot: root } });
        assert_1.strict.equal(r.passed, true);
        assert_1.strict.equal(r.failedCount, 0);
        assert_1.strict.equal(r.obligationCount, 3);
        assert_1.strict.ok(r.outcomes.every((o) => o.passed));
    });
    it('surfaces per-obligation failures when one regresses', () => {
        const root = tmpDir();
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: root, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'NOT_THERE.md' },
                { type: 'build-must-pass', command: 'true' },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const r = (0, post_merge_1.postMergeVerify)({ contract, verifyOptions: { repoRoot: root } });
        assert_1.strict.equal(r.passed, false);
        assert_1.strict.equal(r.failedCount, 1);
        assert_1.strict.equal(r.outcomes[0]?.passed, false);
        assert_1.strict.equal(r.outcomes[1]?.passed, true);
        assert_1.strict.match(r.outcomes[0]?.detail ?? '', /does not exist/);
    });
    it('catches the integration-class failure: two obligations that conflict at the workspace', () => {
        // A pair of obligations where only one wins in practice. Emulate by
        // having two file-must-exist obligations on the same path with
        // different content expectations expressed only as a build command
        // that re-asserts the file body. Pre-merge each verifies in
        // isolation; post-merge sees the post-conflict state.
        const root = tmpDir();
        fs.writeFileSync(path.join(root, 'config'), 'value=A');
        const contract = (0, compiler_1.finalize)({
            schemaVersion: 'v1',
            goal: 'g',
            repoContext: { repoRoot: root, buildCommand: 'true', testCommand: 'true', language: 'typescript' },
            obligations: [
                { type: 'file-must-exist', path: 'config' },
                // This build asserts the file says "value=B", which contradicts
                // the actual post-merge content.
                { type: 'build-must-pass', command: `grep -q value=B config` },
                { type: 'test-must-pass', command: 'true' },
            ],
            extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
        });
        const r = (0, post_merge_1.postMergeVerify)({ contract, verifyOptions: { repoRoot: root } });
        assert_1.strict.equal(r.passed, false);
        // file exists, so [0] passes; the build [1] fails post-merge.
        assert_1.strict.equal(r.outcomes[0]?.passed, true);
        assert_1.strict.equal(r.outcomes[1]?.passed, false);
    });
});
