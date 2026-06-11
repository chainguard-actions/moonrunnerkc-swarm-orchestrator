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
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// The tests target the built CLI under `dist/src/cli.js` (mocha runs after build).
const CLI_RESOLVED = path.resolve(__dirname, '..', '..', '..', 'dist', 'src', 'cli.js');
function runCli(args, cwd) {
    const res = (0, child_process_1.spawnSync)('node', [CLI_RESOLVED, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        stdout: res.stdout ?? '',
        stderr: res.stderr ?? '',
        exitCode: res.status ?? 1,
    };
}
const TEST_RELAXATION_DIFF = `diff --git a/src/feat.test.ts b/src/feat.test.ts
--- a/src/feat.test.ts
+++ b/src/feat.test.ts
@@ -1,3 +1,3 @@
 it('feat', () => {
-  expect(value).toBe(5);
+  expect(value).toBeDefined();
 });
`;
const CLEAN_DIFF = `diff --git a/src/lib.ts b/src/lib.ts
--- a/src/lib.ts
+++ b/src/lib.ts
@@ -1,2 +1,3 @@
 export function f(x: number): number {
+  if (x < 0) return -1;
   return x;
 }
diff --git a/src/lib.test.ts b/src/lib.test.ts
--- a/src/lib.test.ts
+++ b/src/lib.test.ts
@@ -1,1 +1,2 @@
 it('positive', () => { expect(f(1)).toBe(1); });
+it('negative', () => { expect(f(-1)).toBe(-1); });
`;
describe('cli / swarm audit', function () {
    this.timeout(15_000);
    it('returns exit 1 with json output for a test-relaxation diff', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-audit-'));
        const diffFile = path.join(dir, 'in.patch');
        fs.writeFileSync(diffFile, TEST_RELAXATION_DIFF);
        const { stdout, exitCode } = runCli(['audit', '--diff-file', diffFile, '--repo-root', dir, '--output', 'json'], dir);
        assert_1.strict.equal(exitCode, 1, `expected exit 1, got ${exitCode}`);
        const parsed = JSON.parse(stdout);
        assert_1.strict.equal(parsed.pass, false);
        assert_1.strict.ok(parsed.findings.some((f) => f.category === 'test-relaxation'));
    });
    it('returns exit 0 for a clean diff', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-audit-clean-'));
        const diffFile = path.join(dir, 'in.patch');
        fs.writeFileSync(diffFile, CLEAN_DIFF);
        const { exitCode } = runCli(['audit', '--diff-file', diffFile, '--repo-root', dir, '--output', 'json'], dir);
        assert_1.strict.equal(exitCode, 0, `expected exit 0, got ${exitCode}`);
    });
    it('--emit-aibom cyclonedx-ml writes a valid CycloneDX file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-aibom-'));
        const diffFile = path.join(dir, 'in.patch');
        fs.writeFileSync(diffFile, TEST_RELAXATION_DIFF);
        const aibomDir = path.join(dir, 'aibom');
        runCli([
            'audit',
            '--diff-file',
            diffFile,
            '--repo-root',
            dir,
            '--output',
            'json',
            '--emit-aibom',
            'cyclonedx-ml',
            '--aibom-out',
            aibomDir,
        ], dir);
        const files = fs.readdirSync(aibomDir);
        const cdx = files.find((f) => f.endsWith('.cdx.json'));
        assert_1.strict.ok(cdx !== undefined, `expected a .cdx.json file in ${aibomDir}; got ${files}`);
        const doc = JSON.parse(fs.readFileSync(path.join(aibomDir, cdx ?? ''), 'utf8'));
        assert_1.strict.equal(doc.bomFormat, 'CycloneDX');
        assert_1.strict.equal(doc.specVersion, '1.6');
    });
    it('--help prints usage and returns 0', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-help-'));
        const { exitCode, stderr } = runCli(['audit', '--help'], dir);
        assert_1.strict.equal(exitCode, 0);
        assert_1.strict.ok(stderr.includes('usage: swarm audit'));
    });
    it('rejects missing input mode with exit 2', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-cli-bad-'));
        const { exitCode } = runCli(['audit'], dir);
        assert_1.strict.equal(exitCode, 2);
    });
});
