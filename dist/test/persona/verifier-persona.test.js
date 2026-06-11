"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const verifier_persona_1 = require("../../src/persona/verifier-persona");
const stub_session_1 = require("../../src/session/stub-session");
describe('persona/verifier-persona', () => {
    describe('parseVerifierScore', () => {
        it('parses a strict JSON envelope', () => {
            const v = (0, verifier_persona_1.parseVerifierScore)('{"score": 0.85, "rationale": "looks good"}');
            assert_1.strict.equal(v.score, 0.85);
            assert_1.strict.equal(v.rationale, 'looks good');
        });
        it('tolerates a ```json fence', () => {
            const v = (0, verifier_persona_1.parseVerifierScore)('```json\n{"score": 0.5, "rationale": "ok"}\n```');
            assert_1.strict.equal(v.score, 0.5);
            assert_1.strict.equal(v.rationale, 'ok');
        });
        it('clamps out-of-range scores into [0, 1]', () => {
            assert_1.strict.equal((0, verifier_persona_1.parseVerifierScore)('{"score": 1.5, "rationale": "x"}').score, 1);
            assert_1.strict.equal((0, verifier_persona_1.parseVerifierScore)('{"score": -0.3, "rationale": "x"}').score, 0);
        });
        it('returns a 0 score with diagnostic rationale on no JSON', () => {
            const v = (0, verifier_persona_1.parseVerifierScore)('this is just prose, no JSON anywhere');
            assert_1.strict.equal(v.score, 0);
            assert_1.strict.match(v.rationale, /no JSON/);
        });
        it('returns a 0 score on malformed JSON object', () => {
            // Has both braces so the regex extracts a candidate, but JSON.parse fails.
            const v = (0, verifier_persona_1.parseVerifierScore)('{"score": 0.5,, "rationale": "x"}');
            assert_1.strict.equal(v.score, 0);
            assert_1.strict.match(v.rationale, /JSON parse error/);
        });
        it('returns a 0 score with diagnostic rationale when no JSON object closes', () => {
            const v = (0, verifier_persona_1.parseVerifierScore)('{"score": 0.5, "rationale": ');
            assert_1.strict.equal(v.score, 0);
            assert_1.strict.match(v.rationale, /no JSON envelope/);
        });
        it('truncates excessively long rationales', () => {
            const long = 'x'.repeat(500);
            const v = (0, verifier_persona_1.parseVerifierScore)(`{"score": 0.5, "rationale": "${long}"}`);
            assert_1.strict.ok(v.rationale.length <= 240);
        });
        it('handles non-string rationale gracefully', () => {
            const v = (0, verifier_persona_1.parseVerifierScore)('{"score": 0.7, "rationale": null}');
            assert_1.strict.equal(v.score, 0.7);
            assert_1.strict.equal(v.rationale, 'no rationale');
        });
        it('preserves the raw text on every verdict', () => {
            const raw = '{"score": 0.4, "rationale": "meh"}';
            const v = (0, verifier_persona_1.parseVerifierScore)(raw);
            assert_1.strict.equal(v.rawText, raw);
        });
    });
    describe('clampScore', () => {
        it('clamps numeric inputs', () => {
            assert_1.strict.equal((0, verifier_persona_1.clampScore)(0.5), 0.5);
            assert_1.strict.equal((0, verifier_persona_1.clampScore)(2), 1);
            assert_1.strict.equal((0, verifier_persona_1.clampScore)(-1), 0);
        });
        it('coerces strings', () => {
            assert_1.strict.equal((0, verifier_persona_1.clampScore)('0.7'), 0.7);
        });
        it('returns 0 for non-numeric and NaN', () => {
            assert_1.strict.equal((0, verifier_persona_1.clampScore)('abc'), 0);
            assert_1.strict.equal((0, verifier_persona_1.clampScore)(NaN), 0);
            assert_1.strict.equal((0, verifier_persona_1.clampScore)(null), 0);
        });
    });
    describe('renderVerifierPrompt', () => {
        it('embeds the obligation JSON and candidate text', () => {
            const obligation = { type: 'file-must-exist', path: 'src/x.ts' };
            const prompt = (0, verifier_persona_1.renderVerifierPrompt)(obligation, 'export const x = 1;', 0);
            assert_1.strict.match(prompt, /file-must-exist/);
            assert_1.strict.match(prompt, /src\/x\.ts/);
            assert_1.strict.match(prompt, /export const x = 1;/);
            assert_1.strict.match(prompt, /<<<CANDIDATE/);
            assert_1.strict.match(prompt, /CANDIDATE>>>/);
        });
    });
    describe('TOURNAMENT_VERIFIER_PERSONA', () => {
        it('is a haiku-tier persona with empty handles', () => {
            assert_1.strict.equal(verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA.tier, 'haiku');
            assert_1.strict.equal(verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA.id, 'tournament-verifier');
            assert_1.strict.equal(verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA.handles.length, 0);
        });
        it('has zero temperature for deterministic scoring', () => {
            assert_1.strict.equal(verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA.sampling.temperature, 0);
        });
    });
    describe('scoreCandidate', () => {
        it('dispatches the verifier persona and returns a parsed verdict', async () => {
            const session = new stub_session_1.StubSession({
                projectContext: 'CTX',
                responder: () => '{"score": 0.9, "rationale": "great"}',
            });
            const obligation = { type: 'file-must-exist', path: 'a.txt' };
            const result = await (0, verifier_persona_1.scoreCandidate)(session, obligation, 'hello', 0);
            assert_1.strict.equal(result.score, 0.9);
            assert_1.strict.equal(result.rationale, 'great');
            assert_1.strict.ok(result.usage.outputTokens > 0);
        });
    });
});
