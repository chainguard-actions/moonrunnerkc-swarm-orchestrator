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
const CLI_RESOLVED = path.resolve(__dirname, '..', '..', '..', 'dist', 'src', 'cli.js');
function runCli(args, env = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-doctor-conn-'));
    const res = (0, child_process_1.spawnSync)('node', [CLI_RESOLVED, ...args, '--cwd', dir], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env, PATH: process.env.PATH ?? '' },
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status ?? 1 };
}
describe('doctor / --connectors', function () {
    this.timeout(10_000);
    it('includes the connector probe surface when --connectors is passed', () => {
        const { stdout, stderr } = runCli(['doctor', '--connectors'], { GITHUB_TOKEN: 'gh_dummy_token_with_length_over_twenty' });
        const combined = stdout + stderr;
        assert_1.strict.ok(combined.includes('GITHUB_TOKEN'), combined);
        assert_1.strict.ok(combined.includes('cheat-detector engine'), combined);
        assert_1.strict.ok(combined.includes('AI-BOM output directory'), combined);
    });
    it('reports GITHUB_TOKEN missing when env var is empty', () => {
        const { stdout, stderr } = runCli(['doctor', '--connectors'], { GITHUB_TOKEN: '', GH_TOKEN: '' });
        const combined = stdout + stderr;
        assert_1.strict.ok(combined.includes('GITHUB_TOKEN'), combined);
        assert_1.strict.ok(combined.includes('not set'), combined);
    });
    it('does not emit connector probes without --connectors', () => {
        const { stdout, stderr } = runCli(['doctor']);
        const combined = stdout + stderr;
        assert_1.strict.equal(combined.includes('cheat-detector engine'), false);
        assert_1.strict.equal(combined.includes('AI-BOM output directory'), false);
    });
});
