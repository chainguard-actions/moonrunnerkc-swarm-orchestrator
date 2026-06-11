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
const path = __importStar(require("path"));
const compile_handler_1 = require("../../../src/cli/v8/compile-handler");
/**
 * End-to-end assertion that the `--local-grammar` coercion warning lands
 * on stderr (not stdout) when the user supplies a value the extractor
 * cannot honor. We exercise the compile handler with `--extractor local`
 * but without a configured backend so the factory throws fast — the
 * warning has already been written by then.
 */
const fixtureRoot = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'v8-empty');
async function captureStdio(fn) {
    const io = { stderr: '', stdout: '' };
    const realErr = process.stderr.write.bind(process.stderr);
    const realOut = process.stdout.write.bind(process.stdout);
    const captureErr = ((chunk) => {
        io.stderr += typeof chunk === 'string' ? chunk : String(chunk);
        return true;
    });
    const captureOut = ((chunk) => {
        io.stdout += typeof chunk === 'string' ? chunk : String(chunk);
        return true;
    });
    process.stderr.write = captureErr;
    process.stdout.write = captureOut;
    try {
        const exit = await fn();
        return { exit, io };
    }
    finally {
        process.stderr.write = realErr;
        process.stdout.write = realOut;
    }
}
describe('cli/v8/compile-handler grammar coercion warning', () => {
    // Pre-clear env vars that would otherwise satisfy the local factory and
    // let the run reach the network. We want the factory to fail fast AFTER
    // the warning is emitted.
    let savedBackend;
    let savedBaseUrl;
    let savedModelExtractor;
    beforeEach(() => {
        savedBackend = process.env.LOCAL_LLM_BACKEND;
        savedBaseUrl = process.env.LOCAL_LLM_BASE_URL;
        savedModelExtractor = process.env.LOCAL_LLM_MODEL_EXTRACTOR;
        delete process.env.LOCAL_LLM_BACKEND;
        delete process.env.LOCAL_LLM_BASE_URL;
        delete process.env.LOCAL_LLM_MODEL_EXTRACTOR;
    });
    afterEach(() => {
        if (savedBackend === undefined)
            delete process.env.LOCAL_LLM_BACKEND;
        else
            process.env.LOCAL_LLM_BACKEND = savedBackend;
        if (savedBaseUrl === undefined)
            delete process.env.LOCAL_LLM_BASE_URL;
        else
            process.env.LOCAL_LLM_BASE_URL = savedBaseUrl;
        if (savedModelExtractor === undefined)
            delete process.env.LOCAL_LLM_MODEL_EXTRACTOR;
        else
            process.env.LOCAL_LLM_MODEL_EXTRACTOR = savedModelExtractor;
    });
    it('--local-grammar gbnf emits one warning naming the extractor on stderr', async () => {
        const { exit, io } = await captureStdio(() => (0, compile_handler_1.handleCompile)([
            'add a thing',
            '--repo-root', fixtureRoot,
            '--no-editor',
            '--yes',
            '--extractor', 'local',
            '--local-grammar', 'gbnf',
        ]));
        // Factory throws because no backend/base-url. The warning has fired
        // before the throw.
        assert_1.strict.equal(exit, 3);
        const matches = io.stderr.match(/^warning: --local-grammar=gbnf/gm) ?? [];
        assert_1.strict.equal(matches.length, 1, `expected exactly one grammar warning, got: ${io.stderr}`);
        assert_1.strict.match(io.stderr, /does not apply to the extractor/);
        assert_1.strict.match(io.stderr, /Session will use 'gbnf' as requested\./);
        assert_1.strict.equal(io.stdout.indexOf('warning: --local-grammar'), -1, 'warning must not land on stdout');
    });
    it('--local-grammar json-schema emits no grammar warning', async () => {
        const { exit, io } = await captureStdio(() => (0, compile_handler_1.handleCompile)([
            'add a thing',
            '--repo-root', fixtureRoot,
            '--no-editor',
            '--yes',
            '--extractor', 'local',
            '--local-grammar', 'json-schema',
        ]));
        assert_1.strict.equal(exit, 3);
        assert_1.strict.equal(io.stderr.indexOf('warning: --local-grammar'), -1, `unexpected warning: ${io.stderr}`);
    });
    it('--extractor deterministic with --local-grammar gbnf emits no warning (extractor is not active)', async () => {
        // When the user asks for the deterministic extractor, the grammar
        // value isn't consumed by the extractor consumer at all. Warning
        // would be misleading. We pass `--contract-file <missing>` to make
        // the run fail fast on the deterministic path.
        const { io } = await captureStdio(() => (0, compile_handler_1.handleCompile)([
            'add a thing',
            '--repo-root', fixtureRoot,
            '--no-editor',
            '--yes',
            '--local-grammar', 'gbnf',
        ]));
        assert_1.strict.equal(io.stderr.indexOf('warning: --local-grammar'), -1, `unexpected warning: ${io.stderr}`);
    });
});
