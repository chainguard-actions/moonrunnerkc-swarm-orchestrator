"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const approval_1 = require("../../src/contract/approval");
const canonicalize_1 = require("../../src/contract/canonicalize");
function buildDraft(obligations) {
    return {
        schemaVersion: 'v1',
        goal: 'goal',
        repoContext: {
            repoRoot: '/tmp/x',
            buildCommand: 'npm run build',
            testCommand: 'npm test',
            language: 'typescript',
        },
        obligations,
        extractor: { name: 'stub', model: null, temperature: null, promptSha256: null },
    };
}
class StubIO {
    out = [];
    replies;
    editor;
    constructor(replies, editor) {
        this.replies = replies;
        if (editor)
            this.editor = editor;
    }
    print(line) {
        this.out.push(line);
    }
    prompt(_question) {
        const next = this.replies.shift();
        if (next === undefined) {
            return Promise.reject(new Error('no more stub replies'));
        }
        return Promise.resolve(next);
    }
    openEditor(initialContent, _filename) {
        if (!this.editor)
            return Promise.reject(new Error('editor not configured in stub'));
        return Promise.resolve(this.editor(initialContent));
    }
}
const sampleObligations = [
    { type: 'file-must-exist', path: 'src/health.ts' },
    { type: 'build-must-pass', command: 'npm run build' },
    { type: 'test-must-pass', command: 'npm test' },
];
describe('contract/approval', () => {
    it('autoApprove returns the draft unchanged without prompting', async () => {
        const io = new StubIO([]);
        const draft = buildDraft(sampleObligations);
        const approved = await (0, approval_1.runApproval)(draft, { autoApprove: true, io });
        assert_1.strict.equal(approved, draft);
        assert_1.strict.equal(io.out.length, 0);
    });
    it('approves on "a" reply', async () => {
        const io = new StubIO(['a']);
        const draft = buildDraft(sampleObligations);
        const approved = await (0, approval_1.runApproval)(draft, { io });
        assert_1.strict.equal(approved.obligations.length, 3);
    });
    it('approves on "approve" reply', async () => {
        const io = new StubIO(['approve']);
        const draft = buildDraft(sampleObligations);
        const approved = await (0, approval_1.runApproval)(draft, { io });
        assert_1.strict.equal(approved.obligations.length, 3);
    });
    it('rejects with ContractRejectedError on "r" reply', async () => {
        const io = new StubIO(['r']);
        const draft = buildDraft(sampleObligations);
        await assert_1.strict.rejects(() => (0, approval_1.runApproval)(draft, { io }), approval_1.ContractRejectedError);
    });
    it('re-prompts on unknown reply', async () => {
        const io = new StubIO(['huh', 'a']);
        const draft = buildDraft(sampleObligations);
        const approved = await (0, approval_1.runApproval)(draft, { io });
        assert_1.strict.ok(io.out.some((line) => line.includes('unknown choice')));
        assert_1.strict.equal(approved.obligations.length, 3);
    });
    it('edits successfully and approves', async () => {
        const draft = buildDraft(sampleObligations);
        const before = (0, canonicalize_1.canonicalSerialize)(sampleObligations);
        const after = before + '{"type":"file-must-exist","path":"src/extra.ts"}\n';
        const io = new StubIO(['e', 'a'], () => after);
        const approved = await (0, approval_1.runApproval)(draft, { io });
        assert_1.strict.equal(approved.obligations.length, 4);
        assert_1.strict.ok(approved.obligations.some((o) => o.type === 'file-must-exist' && o.path === 'src/extra.ts'));
    });
    it('reports invalid edited contract and re-prompts', async () => {
        const draft = buildDraft(sampleObligations);
        // edit removes the test-must-pass line, leaving an invalid contract
        const editor = (_initial) => '{"type":"file-must-exist","path":"src/health.ts"}\n' +
            '{"type":"build-must-pass","command":"npm run build"}\n';
        const io = new StubIO(['e', 'a'], editor);
        const approved = await (0, approval_1.runApproval)(draft, { io });
        assert_1.strict.ok(io.out.some((line) => line.includes('invalid contract')));
        // original draft is preserved across the failed edit
        assert_1.strict.equal(approved.obligations.length, 3);
    });
    it('disableEditor causes "e" to be treated as unknown', async () => {
        const draft = buildDraft(sampleObligations);
        const io = new StubIO(['e', 'a']);
        const approved = await (0, approval_1.runApproval)(draft, { io, disableEditor: true });
        assert_1.strict.ok(io.out.some((line) => line.includes('unknown choice')));
        assert_1.strict.equal(approved.obligations.length, 3);
    });
});
