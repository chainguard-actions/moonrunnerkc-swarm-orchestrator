"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmError = void 0;
/**
 * Base error class for all swarm-orchestrator errors.
 *
 * Every domain-specific error in the project extends this class so that
 * callers can branch on `instanceof SwarmError` to handle any
 * orchestrator-specific failure uniformly, or drill into `.code` for
 * machine-readable dispatch.
 */
class SwarmError extends Error {
    code;
    remediation;
    constructor(message, code, options) {
        const errorOptions = options?.cause !== undefined
            ? { cause: options.cause }
            : undefined;
        super(message, errorOptions);
        this.name = 'SwarmError';
        this.code = code;
        if (options?.remediation !== undefined) {
            this.remediation = options.remediation;
        }
    }
}
exports.SwarmError = SwarmError;
