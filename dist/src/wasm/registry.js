"use strict";
/**
 * Default strategy registry for the v8 Phase 5 deterministic floor.
 * Returns a fresh `WasmRuntime` populated with the three first-party
 * strategies the §8 spec calls out: a formatter wrapper, an import
 * sorter, and a scaffolding template engine.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STRATEGIES = exports.DEFAULT_STRATEGY_NAMES = void 0;
exports.createDefaultRuntime = createDefaultRuntime;
const wasm_runtime_1 = require("./wasm-runtime");
const format_prettier_1 = require("./strategies/format-prettier");
const import_sort_1 = require("./strategies/import-sort");
const scaffold_template_1 = require("./strategies/scaffold-template");
/** Names of the three first-party strategies, in registration order. */
exports.DEFAULT_STRATEGY_NAMES = [
    'scaffold-template',
    'import-sort',
    'format-prettier',
];
/** Snapshot of the three default strategies. Consumers may extend this list. */
exports.DEFAULT_STRATEGIES = [
    scaffold_template_1.scaffoldTemplateStrategy,
    import_sort_1.importSortStrategy,
    format_prettier_1.formatPrettierStrategy,
];
/**
 * Build a fresh runtime with the default strategies registered. Returns
 * a new instance per call so callers may register additional strategies
 * without affecting other runs.
 */
function createDefaultRuntime() {
    return new wasm_runtime_1.WasmRuntime(exports.DEFAULT_STRATEGIES);
}
