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
const provider_bench_1 = require("../../benchmarks/provider-bench/provider-bench");
/**
 * Smoke test for the provider-comparison benchmark harness. Runs the
 * harness with `--extractor deterministic --session deterministic`
 * against the tiny inline fixture and asserts the report shape.
 */
describe('benchmarks/provider-bench (smoke)', () => {
    it('produces a non-empty report under the deterministic configuration', async () => {
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-smoke-'));
        try {
            const result = await (0, provider_bench_1.runOnce)('deterministic', 'deterministic', {
                outDir,
                extractor: 'deterministic',
                session: 'deterministic',
                compareProviders: false,
                passthrough: [],
            });
            node_assert_1.strict.equal(result.exitCode, 0, 'deterministic + deterministic must succeed on the fixture');
            node_assert_1.strict.equal(result.failed, 0);
            node_assert_1.strict.ok(result.satisfied >= 2, 'fixture has two obligations; both should be satisfied');
            node_assert_1.strict.ok(result.contractHash.length > 0);
            node_assert_1.strict.ok(result.wallTimeMs >= 0);
            node_assert_1.strict.equal(typeof result.tokens.inputTokens, 'number');
        }
        finally {
            fs.rmSync(outDir, { recursive: true, force: true });
        }
    });
});
