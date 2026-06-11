"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureLogger = configureLogger;
exports.setPrettyMode = setPrettyMode;
exports.getLogger = getLogger;
exports.getLoggerConfig = getLoggerConfig;
const LEVEL_RANK = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
};
const state = {
    level: 'info',
    outputFormat: 'text',
    diagnosticsToStderr: false,
    // Pretty mode: hide `[scope]` prefixes for a cleaner CLI UX.
    // Auto-enabled by user-facing commands. Scope still shown in JSON output.
    prettyMode: false,
};
function normalizeArgs(args) {
    return args.map((arg) => {
        if (typeof arg === 'string')
            return arg;
        if (arg instanceof Error)
            return arg.stack || arg.message;
        try {
            return JSON.stringify(arg);
        }
        catch {
            return String(arg);
        }
    }).join(' ');
}
function shouldLog(level) {
    if (state.level === 'silent')
        return false;
    return LEVEL_RANK[level] <= LEVEL_RANK[state.level];
}
function writeLine(stream, line) {
    stream.write(line + '\n');
}
function emit(level, scope, args) {
    if (!shouldLog(level))
        return;
    const message = normalizeArgs(args);
    if (state.outputFormat === 'json') {
        writeLine(process.stderr, JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            ...(scope ? { scope } : {}),
            message,
        }));
        return;
    }
    const prefix = (!state.prettyMode && scope) ? `[${scope}] ` : '';
    // Diagnostic levels (info/debug/trace) go to stderr when explicitly routed there
    // so the presenter owns stdout cleanly. Error/warn always to stderr.
    const isDiagnostic = level === 'info' || level === 'debug' || level === 'trace';
    const stream = level === 'error' || level === 'warn'
        ? process.stderr
        : (state.diagnosticsToStderr && isDiagnostic ? process.stderr : process.stdout);
    writeLine(stream, `${prefix}${message}`);
}
function createLogger(scope) {
    return {
        error: (...args) => emit('error', scope, args),
        warn: (...args) => emit('warn', scope, args),
        info: (...args) => emit('info', scope, args),
        debug: (...args) => emit('debug', scope, args),
        trace: (...args) => emit('trace', scope, args),
        child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
    };
}
function configureLogger(config) {
    if (config.level)
        state.level = config.level;
    if (config.outputFormat)
        state.outputFormat = config.outputFormat;
    if (config.diagnosticsToStderr !== undefined)
        state.diagnosticsToStderr = config.diagnosticsToStderr;
}
/**
 * Hide `[scope]` prefixes for a cleaner user-facing CLI UX.
 * Auto-enabled by user-facing commands; structured JSON output is unaffected.
 */
function setPrettyMode(pretty) {
    state.prettyMode = pretty;
}
function getLogger(scope) {
    return createLogger(scope);
}
function getLoggerConfig() {
    return { ...state };
}
