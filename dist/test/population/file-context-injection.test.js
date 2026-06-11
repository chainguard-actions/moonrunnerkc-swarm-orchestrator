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
const manager_1 = require("../../src/population/manager");
/**
 * Verify that renderDynamicMessage injects current file contents into
 * persona prompts for obligation types where the persona needs to know
 * the file body to write a correct diff. Without this, personas guess
 * at context lines and applyUnifiedDiff fails with context mismatches.
 */
function tmpRepo(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
describe('renderDynamicMessage file-context injection', () => {
    it('embeds the target file body for function-must-have-signature obligations', () => {
        const repo = tmpRepo('manager-file-ctx-sig-');
        try {
            const relPath = 'src/controllers/user.controller.js';
            fs.mkdirSync(path.join(repo, 'src/controllers'), { recursive: true });
            fs.writeFileSync(path.join(repo, relPath), "const catchAsync = require('../utils/catchAsync');\nconst getUser = catchAsync(async (req, res) => res.send({}));\nmodule.exports = { getUser };\n");
            const obligation = {
                type: 'function-must-have-signature',
                file: relPath,
                name: 'changeMyPassword',
                signature: '(req, res)',
            };
            const out = (0, manager_1.renderDynamicMessage)(obligation, repo);
            assert_1.strict.match(out, /Current contents of src\/controllers\/user\.controller\.js/);
            assert_1.strict.match(out, /const catchAsync = require\('\.\.\/utils\/catchAsync'\);/);
            assert_1.strict.match(out, /const getUser = catchAsync/);
        }
        finally {
            fs.rmSync(repo, { recursive: true, force: true });
        }
    });
    it('embeds files referenced in property-must-hold predicates', () => {
        const repo = tmpRepo('manager-file-ctx-pred-');
        try {
            const relPath = 'src/routes/v1/user.route.js';
            fs.mkdirSync(path.join(repo, 'src/routes/v1'), { recursive: true });
            const body = "const express = require('express');\nconst router = express.Router();\nrouter.get('/:userId', getUser);\nmodule.exports = router;\n";
            fs.writeFileSync(path.join(repo, relPath), body);
            const obligation = {
                type: 'property-must-hold',
                predicate: "grep -q 'router.post' src/routes/v1/user.route.js",
                target: 'POST route registered',
            };
            const out = (0, manager_1.renderDynamicMessage)(obligation, repo);
            assert_1.strict.match(out, /Current contents of src\/routes\/v1\/user\.route\.js/);
            assert_1.strict.match(out, /router\.get\('\/:userId'/);
        }
        finally {
            fs.rmSync(repo, { recursive: true, force: true });
        }
    });
    it('silently skips files that do not exist', () => {
        const repo = tmpRepo('manager-file-ctx-absent-');
        try {
            const obligation = {
                type: 'property-must-hold',
                predicate: "grep -q 'foo' nonexistent/file.js",
                target: 'missing file ref',
            };
            const out = (0, manager_1.renderDynamicMessage)(obligation, repo);
            // Predicate appears, but no "Current contents of" section since the file doesn't exist.
            assert_1.strict.match(out, /grep -q 'foo' nonexistent\/file\.js/);
            assert_1.strict.doesNotMatch(out, /Current contents of nonexistent\/file\.js/);
        }
        finally {
            fs.rmSync(repo, { recursive: true, force: true });
        }
    });
    it('rejects path-escape attempts (../) via repo-root containment check', () => {
        const repo = tmpRepo('manager-file-ctx-escape-');
        try {
            // Set up a file OUTSIDE the repo
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-file-ctx-outside-'));
            const secret = path.join(outside, 'secrets.txt');
            fs.writeFileSync(secret, 'SUPER-SECRET-TOKEN');
            try {
                const escapingPredicate = `cat ../${path.basename(outside)}/secrets.txt`;
                const obligation = {
                    type: 'property-must-hold',
                    predicate: escapingPredicate,
                    target: 'escape probe',
                };
                const out = (0, manager_1.renderDynamicMessage)(obligation, repo);
                assert_1.strict.doesNotMatch(out, /SUPER-SECRET-TOKEN/);
            }
            finally {
                fs.rmSync(outside, { recursive: true, force: true });
            }
        }
        finally {
            fs.rmSync(repo, { recursive: true, force: true });
        }
    });
});
