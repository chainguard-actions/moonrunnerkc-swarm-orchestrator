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
});
