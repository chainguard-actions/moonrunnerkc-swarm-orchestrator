"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const stub_session_1 = require("../../src/session/stub-session");
const persona_1 = require("../../src/persona");
const tournament_1 = require("../../src/population/tournament");
const streaming_verifier_1 = require("../../src/verification/streaming-verifier");
const live_cost_tracker_1 = require("../../src/verification/live-cost-tracker");
class SilentSink {
    recordRoundStarted() { }
    recordCandidate() { }
    recordWinner() { }
    recordDiscard() { }
    recordEscalation() { }
}
class CapturingStreamSink {
    aborts = [];
    recordStreamAborted(p) {
        this.aborts.push({
            candidateIndex: p.candidateIndex,
            personaId: p.personaId,
            reason: p.reason,
            abortedAtChars: p.abortedAtChars,
        });
    }
}
function buildSession(perPersona, scoreFor) {
    return new stub_session_1.StubSession({
        projectContext: 'CTX',
        streamChunkSize: 8,
        responder: (req) => {
            if (req.personaId === 'tournament-verifier') {
                const m = req.userMessage.match(/<<<CANDIDATE\n([\s\S]*?)\nCANDIDATE>>>/);
                const candidate = m?.[1] ?? '';
                return JSON.stringify({ score: scoreFor(candidate), rationale: 'ok' });
            }
            return perPersona[req.personaId] ?? 'no-op';
        },
    });
}
const fileObligation = { type: 'file-must-exist', path: 'out.txt' };
describe('population/tournament — streaming verification', () => {
    it('aborts only the offending candidate; survivors continue and one wins', async () => {
        // architect's stream contains a forbidden import; implementer's does not.
        const session = buildSession({
            architect: 'import forbidden_pkg\nrest of body',
            implementer: 'clean body that scores well',
        }, (text) => (text.includes('clean body') ? 0.9 : 0));
        const sink = new CapturingStreamSink();
        const result = await (0, tournament_1.runTournament)({
            obligation: fileObligation,
            obligationIndex: 0,
            session,
            personas: { primary: [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA] },
            config: {
                candidatesPerRound: 2,
                roundCap: 1,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2],
            },
            renderUserMessage: () => 'msg',
            applyCandidate: async () => ({ satisfied: true, detail: 'applied' }),
            ledgerSink: new SilentSink(),
            streamingAssertions: [(0, streaming_verifier_1.forbiddenImportsAssertion)(['forbidden_pkg'])],
            streamingSink: sink,
        });
        assert_1.strict.equal(result.streamingAbortedCandidates, 1);
        assert_1.strict.equal(sink.aborts.length, 1);
        assert_1.strict.equal(sink.aborts[0]?.personaId, 'architect');
        assert_1.strict.match(sink.aborts[0]?.reason ?? '', /forbidden_pkg/);
        assert_1.strict.equal(result.satisfied, true);
        assert_1.strict.equal(result.winner?.personaId, 'implementer');
    });
    it('aborted candidate cannot win even when its hash matches a memo entry', async () => {
        // Both candidates emit identical aborting text. Without protection
        // the second's verdict could be inherited from the first via memo.
        const session = buildSession({
            architect: 'import forbidden_pkg\nXXX',
            implementer: 'import forbidden_pkg\nXXX',
        }, () => 0.99);
        const sink = new CapturingStreamSink();
        const result = await (0, tournament_1.runTournament)({
            obligation: fileObligation,
            obligationIndex: 0,
            session,
            personas: { primary: [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA] },
            config: {
                candidatesPerRound: 2,
                roundCap: 1,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2],
            },
            renderUserMessage: () => 'msg',
            applyCandidate: async () => ({ satisfied: true, detail: 'applied' }),
            ledgerSink: new SilentSink(),
            streamingAssertions: [(0, streaming_verifier_1.forbiddenImportsAssertion)(['forbidden_pkg'])],
            streamingSink: sink,
        });
        assert_1.strict.equal(sink.aborts.length, 2);
        assert_1.strict.equal(result.satisfied, false);
        assert_1.strict.equal(result.winner, null);
    });
    it('shared cost tracker aborts streams once projected spend crosses cap', async () => {
        const session = buildSession({
            architect: 'a'.repeat(5000),
            implementer: 'b'.repeat(5000),
        }, () => 0.9);
        const sink = new CapturingStreamSink();
        const tracker = new live_cost_tracker_1.LiveCostTracker({ budgetTokens: 50 });
        const result = await (0, tournament_1.runTournament)({
            obligation: fileObligation,
            obligationIndex: 0,
            session,
            personas: { primary: [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA] },
            config: {
                candidatesPerRound: 2,
                roundCap: 1,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2],
            },
            renderUserMessage: () => 'msg',
            applyCandidate: async () => ({ satisfied: true, detail: 'applied' }),
            ledgerSink: new SilentSink(),
            streamingAssertions: [(0, streaming_verifier_1.forbiddenImportsAssertion)([])],
            costTracker: tracker,
            streamingSink: sink,
        });
        assert_1.strict.ok(sink.aborts.length >= 1);
        for (const a of sink.aborts)
            assert_1.strict.match(a.reason, /cost-cap/);
        // No winner because all candidates aborted.
        assert_1.strict.equal(result.satisfied, false);
    });
    it('replay determinism: same inputs produce identical decisions', async () => {
        const make = () => buildSession({
            architect: 'import forbidden_pkg\nabc',
            implementer: 'good clean body',
        }, (t) => (t.includes('good clean') ? 0.95 : 0));
        const opts = (s, sink) => ({
            obligation: fileObligation,
            obligationIndex: 0,
            session: s,
            personas: { primary: [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA] },
            config: {
                candidatesPerRound: 2,
                roundCap: 1,
                scoreThreshold: 0.5,
                temperatureSchedule: [0.2],
            },
            renderUserMessage: () => 'msg',
            applyCandidate: async () => ({ satisfied: true, detail: 'applied' }),
            ledgerSink: new SilentSink(),
            streamingAssertions: [(0, streaming_verifier_1.forbiddenImportsAssertion)(['forbidden_pkg'])],
            streamingSink: sink,
        });
        const sinkA = new CapturingStreamSink();
        const sinkB = new CapturingStreamSink();
        const a = await (0, tournament_1.runTournament)(opts(make(), sinkA));
        const b = await (0, tournament_1.runTournament)(opts(make(), sinkB));
        assert_1.strict.deepEqual(sinkA.aborts, sinkB.aborts);
        assert_1.strict.equal(a.winner?.personaId, b.winner?.personaId);
        assert_1.strict.equal(a.streamingAbortedCandidates, b.streamingAbortedCandidates);
        assert_1.strict.equal(a.streamingCharsBeforeAbort, b.streamingCharsBeforeAbort);
    });
});
