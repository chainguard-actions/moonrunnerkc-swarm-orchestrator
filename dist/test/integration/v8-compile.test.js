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
const compile_handler_1 = require("../../src/cli/v8/compile-handler");
const stub_extractor_1 = require("../../src/contract/extractor/stub-extractor");
const serializer_1 = require("../../src/contract/serializer");
const fixtureRoot = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'v8-empty');
function tmpOut() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v8-compile-int-'));
}
describe('integration: swarm v8 compile', () => {
    const stub = () => stub_extractor_1.StubExtractor.fromHeuristic();
    it('writes a contract to --out using the stub extractor', async () => {
        const out = tmpOut();
        try {
            const exit = await (0, compile_handler_1.handleCompile)([
                'add a health check endpoint',
                '--repo-root', fixtureRoot,
                '--out', out,
                '--yes',
                '--no-editor',
            ], { extractor: stub() });
            assert_1.strict.equal(exit, 0);
            const contract = (0, serializer_1.readContract)(out);
            assert_1.strict.equal(contract.manifest.goal, 'add a health check endpoint');
            assert_1.strict.equal(contract.manifest.schemaVersion, 'v1');
            const types = contract.obligations.map((o) => o.type);
            assert_1.strict.ok(types.includes('file-must-exist'));
            assert_1.strict.ok(types.includes('build-must-pass'));
            assert_1.strict.ok(types.includes('test-must-pass'));
        }
        finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });
    it('two compiles of the same goal produce the same contract hash', async () => {
        const a = tmpOut();
        const b = tmpOut();
        try {
            const args = (out) => [
                'add a health check endpoint',
                '--repo-root', fixtureRoot,
                '--out', out,
                '--yes',
                '--no-editor',
            ];
            assert_1.strict.equal(await (0, compile_handler_1.handleCompile)(args(a), { extractor: stub() }), 0);
            assert_1.strict.equal(await (0, compile_handler_1.handleCompile)(args(b), { extractor: stub() }), 0);
            const ca = (0, serializer_1.readContract)(a);
            const cb = (0, serializer_1.readContract)(b);
            assert_1.strict.equal(ca.manifest.contractHash, cb.manifest.contractHash);
            assert_1.strict.equal(ca.manifest.contractId, cb.manifest.contractId);
        }
        finally {
            fs.rmSync(a, { recursive: true, force: true });
            fs.rmSync(b, { recursive: true, force: true });
        }
    });
    it('emits a non-empty contract.jsonl with one obligation per line', async () => {
        const out = tmpOut();
        try {
            const exit = await (0, compile_handler_1.handleCompile)([
                'add a thing',
                '--repo-root', fixtureRoot,
                '--out', out,
                '--yes',
                '--no-editor',
            ], { extractor: stub() });
            assert_1.strict.equal(exit, 0);
            const jsonl = fs.readFileSync(path.join(out, 'contract.jsonl'), 'utf8');
            const lines = jsonl.split('\n').filter((l) => l.length > 0);
            assert_1.strict.ok(lines.length >= 3, `expected ≥3 obligation lines, got ${lines.length}`);
            for (const line of lines) {
                const parsed = JSON.parse(line);
                assert_1.strict.ok(['file-must-exist', 'build-must-pass', 'test-must-pass'].includes(parsed.type));
            }
        }
        finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });
    it('rejects an unknown flag with a parse error and exit 1', async () => {
        const out = tmpOut();
        try {
            const exit = await (0, compile_handler_1.handleCompile)([
                'add a thing',
                '--repo-root', fixtureRoot,
                '--out', out,
                '--yes',
                '--no-editor',
                '--bogus',
            ], { extractor: stub() });
            assert_1.strict.equal(exit, 1);
        }
        finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });
    it('uses an injected extractor when provided', async () => {
        const out = tmpOut();
        try {
            const extractor = stub_extractor_1.StubExtractor.fromObligations([
                { type: 'file-must-exist', path: 'src/custom-injected.ts' },
                { type: 'build-must-pass', command: 'npm run build' },
                { type: 'test-must-pass', command: 'npm test' },
            ]);
            const exit = await (0, compile_handler_1.handleCompile)([
                'inject me',
                '--repo-root', fixtureRoot,
                '--out', out,
                '--yes',
                '--no-editor',
            ], { extractor });
            assert_1.strict.equal(exit, 0);
            const contract = (0, serializer_1.readContract)(out);
            assert_1.strict.ok(contract.obligations.some((o) => o.type === 'file-must-exist' && o.path === 'src/custom-injected.ts'));
        }
        finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });
});
