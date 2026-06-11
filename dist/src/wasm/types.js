"use strict";
/**
 * Type definitions for the v8 Phase 5 WASM deterministic floor.
 *
 * Each `DeterministicStrategy` is a side-effecting transformation that
 * satisfies one or more obligation types by editing the workspace. The
 * runtime sandboxes its execution: writes outside `repoRoot` are
 * rejected, an explicit time budget is enforced, and a per-call scratch
 * directory is provided for temporary files.
 *
 * See `v8-implementation-guide.md` §8 and `v8-overhaul-guide.md` §5.6.
 */
Object.defineProperty(exports, "__esModule", { value: true });
