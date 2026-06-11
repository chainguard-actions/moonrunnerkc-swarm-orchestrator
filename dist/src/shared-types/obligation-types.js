"use strict";
// TypeScript-side mirror of `schema/v1.json`. Kept in lockstep — schema
// changes mean a v2.json, new union member, and new schema-version
// string. Phase 7 added five obligation types additively; v1 still
// accepts every Phase 0–6 obligation document.
//
// These types are shared across contract, verification, and wasm
// modules. Moving them here breaks the circular dependency that
// arose when verification and wasm both imported from contract.
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBLIGATION_TYPES = exports.CONTRACT_SCHEMA_VERSION = void 0;
exports.CONTRACT_SCHEMA_VERSION = 'v1';
// Stable canonical ordering: Phase 0–6 types keep their original
// positions so contract hashes from earlier phases stay stable; Phase 7
// additions append to the end.
exports.OBLIGATION_TYPES = [
    'file-must-exist',
    'build-must-pass',
    'test-must-pass',
    'function-must-have-signature',
    'property-must-hold',
    'import-graph-must-satisfy',
    'coverage-must-exceed',
    'performance-must-not-regress',
];
