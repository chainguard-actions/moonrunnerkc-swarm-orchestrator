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
const predicate_runner_1 = require("../../src/verification/predicate-runner");
// Unit tests for the generic predicate runner at
// src/verification/predicate-runner.ts. Adapters now consume this
// module directly via the shared shell-candidate-runner.
function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-verification-predicate-runner-'));
}
describe('runPredicate', () => {
    it('returns exitCode 0 and captures stdout when the predicate succeeds', () => {
        const ws = makeWorkspace();
        try {
            const result = (0, predicate_runner_1.runPredicate)('echo hello', ws);
            assert_1.strict.equal(result.exitCode, 0);
            assert_1.strict.match(result.output, /hello/);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('returns non-zero exitCode and captures stderr when the predicate fails', () => {
        const ws = makeWorkspace();
        try {
            const result = (0, predicate_runner_1.runPredicate)('false', ws);
            assert_1.strict.notEqual(result.exitCode, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('runs in the supplied workspaceRoot', () => {
        const ws = makeWorkspace();
        try {
            fs.writeFileSync(path.join(ws, 'marker.txt'), 'sentinel');
            const result = (0, predicate_runner_1.runPredicate)('test -f marker.txt', ws);
            assert_1.strict.equal(result.exitCode, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
});
describe('checkPredicateBaseline', () => {
    it('reports ok=true when the predicate already holds against the baseline', () => {
        const ws = makeWorkspace();
        try {
            fs.writeFileSync(path.join(ws, 'config.txt'), 'feature-flag-enabled');
            const result = (0, predicate_runner_1.checkPredicateBaseline)("grep -q 'feature-flag-enabled' config.txt", ws);
            assert_1.strict.equal(result.ok, true);
            assert_1.strict.equal(result.exitCode, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
    it('reports ok=false when the predicate fails on the baseline', () => {
        const ws = makeWorkspace();
        try {
            fs.writeFileSync(path.join(ws, 'config.txt'), 'no-flag');
            const result = (0, predicate_runner_1.checkPredicateBaseline)("grep -q 'feature-flag-enabled' config.txt", ws);
            assert_1.strict.equal(result.ok, false);
            assert_1.strict.notEqual(result.exitCode, 0);
        }
        finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });
});
