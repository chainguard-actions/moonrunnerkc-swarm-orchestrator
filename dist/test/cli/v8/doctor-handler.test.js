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
const doctor_handler_1 = require("../../../src/cli/v8/doctor-handler");
/**
 * Doctor probes the local environment. The tests exercise the
 * pass/fail bookkeeping for the cwd probe and the API-key probe
 * (those are deterministic). The CLI-on-PATH probes depend on the
 * test machine's installed binaries and are exercised indirectly via
 * the "no required failures" path with a long ANTHROPIC_API_KEY set.
 *
 * The --fix tests verify that auto-fixable issues are resolved when
 * the flag is provided.
 */
function tmp(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('cli/v8 doctor-handler', () => {
    it('returns exit 9 when ANTHROPIC_API_KEY is missing', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        const cwd = tmp('doctor-no-key-');
        try {
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd]);
            assert_1.strict.equal(exit, 9);
        }
        finally {
            if (previous !== undefined)
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('returns exit 0 when API key is present, cwd is writable, and a package manager is on PATH', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        // Stub a key with realistic length (>= 20 chars).
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-ok-');
        // Pre-create .swarm/ structure so doctor's new probes pass
        fs.mkdirSync(path.join(cwd, '.swarm', 'ledger'), { recursive: true });
        fs.mkdirSync(path.join(cwd, '.swarm', 'contracts'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'contract.yaml'), 'obligations: []\n', 'utf8');
        try {
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd]);
            // npm ships with Node so it should be on PATH on the test machine.
            assert_1.strict.equal(exit, 0);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('returns exit 9 when --require-git is set and cwd is not inside a git repo', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-no-git-');
        try {
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd, '--require-git']);
            assert_1.strict.equal(exit, 9);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('rejects unknown flags', async () => {
        await assert_1.strict.rejects(() => (0, doctor_handler_1.handleDoctor)(['--garbage']), /unknown flag/);
    });
    it('detects missing .swarm/ directory without --fix', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-no-swarm-');
        try {
            // Without .swarm/ and without --fix, doctor should fail (exit 9)
            // because missing .swarm/ is required
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd]);
            assert_1.strict.equal(exit, 9);
            // .swarm/ should NOT have been created
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm')), false);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('creates missing .swarm/ directory structure with --fix', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-fix-swarm-');
        try {
            // With --fix, doctor should auto-create .swarm/ and subdirs
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd, '--fix']);
            // After fixing, .swarm/ should exist with required subdirs
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm')), true);
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm', 'ledger')), true);
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm', 'contracts')), true);
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm', 'snapshots')), true);
            // contract.yaml should be created
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm', 'contract.yaml')), true);
            // All required issues fixed, so exit should be 0 now
            assert_1.strict.equal(exit, 0);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('removes stale lock files with --fix', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-fix-locks-');
        try {
            // Pre-create .swarm/ with locks directory containing stale files
            const locksDir = path.join(cwd, '.swarm', 'locks');
            fs.mkdirSync(locksDir, { recursive: true });
            fs.writeFileSync(path.join(locksDir, 'run-001.lock'), 'dummy', 'utf8');
            fs.writeFileSync(path.join(locksDir, 'run-002.lock'), 'dummy', 'utf8');
            // Also create required subdirs so doctor doesn't fail on those
            fs.mkdirSync(path.join(cwd, '.swarm', 'ledger'), { recursive: true });
            fs.mkdirSync(path.join(cwd, '.swarm', 'contracts'), { recursive: true });
            fs.writeFileSync(path.join(cwd, 'contract.yaml'), 'obligations: []\n', 'utf8');
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd, '--fix']);
            // Lock files should have been removed
            assert_1.strict.equal(fs.readdirSync(locksDir).length, 0);
            assert_1.strict.equal(exit, 0);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('creates missing patches.jsonl with --fix', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-fix-patches-');
        try {
            // Pre-create .swarm/ with required subdirs but no patches.jsonl
            fs.mkdirSync(path.join(cwd, '.swarm', 'ledger'), { recursive: true });
            fs.mkdirSync(path.join(cwd, '.swarm', 'contracts'), { recursive: true });
            fs.writeFileSync(path.join(cwd, 'contract.yaml'), 'obligations: []\n', 'utf8');
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd, '--fix']);
            // patches.jsonl should have been created (in .swarm/) with one no-op
            // envelope per default obligation so a subsequent `swarm run` does
            // not hit deterministic queue-exhaustion immediately.
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm', 'patches.jsonl')), true);
            const patchesText = fs.readFileSync(path.join(cwd, '.swarm', 'patches.jsonl'), 'utf8');
            const patchLines = patchesText.split('\n').filter((l) => l.trim().length > 0);
            assert_1.strict.ok(patchLines.length >= 1, 'expected at least one envelope');
            for (const line of patchLines) {
                const env = JSON.parse(line);
                assert_1.strict.equal(env.patch, 'no-op');
                assert_1.strict.equal(env.source, 'swarm-doctor');
            }
            assert_1.strict.equal(exit, 0);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    it('does not auto-fix without --fix flag', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-' + 'x'.repeat(40);
        const cwd = tmp('doctor-no-fix-');
        try {
            // Without --fix, nothing should be created
            const exit = await (0, doctor_handler_1.handleDoctor)(['--cwd', cwd]);
            // .swarm/ should NOT have been created
            assert_1.strict.equal(fs.existsSync(path.join(cwd, '.swarm')), false);
            assert_1.strict.equal(exit, 9);
        }
        finally {
            if (previous === undefined)
                delete process.env.ANTHROPIC_API_KEY;
            else
                process.env.ANTHROPIC_API_KEY = previous;
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
});
