"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const heuristic_classifier_1 = require("../../../src/falsification/inspection/heuristic-classifier");
const noUpwardImports = {
    type: 'import-graph-must-satisfy',
    constraint: 'no-upward-imports',
    scope: 'src/lib1',
};
const noCycles = {
    type: 'import-graph-must-satisfy',
    constraint: 'no-cycles',
    scope: 'src/pkg1',
};
const computeSig = {
    type: 'function-must-have-signature',
    file: 'src/math/sum.ts',
    name: 'compute',
    signature: '(x: number): number',
};
describe('heuristic classifier — import-graph-must-satisfy', () => {
    it('positive: real import statement → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `import x from "../outside";\nexport default x;\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /import edge/);
    });
    it('positive: top-level re-export → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `export { thing } from "../sibling";\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /export from '\.\.\/sibling'/);
    });
    it('positive: dynamic import call → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `export const load = () => import("../outside");\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /import\('\.\.\/outside'\)/);
    });
    it('positive: require() call (CommonJS) → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.cjs',
            bytes: `const x = require("../outside");\nmodule.exports = { x };\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /require\('\.\.\/outside'\)/);
    });
    it('negative: import inside a string literal → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `export const code = "import x from \\"../outside\\";";\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-gaming');
        assert_1.strict.match(c.reason, /comments or string literals/);
    });
    it('negative: import inside a JSDoc comment → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `/** Example: import x from "../outside" */\nexport const x = 1;\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-gaming');
        assert_1.strict.match(c.reason, /comments or string literals/);
    });
    it('negative: import inside a single-line comment → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `// import x from '../outside'\nexport const x = 1;\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-gaming');
    });
    it('negative: import inside a template string → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: 'export const code = `import x from "../outside";`;\n',
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-gaming');
    });
    it('edge: file with neither code nor mention → ambiguous', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `export const x = 1;\nexport const y = 2;\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'ambiguous');
    });
    it('edge: cycle constraint with relative-path import → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/pkg1/cycle.ts',
            bytes: `import { other } from "./other";\nexport const z = other;\n`,
        }, noCycles);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /import '.\/other'/);
    });
    it('edge: conditional require — still parsed as require call → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyImportGraphCandidate)({
            relPath: 'src/lib1/leak.cjs',
            bytes: `if (process.env.X) { require("../outside"); }\n`,
        }, noUpwardImports);
        assert_1.strict.equal(c.label, 'likely-real');
    });
});
describe('heuristic classifier — function-must-have-signature', () => {
    it('positive: declaration with drifted signature → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export function compute(x: string): number {\n  return Number(x);\n}\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /signature drifted/);
        assert_1.strict.match(c.reason, /\(x: string\): number/);
    });
    it('positive: arrow function with drifted signature → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export const compute = (x: number, y: number): number => x + y;\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /signature drifted/);
    });
    it('positive: matching signature still present → ambiguous', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export function compute(x: number): number {\n  return x * 2;\n}\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'ambiguous');
        assert_1.strict.match(c.reason, /matches the expected signature/);
    });
    it('negative: name only inside a comment → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `// renamed compute to multiply\nexport function multiply(x: number): number {\n  return x * 2;\n}\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'likely-gaming');
        assert_1.strict.match(c.reason, /only inside comments or string literals/);
    });
    it('negative: name only in a string literal → likely-gaming', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export const description = "compute multiplies x by 2";\nexport function multiply(x: number): number { return x * 2; }\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'likely-gaming');
    });
    it('edge: file does not declare the function at all → ambiguous', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export const x = 1;\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'ambiguous');
        assert_1.strict.match(c.reason, /no AST-level declaration/);
    });
    it('edge: method on a class with the matching name and drifted signature → likely-real', () => {
        const c = (0, heuristic_classifier_1.classifyFunctionSignatureCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export class Calculator {\n  compute(x: string): number { return Number(x); }\n}\n`,
        }, computeSig);
        assert_1.strict.equal(c.label, 'likely-real');
        assert_1.strict.match(c.reason, /signature drifted/);
    });
});
describe('heuristic classifier — entry point', () => {
    it('dispatches to the correct branch by obligation type', () => {
        const importCase = (0, heuristic_classifier_1.classifyCandidate)({
            relPath: 'src/lib1/leak.ts',
            bytes: `import x from "../outside";\n`,
        }, noUpwardImports);
        assert_1.strict.equal(importCase.label, 'likely-real');
        const fnCase = (0, heuristic_classifier_1.classifyCandidate)({
            relPath: 'src/math/sum.ts',
            bytes: `export function compute(x: string): number { return Number(x); }\n`,
        }, computeSig);
        assert_1.strict.equal(fnCase.label, 'likely-real');
    });
});
