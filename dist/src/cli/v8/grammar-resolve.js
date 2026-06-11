"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_GRAMMARS = exports.EXTRACTOR_GRAMMARS = void 0;
exports.resolveGrammarForConsumer = resolveGrammarForConsumer;
exports.formatGrammarWarning = formatGrammarWarning;
/**
 * Per-consumer grammar capability resolution.
 *
 * The single `--local-grammar` flag is consumed by two independent
 * downstream pieces: the extractor (which accepts `auto`, `json-schema`,
 * `none`) and the session (which accepts every value the flag parser
 * permits). When a user-supplied value cannot be honored by a consumer,
 * the resolver substitutes `auto` for THAT consumer and surfaces a
 * structured `GrammarCoercion` record so the caller can emit a single
 * stderr warning before any inference call runs.
 *
 * Splitting the flag into per-consumer flags was considered and
 * rejected: it doubles the CLI surface for a capability that almost
 * always matches between consumers. Coercion plus explicit warning is
 * the documented behavior.
 */
/** Grammar values the extractor consumer accepts. */
exports.EXTRACTOR_GRAMMARS = [
    'auto',
    'json-schema',
    'none',
];
/** Grammar values the session consumer accepts. */
exports.SESSION_GRAMMARS = [
    'auto',
    'gbnf',
    'json-schema',
    'outlines',
    'none',
];
const ACCEPTED_BY_CONSUMER = {
    extractor: exports.EXTRACTOR_GRAMMARS,
    session: exports.SESSION_GRAMMARS,
};
function resolveGrammarForConsumer(consumer, requested) {
    if (requested === null)
        return { effective: null, coercion: null };
    const accepted = ACCEPTED_BY_CONSUMER[consumer];
    if (accepted.includes(requested)) {
        return { effective: requested, coercion: null };
    }
    const peer = consumer === 'extractor' ? 'session' : 'extractor';
    const peerAccepted = ACCEPTED_BY_CONSUMER[peer];
    return {
        effective: 'auto',
        coercion: {
            consumer,
            requested,
            effective: 'auto',
            accepted,
            peerConsumerOutcome: peerAccepted.includes(requested) ? 'honored' : 'coerced',
            peerConsumer: peer,
        },
    };
}
/**
 * Format a {@link GrammarCoercion} as the user-facing warning string
 * (without a trailing newline). The caller writes it to stderr.
 *
 * Two formats, mirroring the prompt specification:
 *
 *   - Peer honored:
 *     `warning: --local-grammar=gbnf does not apply to the extractor
 *      (extractor accepts: auto, json-schema, none); extractor will use
 *      'auto'. Session will use 'gbnf' as requested.`
 *
 *   - Peer also coerced:
 *     `warning: --local-grammar=<v> does not apply to the extractor or
 *      the session (extractor accepts: ...; session accepts: ...); both
 *      will use 'auto'.`
 */
function formatGrammarWarning(c) {
    if (c.peerConsumerOutcome === 'honored') {
        const peerCap = c.peerConsumer.charAt(0).toUpperCase() + c.peerConsumer.slice(1);
        return (`warning: --local-grammar=${c.requested} does not apply to the ${c.consumer} ` +
            `(${c.consumer} accepts: ${c.accepted.join(', ')}); ` +
            `${c.consumer} will use 'auto'. ${peerCap} will use '${c.requested}' as requested.`);
    }
    return (`warning: --local-grammar=${c.requested} does not apply to the extractor ` +
        `(extractor accepts: ${exports.EXTRACTOR_GRAMMARS.join(', ')}) ` +
        `or the session (session accepts: ${exports.SESSION_GRAMMARS.join(', ')}); ` +
        `both consumers will use 'auto'.`);
}
