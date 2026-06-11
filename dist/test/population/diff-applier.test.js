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
const diff_applier_1 = require("../../src/population/diff-applier");
function tmpRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-applier-'));
}
describe('population/diff-applier', () => {
    it('extractFencedBody pulls a fenced block out of mixed prose', () => {
        const text = ['intro', '```', 'hello', '```', 'outro'].join('\n');
        assert_1.strict.equal((0, diff_applier_1.extractFencedBody)(text), 'hello');
    });
    it('extractFencedBody ignores language hint', () => {
        const text = ['```typescript', 'const x = 1;', '```'].join('\n');
        assert_1.strict.equal((0, diff_applier_1.extractFencedBody)(text), 'const x = 1;');
    });
    it('extractFencedBody returns null when there is no fence', () => {
        assert_1.strict.equal((0, diff_applier_1.extractFencedBody)('just prose'), null);
    });
    it('writeFileObligation rejects absolute paths', () => {
        const repo = tmpRoot();
        const res = (0, diff_applier_1.writeFileObligation)(repo, '/etc/passwd', 'oops');
        assert_1.strict.equal(res.applied, false);
        assert_1.strict.match(res.detail, /absolute/);
    });
    it('writeFileObligation creates parent directories', () => {
        const repo = tmpRoot();
        const res = (0, diff_applier_1.writeFileObligation)(repo, 'src/sub/dir/file.ts', 'export {};');
        assert_1.strict.equal(res.applied, true);
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'src/sub/dir/file.ts'), 'utf8'), 'export {};\n');
    });
    it('applyFileEmit prefers a fenced body when present', () => {
        const repo = tmpRoot();
        (0, diff_applier_1.applyFileEmit)(repo, 'a.txt', '```\nbody\n```');
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'body\n');
    });
    it('applyFileEmit falls back to raw response when no fence', () => {
        const repo = tmpRoot();
        (0, diff_applier_1.applyFileEmit)(repo, 'a.txt', 'just text');
        assert_1.strict.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'just text\n');
    });
});
