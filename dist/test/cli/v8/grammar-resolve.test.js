"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const grammar_resolve_1 = require("../../../src/cli/v8/grammar-resolve");
/**
 * The grammar-resolve helper is the single source of truth for what
 * `--local-grammar` means to each consumer. The tests exercise the
 * resolution table and the warning-string format the prompt specified.
 */
describe('cli/v8/grammar-resolve resolution', () => {
    it('returns null/null when no grammar was requested', () => {
        const r = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', null);
        assert_1.strict.equal(r.effective, null);
        assert_1.strict.equal(r.coercion, null);
    });
    it('honors json-schema for both consumers without coercion', () => {
        const ex = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', 'json-schema');
        assert_1.strict.equal(ex.effective, 'json-schema');
        assert_1.strict.equal(ex.coercion, null);
        const ses = (0, grammar_resolve_1.resolveGrammarForConsumer)('session', 'json-schema');
        assert_1.strict.equal(ses.effective, 'json-schema');
        assert_1.strict.equal(ses.coercion, null);
    });
    it('coerces gbnf to auto for the extractor and records the peer-honor outcome', () => {
        const r = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', 'gbnf');
        assert_1.strict.equal(r.effective, 'auto');
        assert_1.strict.ok(r.coercion);
        assert_1.strict.equal(r.coercion?.consumer, 'extractor');
        assert_1.strict.equal(r.coercion?.requested, 'gbnf');
        assert_1.strict.equal(r.coercion?.peerConsumer, 'session');
        assert_1.strict.equal(r.coercion?.peerConsumerOutcome, 'honored');
    });
    it('coerces outlines to auto for the extractor; session honors it', () => {
        const ex = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', 'outlines');
        assert_1.strict.equal(ex.effective, 'auto');
        assert_1.strict.equal(ex.coercion?.peerConsumerOutcome, 'honored');
        const ses = (0, grammar_resolve_1.resolveGrammarForConsumer)('session', 'outlines');
        assert_1.strict.equal(ses.effective, 'outlines');
        assert_1.strict.equal(ses.coercion, null);
    });
    it('exports the accepted-values tables that match factory expectations', () => {
        assert_1.strict.deepEqual([...grammar_resolve_1.EXTRACTOR_GRAMMARS], ['auto', 'json-schema', 'none']);
        assert_1.strict.deepEqual([...grammar_resolve_1.SESSION_GRAMMARS], ['auto', 'gbnf', 'json-schema', 'outlines', 'none']);
    });
});
describe('cli/v8/grammar-resolve warning text', () => {
    it('names the flag, the value, the consumer, and the session honor when peer accepts', () => {
        const r = (0, grammar_resolve_1.resolveGrammarForConsumer)('extractor', 'gbnf');
        assert_1.strict.ok(r.coercion);
        const msg = (0, grammar_resolve_1.formatGrammarWarning)(r.coercion);
        assert_1.strict.match(msg, /^warning: --local-grammar=gbnf/);
        assert_1.strict.match(msg, /does not apply to the extractor/);
        assert_1.strict.match(msg, /extractor accepts: auto, json-schema, none/);
        assert_1.strict.match(msg, /extractor will use 'auto'/);
        assert_1.strict.match(msg, /Session will use 'gbnf' as requested\./);
    });
    it('formats the both-coerced case naming both consumers', () => {
        // Synthesize a coercion record manually — no live value triggers
        // this branch today, but the formatter must still cover it for
        // forward-compat tests of new grammars.
        const msg = (0, grammar_resolve_1.formatGrammarWarning)({
            consumer: 'extractor',
            requested: 'gbnf',
            effective: 'auto',
            accepted: ['auto', 'json-schema', 'none'],
            peerConsumerOutcome: 'coerced',
            peerConsumer: 'session',
        });
        assert_1.strict.match(msg, /does not apply to the extractor/);
        assert_1.strict.match(msg, /or the session/);
        assert_1.strict.match(msg, /both consumers will use 'auto'\./);
    });
});
