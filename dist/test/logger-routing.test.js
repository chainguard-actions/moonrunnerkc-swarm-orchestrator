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
const assert = __importStar(require("assert"));
const logger_1 = require("../src/logger");
function runCaptured(fn) {
    const stdoutChunks = [];
    const stderrChunks = [];
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk) => {
        stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
    });
    process.stderr.write = ((chunk) => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
    });
    try {
        fn();
    }
    finally {
        process.stdout.write = origStdout;
        process.stderr.write = origStderr;
    }
    return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
}
describe('Logger level routing', () => {
    let originalConfig;
    beforeEach(() => {
        originalConfig = (0, logger_1.getLoggerConfig)();
    });
    afterEach(() => {
        (0, logger_1.configureLogger)({
            level: originalConfig.level,
            outputFormat: originalConfig.outputFormat,
            diagnosticsToStderr: originalConfig.diagnosticsToStderr,
        });
        (0, logger_1.setPrettyMode)(originalConfig.prettyMode);
    });
    describe('level: info (default)', () => {
        it('emits info, warn, error; suppresses debug and trace', () => {
            (0, logger_1.configureLogger)({ level: 'info' });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.error('e');
                log.warn('w');
                log.info('i');
                log.debug('d');
                log.trace('tr');
            });
            const all = stdout + stderr;
            assert.match(all, /\[t\] e/);
            assert.match(all, /\[t\] w/);
            assert.match(all, /\[t\] i/);
            assert.doesNotMatch(all, /\[t\] d\b/);
            assert.doesNotMatch(all, /\[t\] tr/);
        });
    });
    describe('level: debug (--verbose)', () => {
        it('emits debug but still suppresses trace', () => {
            (0, logger_1.configureLogger)({ level: 'debug' });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.debug('d');
                log.trace('tr');
            });
            const all = stdout + stderr;
            assert.match(all, /\[t\] d/);
            assert.doesNotMatch(all, /\[t\] tr/);
        });
    });
    describe('level: trace', () => {
        it('emits trace', () => {
            (0, logger_1.configureLogger)({ level: 'trace' });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.trace('tr');
            });
            assert.match(stdout + stderr, /\[t\] tr/);
        });
    });
    describe('level: warn (--quiet)', () => {
        it('suppresses info, debug, and trace; emits warn and error', () => {
            (0, logger_1.configureLogger)({ level: 'warn' });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.error('e');
                log.warn('w');
                log.info('i');
                log.debug('d');
                log.trace('tr');
            });
            const all = stdout + stderr;
            assert.match(all, /\[t\] e/);
            assert.match(all, /\[t\] w/);
            assert.doesNotMatch(all, /\[t\] i/);
            assert.doesNotMatch(all, /\[t\] d\b/);
            assert.doesNotMatch(all, /\[t\] tr/);
        });
    });
    describe('level: silent', () => {
        it('suppresses everything including errors', () => {
            (0, logger_1.configureLogger)({ level: 'silent' });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.error('e');
                log.warn('w');
            });
            assert.strictEqual(stdout + stderr, '');
        });
    });
    describe('diagnosticsToStderr routing', () => {
        it('sends info/debug/trace to stderr when enabled (presenter owns stdout)', () => {
            (0, logger_1.configureLogger)({ level: 'trace', diagnosticsToStderr: true });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.info('i');
                log.debug('d');
                log.trace('tr');
            });
            assert.strictEqual(stdout, '');
            assert.match(stderr, /\[t\] i/);
            assert.match(stderr, /\[t\] d/);
            assert.match(stderr, /\[t\] tr/);
        });
        it('sends info/debug/trace to stdout by default (legacy shape)', () => {
            (0, logger_1.configureLogger)({ level: 'trace', diagnosticsToStderr: false });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.info('i');
                log.debug('d');
                log.trace('tr');
                log.error('e');
            });
            assert.match(stdout, /\[t\] i/);
            assert.match(stdout, /\[t\] d/);
            assert.match(stdout, /\[t\] tr/);
            assert.match(stderr, /\[t\] e/);
        });
    });
    describe('pretty mode', () => {
        it('hides [scope] prefix when prettyMode is on', () => {
            (0, logger_1.configureLogger)({ level: 'info', diagnosticsToStderr: false });
            (0, logger_1.setPrettyMode)(true);
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.info('hello');
            });
            const all = stdout + stderr;
            assert.match(all, /^hello/m);
            assert.doesNotMatch(all, /\[t\]/);
        });
        it('shows [scope] prefix when prettyMode is off', () => {
            (0, logger_1.configureLogger)({ level: 'info', diagnosticsToStderr: false });
            (0, logger_1.setPrettyMode)(false);
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.info('hello');
            });
            assert.match(stdout + stderr, /\[t\] hello/);
        });
    });
    describe('JSON output format', () => {
        it('emits structured records to stderr regardless of level routing', () => {
            (0, logger_1.configureLogger)({ level: 'info', outputFormat: 'json', diagnosticsToStderr: true });
            const { stdout, stderr } = runCaptured(() => {
                const log = (0, logger_1.getLogger)('t');
                log.info('hello');
            });
            assert.strictEqual(stdout, '');
            const lines = stderr.trim().split('\n').filter(Boolean);
            const record = JSON.parse(lines[lines.length - 1]);
            assert.strictEqual(record.level, 'info');
            assert.strictEqual(record.scope, 't');
            assert.strictEqual(record.message, 'hello');
        });
    });
});
