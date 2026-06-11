"use strict";
/**
 * Public surface of the v8 session layer. Phase 2 ships:
 *   - The `Session` abstraction (interface, request/response/usage types).
 *   - `AnthropicSession`: the production prompt-cache-native implementation.
 *   - `StubSession`: internal-only synthetic session for tests and the
 *     synthetic benchmark; not reachable from any CLI flag.
 *   - `estimateTokens`: the four-chars-per-token estimator used by the
 *     live cost tracker and the stub session.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPatchesSource = exports.estimateTokens = exports.StubSession = exports.readAnthropicUsage = exports.DEFAULT_SESSION_MODEL = exports.AnthropicSession = exports.emptyUsage = exports.effectiveInputTokens = exports.cacheHitRate = exports.addUsage = exports.CACHE_WRITE_MULTIPLIER = exports.CACHE_READ_MULTIPLIER = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "CACHE_READ_MULTIPLIER", { enumerable: true, get: function () { return types_1.CACHE_READ_MULTIPLIER; } });
Object.defineProperty(exports, "CACHE_WRITE_MULTIPLIER", { enumerable: true, get: function () { return types_1.CACHE_WRITE_MULTIPLIER; } });
Object.defineProperty(exports, "addUsage", { enumerable: true, get: function () { return types_1.addUsage; } });
Object.defineProperty(exports, "cacheHitRate", { enumerable: true, get: function () { return types_1.cacheHitRate; } });
Object.defineProperty(exports, "effectiveInputTokens", { enumerable: true, get: function () { return types_1.effectiveInputTokens; } });
Object.defineProperty(exports, "emptyUsage", { enumerable: true, get: function () { return types_1.emptyUsage; } });
var anthropic_session_1 = require("./anthropic-session");
Object.defineProperty(exports, "AnthropicSession", { enumerable: true, get: function () { return anthropic_session_1.AnthropicSession; } });
Object.defineProperty(exports, "DEFAULT_SESSION_MODEL", { enumerable: true, get: function () { return anthropic_session_1.DEFAULT_SESSION_MODEL; } });
Object.defineProperty(exports, "readAnthropicUsage", { enumerable: true, get: function () { return anthropic_session_1.readAnthropicUsage; } });
var stub_session_1 = require("./stub-session");
Object.defineProperty(exports, "StubSession", { enumerable: true, get: function () { return stub_session_1.StubSession; } });
Object.defineProperty(exports, "estimateTokens", { enumerable: true, get: function () { return stub_session_1.estimateTokens; } });
var auto_discover_1 = require("./auto-discover");
Object.defineProperty(exports, "findPatchesSource", { enumerable: true, get: function () { return auto_discover_1.findPatchesSource; } });
