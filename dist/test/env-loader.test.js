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
const env_loader_1 = require("../src/env-loader");
/**
 * Unit tests for `parseDotenvFile` and `loadDotenv`. The functions mutate
 * `process.env`, so each test snapshots and restores the keys it touches.
 */
const TEST_KEYS = [
    'SWARM_ENV_TEST_K1',
    'SWARM_ENV_TEST_K2',
    'SWARM_ENV_TEST_K3',
    'SWARM_ENV_TEST_QUOTED',
    'SWARM_ENV_TEST_EXPORT',
    'SWARM_ENV_TEST_NO_OVERRIDE',
];
function snapshot() {
    const snap = {};
    for (const k of TEST_KEYS)
        snap[k] = process.env[k];
    return snap;
}
function restore(snap) {
    for (const [k, v] of Object.entries(snap)) {
        if (v === undefined)
            delete process.env[k];
        else
            process.env[k] = v;
    }
}
describe('env-loader parseDotenvFile', () => {
    let tmpDir;
    let originalEnv;
    beforeEach(() => {
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-test-')));
        originalEnv = snapshot();
        for (const k of TEST_KEYS)
            delete process.env[k];
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        restore(originalEnv);
    });
    it('is a no-op when the file does not exist', () => {
        (0, env_loader_1.parseDotenvFile)(path.join(tmpDir, 'missing.env'));
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, undefined);
    });
    it('parses bare KEY=value lines and sets them on process.env', () => {
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, 'SWARM_ENV_TEST_K1=plain\n');
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'plain');
    });
    it('strips matching surrounding double or single quotes', () => {
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, [
            'SWARM_ENV_TEST_K1="double quoted"',
            "SWARM_ENV_TEST_K2='single quoted'",
            'SWARM_ENV_TEST_QUOTED=" with spaces "',
        ].join('\n'));
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'double quoted');
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K2, 'single quoted');
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_QUOTED, ' with spaces ');
    });
    it('honors the `export KEY=value` form', () => {
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, 'export SWARM_ENV_TEST_EXPORT=ok\n');
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_EXPORT, 'ok');
    });
    it('skips blank lines and comments', () => {
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, [
            '',
            '# this is a comment',
            '   ',
            'SWARM_ENV_TEST_K1=after-comment',
        ].join('\n'));
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'after-comment');
    });
    it('does not overwrite a key that is already present in process.env', () => {
        process.env.SWARM_ENV_TEST_NO_OVERRIDE = 'shell-value';
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, 'SWARM_ENV_TEST_NO_OVERRIDE=file-value\n');
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_NO_OVERRIDE, 'shell-value', 'shell-exported value must beat the .env file');
    });
    it('ignores lines without an = sign', () => {
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, 'just-a-bare-token\nSWARM_ENV_TEST_K1=ok\n');
        (0, env_loader_1.parseDotenvFile)(file);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'ok');
    });
});
describe('env-loader loadDotenv', () => {
    let tmpDir;
    let originalCwd;
    let originalEnv;
    beforeEach(() => {
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-load-')));
        originalCwd = process.cwd();
        originalEnv = snapshot();
        for (const k of TEST_KEYS)
            delete process.env[k];
    });
    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        restore(originalEnv);
    });
    it('reads the cwd .env first', () => {
        fs.writeFileSync(path.join(tmpDir, '.env'), 'SWARM_ENV_TEST_K1=cwd\n');
        process.chdir(tmpDir);
        // Pass a non-existent orchestrator root so the cwd .env is the only candidate.
        (0, env_loader_1.loadDotenv)(path.join(tmpDir, 'no-such-root'));
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'cwd');
    });
    it('falls back to the orchestrator install dir when cwd has no .env', () => {
        const orchestratorRoot = path.join(tmpDir, 'orchestrator');
        fs.mkdirSync(orchestratorRoot);
        fs.writeFileSync(path.join(orchestratorRoot, '.env'), 'SWARM_ENV_TEST_K2=orchestrator\n');
        const cwd = path.join(tmpDir, 'cwd');
        fs.mkdirSync(cwd);
        process.chdir(cwd);
        (0, env_loader_1.loadDotenv)(orchestratorRoot);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K2, 'orchestrator');
    });
    it('treats cwd-and-orchestrator-the-same as a single source (no double load)', () => {
        fs.writeFileSync(path.join(tmpDir, '.env'), 'SWARM_ENV_TEST_K1=once\n');
        process.chdir(tmpDir);
        (0, env_loader_1.loadDotenv)(tmpDir);
        assert_1.strict.equal(process.env.SWARM_ENV_TEST_K1, 'once');
    });
});
