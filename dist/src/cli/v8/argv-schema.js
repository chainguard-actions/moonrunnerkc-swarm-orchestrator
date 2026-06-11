"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runParseArgs = runParseArgs;
exports.requirePositiveInt = requirePositiveInt;
exports.requireNonNegativeInt = requireNonNegativeInt;
exports.requirePositiveFloat = requirePositiveFloat;
exports.requireFiniteFloat = requireFiniteFloat;
exports.requireEnum = requireEnum;
exports.readString = readString;
exports.readBoolean = readBoolean;
const node_util_1 = require("node:util");
function runParseArgs(argv, options) {
    try {
        const { values, positionals } = (0, node_util_1.parseArgs)({
            args: collapseStringValues(argv, options),
            options,
            allowPositionals: true,
            strict: true,
        });
        return { values: values, positionals };
    }
    catch (err) {
        throw rewriteParseArgsError(err);
    }
}
// parseArgs refuses values that look like another option, so
// `--local-seed -1` triggers an ambiguous-argument error. The pre-3b
// hand-rolled parsers accepted `-1` as a value (their require-value
// check only excluded `--` prefixes) and surfaced range errors downstream
// as "must be a non-negative integer" / "must be a positive integer".
// To preserve that semantic, collapse every `--<key> <value>` pair into
// `--<key>=<value>` here for string-type options, where parseArgs accepts
// arbitrary value content. Boolean options are left alone.
function collapseStringValues(argv, options) {
    const out = [];
    for (let i = 0; i < argv.length; i += 1) {
        const tok = argv[i] ?? '';
        if (tok.startsWith('--') && !tok.includes('=')) {
            const key = tok.slice(2);
            const schema = options[key];
            if (schema !== undefined && schema.type === 'string') {
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith('--')) {
                    out.push(`${tok}=${next}`);
                    i += 1;
                    continue;
                }
            }
        }
        out.push(tok);
    }
    return out;
}
// parseArgs throws codes the handler tests assert against in their old
// "flag --foo requires a value" / "unknown flag: --foo" shape. Rewrite
// here so each handler doesn't catch-and-retoss.
function rewriteParseArgsError(err) {
    if (!(err instanceof Error))
        return new Error(String(err));
    const code = err.code ?? '';
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' || code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
        // parseArgs error messages quote flags as `'--foo'` (just the name)
        // or `'--foo <value>'` when complaining about a missing argument.
        // Extract just the leading `--xxx` so the rethrown message stays
        // byte-identical to the pre-3b hand-rolled "flag --foo requires a
        // value" / "unknown flag: --foo" shapes.
        const m = err.message.match(/'(--[A-Za-z0-9][A-Za-z0-9-]*)/);
        const flag = m?.[1] ?? '';
        if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
            return new Error(`unknown flag: ${flag}`);
        }
        if (/argument/i.test(err.message)) {
            return new Error(`flag ${flag} requires a value`);
        }
    }
    return err;
}
function requirePositiveInt(raw, flag) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`invalid ${flag} "${raw}"; must be a positive integer`);
    }
    return n;
}
function requireNonNegativeInt(raw, flag) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error(`invalid ${flag} "${raw}"; must be a non-negative integer`);
    }
    return n;
}
function requirePositiveFloat(raw, flag) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`invalid ${flag} "${raw}"; must be a positive number (USD)`);
    }
    return n;
}
function requireFiniteFloat(raw, flag) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
        throw new Error(`invalid ${flag} "${raw}"; must be a number`);
    }
    return n;
}
function requireEnum(raw, flag, values) {
    if (!values.includes(raw)) {
        throw new Error(`invalid ${flag} value "${raw}"; expected ${values.join(' | ')}`);
    }
    return raw;
}
// parseArgs returns flag values as `string | boolean | (string|boolean)[]`.
// The handlers expect specific shapes per flag, so these readers narrow
// after parse. They throw the same "flag X requires a value" shape the
// pre-3b code emitted when the parser saw a missing value, so test
// assertions on error messages stay byte-identical.
function readString(values, key) {
    const v = values[key];
    if (v === undefined)
        return undefined;
    if (typeof v !== 'string')
        return undefined;
    return v;
}
function readBoolean(values, key) {
    return values[key] === true;
}
