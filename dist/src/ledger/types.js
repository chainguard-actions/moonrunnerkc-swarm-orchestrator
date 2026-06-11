"use strict";
// Append-only evidence ledger type definitions. The hash chain in
// ledger.ts canonicalizes each entry minus `entryHash`, so the on-disk
// JSON bytes are determined by the *runtime* field order callers
// produce — these types only constrain shape, not serialization order.
Object.defineProperty(exports, "__esModule", { value: true });
