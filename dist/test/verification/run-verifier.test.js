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
const run_verifier_1 = require("../../src/verification/run-verifier");
function tmpRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-runverify-'));
}
describe('verification/verifyObligation', () => {
    it('file-must-exist: satisfied when file exists', () => {
        const repo = tmpRoot();
        fs.writeFileSync(path.join(repo, 'CHANGES.md'), 'hello\n');
        const res = (0, run_verifier_1.verifyObligation)({ type: 'file-must-exist', path: 'CHANGES.md' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, true);
    });
    it('file-must-exist: unsatisfied when file is missing', () => {
        const repo = tmpRoot();
        const res = (0, run_verifier_1.verifyObligation)({ type: 'file-must-exist', path: 'no.txt' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, false);
        assert_1.strict.match(res.detail, /does not exist/);
    });
    it('file-must-exist: unsatisfied when path is a directory', () => {
        const repo = tmpRoot();
        fs.mkdirSync(path.join(repo, 'sub'));
        const res = (0, run_verifier_1.verifyObligation)({ type: 'file-must-exist', path: 'sub' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, false);
    });
    it('build-must-pass: satisfied on exit 0', () => {
        const repo = tmpRoot();
        const res = (0, run_verifier_1.verifyObligation)({ type: 'build-must-pass', command: 'true' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, true);
    });
    it('build-must-pass: unsatisfied on non-zero exit', () => {
        const repo = tmpRoot();
        const res = (0, run_verifier_1.verifyObligation)({ type: 'build-must-pass', command: 'false' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, false);
        assert_1.strict.match(res.detail, /exited 1/);
    });
    it('test-must-pass: command runs in repoRoot', () => {
        const repo = tmpRoot();
        const res = (0, run_verifier_1.verifyObligation)({ type: 'test-must-pass', command: 'pwd' }, { repoRoot: repo });
        assert_1.strict.equal(res.satisfied, true);
    });
});
