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
const serializer_1 = require("../../src/contract/serializer");
function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'contract-serializer-'));
}
function sampleContract() {
    return {
        manifest: {
            schemaVersion: 'v1',
            contractHash: 'a'.repeat(64),
            contractId: 'a'.repeat(16),
            goal: 'add a health check endpoint',
            repoContext: {
                repoRoot: '/tmp/example',
                buildCommand: 'npm run build',
                testCommand: 'npm test',
                language: 'typescript',
            },
            extractor: {
                name: 'stub',
                model: null,
                temperature: null,
                promptSha256: null,
            },
            createdAt: '2026-05-08T00:00:00.000Z',
        },
        obligations: [
            { type: 'file-must-exist', path: 'src/health.ts' },
            { type: 'build-must-pass', command: 'npm run build' },
            { type: 'test-must-pass', command: 'npm test' },
        ],
    };
}
describe('contract/serializer', () => {
    describe('parseJsonl', () => {
        it('parses one obligation per line', () => {
            const text = '{"type":"file-must-exist","path":"a.ts"}\n' +
                '{"type":"build-must-pass","command":"npm run build"}\n';
            const out = (0, serializer_1.parseJsonl)(text);
            assert_1.strict.equal(out.length, 2);
        });
        it('skips blank lines', () => {
            const text = '\n\n{"type":"file-must-exist","path":"a.ts"}\n\n' +
                '{"type":"build-must-pass","command":"npm run build"}\n\n';
            assert_1.strict.equal((0, serializer_1.parseJsonl)(text).length, 2);
        });
        it('throws on a non-blank invalid line', () => {
            assert_1.strict.throws(() => (0, serializer_1.parseJsonl)('{not json}\n'), /not valid JSON/);
        });
    });
    describe('writeContract / readContract', () => {
        it('roundtrips a finalized contract', () => {
            const dir = tmpDir();
            try {
                const original = sampleContract();
                (0, serializer_1.writeContract)(dir, original);
                assert_1.strict.ok(fs.existsSync(path.join(dir, serializer_1.CONTRACT_FILENAME)));
                assert_1.strict.ok(fs.existsSync(path.join(dir, serializer_1.MANIFEST_FILENAME)));
                const reread = (0, serializer_1.readContract)(dir);
                assert_1.strict.deepEqual(reread.obligations, original.obligations);
                assert_1.strict.deepEqual(reread.manifest, original.manifest);
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
        it('rejects a manifest with an unknown schemaVersion', () => {
            const dir = tmpDir();
            try {
                const c = sampleContract();
                (0, serializer_1.writeContract)(dir, c);
                const manifestPath = path.join(dir, serializer_1.MANIFEST_FILENAME);
                const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                m.schemaVersion = 'v999';
                fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n', 'utf8');
                assert_1.strict.throws(() => (0, serializer_1.readContract)(dir), /schemaVersion "v999"/);
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
        it('rejects a contract.jsonl that fails validation', () => {
            const dir = tmpDir();
            try {
                const c = sampleContract();
                (0, serializer_1.writeContract)(dir, c);
                // overwrite with only a file obligation (missing build + test)
                fs.writeFileSync(path.join(dir, serializer_1.CONTRACT_FILENAME), '{"type":"file-must-exist","path":"a.ts"}\n', 'utf8');
                assert_1.strict.throws(() => (0, serializer_1.readContract)(dir), /failed validation/);
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
        it('throws when contract.jsonl is missing', () => {
            const dir = tmpDir();
            try {
                assert_1.strict.throws(() => (0, serializer_1.readContract)(dir), /not found/);
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    });
});
