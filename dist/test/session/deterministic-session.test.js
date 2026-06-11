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
const node_assert_1 = require("node:assert");
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const deterministic_session_1 = require("../../src/session/deterministic-session");
function makeRequest(personaId, userMessage = 'do the thing') {
    return {
        personaId,
        personaSystemSuffix: '',
        sampling: { temperature: 0, maxTokens: 4096 },
        userMessage,
    };
}
const FORMAT_1_PATCH = ['<<<FILE src/x.ts', 'export const x = 1;', 'FILE>>>'].join('\n');
const FORMAT_2_PATCH = [
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1 +1 @@',
    '-export const x = 0;',
    '+export const x = 1;',
].join('\n');
const FORMAT_3_PATCH = 'no-op';
describe('session — validatePatchFormat', () => {
    it('accepts FORMAT 1 whole-file blocks', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)(FORMAT_1_PATCH);
        node_assert_1.strict.equal(r.valid, true);
        node_assert_1.strict.equal(r.format, 'format-1-whole-file');
    });
    it('accepts FORMAT 2 unified diffs', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)(FORMAT_2_PATCH);
        node_assert_1.strict.equal(r.valid, true);
        node_assert_1.strict.equal(r.format, 'format-2-unified-diff');
    });
    it('accepts FORMAT 3 literal no-op', () => {
        node_assert_1.strict.equal((0, deterministic_session_1.validatePatchFormat)('no-op').format, 'format-3-no-op');
        node_assert_1.strict.equal((0, deterministic_session_1.validatePatchFormat)('  no-op\n').format, 'format-3-no-op');
    });
    it('rejects prose preamble before a diff', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)('Here is the diff:\n--- a/x.ts\n+++ b/x.ts\n');
        node_assert_1.strict.equal(r.valid, false);
    });
    it('rejects markdown fences around a diff', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)('```diff\n--- a/x.ts\n+++ b/x.ts\n```');
        node_assert_1.strict.equal(r.valid, false);
    });
    it('rejects an unbalanced FORMAT 1 block', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)('<<<FILE src/x.ts\nbody\n');
        node_assert_1.strict.equal(r.valid, false);
        node_assert_1.strict.match(r.reason ?? '', /not balanced/);
    });
    it('rejects an empty string', () => {
        const r = (0, deterministic_session_1.validatePatchFormat)('');
        node_assert_1.strict.equal(r.valid, false);
    });
});
describe('session — DeterministicSession (preloaded)', () => {
    it('returns zero usage on every counter', () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [{ patch: FORMAT_3_PATCH }],
        });
        const u = session.totalUsage();
        node_assert_1.strict.equal(u.inputTokens, 0);
        node_assert_1.strict.equal(u.cacheReadTokens, 0);
        node_assert_1.strict.equal(u.cacheCreationTokens, 0);
        node_assert_1.strict.equal(u.outputTokens, 0);
    });
    it('emits preloaded envelopes in order on complete()', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [
                { patch: FORMAT_3_PATCH, source: 'first' },
                { patch: FORMAT_1_PATCH, source: 'second' },
            ],
        });
        const a = await session.complete(makeRequest('architect'));
        const b = await session.complete(makeRequest('implementer'));
        node_assert_1.strict.equal(a.text.trim(), 'no-op');
        node_assert_1.strict.equal(b.text, FORMAT_1_PATCH);
        node_assert_1.strict.equal(session.totalUsage().outputTokens, 0);
    });
    it('routes envelopes by persona when tagged', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [
                { patch: FORMAT_1_PATCH, persona: 'implementer' },
                { patch: FORMAT_3_PATCH, persona: 'architect' },
            ],
        });
        const arch = await session.complete(makeRequest('architect'));
        const impl = await session.complete(makeRequest('implementer'));
        node_assert_1.strict.equal(arch.text.trim(), 'no-op');
        node_assert_1.strict.equal(impl.text, FORMAT_1_PATCH);
    });
    it('rejects a malformed patch before the verifier ever sees it', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [{ patch: 'Here is the diff:\n--- a/x.ts\n+++ b/x.ts\n', source: 'bad' }],
            externalPatchesTimeoutMs: 100,
        });
        await node_assert_1.strict.rejects(() => session.complete(makeRequest('architect')), /rejected external patch/);
    });
    it('times out when no envelope is available', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [],
            externalPatchesTimeoutMs: 50,
        });
        await node_assert_1.strict.rejects(() => session.complete(makeRequest('architect')), /no external patch envelope/);
    });
    it('emits patches through the stream observer in order', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [{ patch: FORMAT_1_PATCH }],
        });
        const chunks = [];
        const result = await session.stream(makeRequest('architect'), (event) => {
            chunks.push(event.chunk);
            return { kind: 'continue' };
        });
        node_assert_1.strict.equal(result.aborted, false);
        node_assert_1.strict.equal(chunks.join(''), FORMAT_1_PATCH);
    });
    it('honors a mid-stream abort', async () => {
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'stdin' },
            preloaded: [{ patch: FORMAT_1_PATCH }],
            streamChunkSize: 4,
        });
        const result = await session.stream(makeRequest('architect'), () => ({
            kind: 'abort',
            reason: 'test',
        }));
        node_assert_1.strict.equal(result.aborted, true);
        node_assert_1.strict.equal(result.abortReason, 'test');
        node_assert_1.strict.ok(result.response.text.length < FORMAT_1_PATCH.length, `expected partial text length < ${FORMAT_1_PATCH.length}; got ${result.response.text.length}`);
    });
});
describe('session — DeterministicSession (directory channel)', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-session-dir-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('reads envelopes from a watched directory in lexicographic order', async () => {
        const envelopes = [
            { patch: FORMAT_3_PATCH, source: 'a' },
            { patch: FORMAT_1_PATCH, source: 'b' },
        ];
        fs.writeFileSync(path.join(tmpDir, '01.json'), JSON.stringify(envelopes[0]));
        fs.writeFileSync(path.join(tmpDir, '02.json'), JSON.stringify(envelopes[1]));
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'dir', path: tmpDir },
        });
        const a = await session.complete(makeRequest('p1'));
        const b = await session.complete(makeRequest('p1'));
        node_assert_1.strict.equal(a.text.trim(), 'no-op');
        node_assert_1.strict.equal(b.text, FORMAT_1_PATCH);
        // Consumed files should have been moved to the consumed/ subdir.
        node_assert_1.strict.equal(fs.existsSync(path.join(tmpDir, '01.json')), false);
        node_assert_1.strict.equal(fs.existsSync(path.join(tmpDir, 'consumed', '01.json')), true);
    });
    it('reports a useful error for a malformed file', async () => {
        fs.writeFileSync(path.join(tmpDir, '01.json'), '{ broken json');
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'dir', path: tmpDir },
            externalPatchesTimeoutMs: 100,
        });
        await node_assert_1.strict.rejects(() => session.complete(makeRequest('p1')), /failed to parse patch file/);
    });
});
describe('session — DeterministicSession (queue channel)', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-session-queue-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('reads JSONL envelopes from a queue file', async () => {
        const queue = path.join(tmpDir, 'queue.jsonl');
        fs.writeFileSync(queue, [
            JSON.stringify({ patch: FORMAT_3_PATCH }),
            JSON.stringify({ patch: FORMAT_1_PATCH }),
            '',
        ].join('\n'));
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'queue', path: queue },
        });
        const a = await session.complete(makeRequest('p'));
        const b = await session.complete(makeRequest('p'));
        node_assert_1.strict.equal(a.text.trim(), 'no-op');
        node_assert_1.strict.equal(b.text, FORMAT_1_PATCH);
    });
    it('reports a useful error for a malformed line', async () => {
        const queue = path.join(tmpDir, 'queue.jsonl');
        fs.writeFileSync(queue, '{ not json\n');
        const session = new deterministic_session_1.DeterministicSession({
            projectContext: 'ctx',
            source: { kind: 'queue', path: queue },
            externalPatchesTimeoutMs: 100,
        });
        await node_assert_1.strict.rejects(() => session.complete(makeRequest('p')), /failed to parse queue line/);
    });
});
