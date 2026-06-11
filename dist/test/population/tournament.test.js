"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const stub_session_1 = require("../../src/session/stub-session");
const persona_1 = require("../../src/persona");
const tournament_1 = require("../../src/population/tournament");
const manager_1 = require("../../src/population/manager");
/** In-memory ledger sink that records every callback for assertions. */
class RecordingSink {
    rounds = [];
    candidates = [];
    winners = [];
    discards = [];
    escalations = [];
    recordRoundStarted(args) {
        this.rounds.push({ obligationIndex: args.obligationIndex, roundIndex: args.roundIndex, personaIds: args.personaIds, temperatures: args.temperatures });
    }
    recordCandidate(args) {
        this.candidates.push({ roundIndex: args.roundIndex, candidateIndex: args.candidateIndex, personaId: args.personaId, responseSha256: args.responseSha256 });
    }
    recordWinner(args) {
        this.winners.push({ roundIndex: args.roundIndex, candidateIndex: args.candidateIndex, personaId: args.personaId, score: args.score });
    }
    recordDiscard(args) {
        this.discards.push({ roundIndex: args.roundIndex, candidateIndex: args.candidateIndex, personaId: args.personaId, score: args.score, usage: { outputTokens: args.usage.outputTokens } });
    }
    recordEscalation(args) {
        this.escalations.push({ roundsRun: args.roundsRun, bestScore: args.bestScore });
    }
}
/**
 * Build a stub session that returns different responses for each persona id,
 * and JSON envelopes for the tournament-verifier persona keyed by candidate
 * text.
 */
function buildScoredSession(args) {
    return new stub_session_1.StubSession({
        projectContext: 'CTX',
        responder: (req) => {
            if (req.personaId === 'tournament-verifier') {
                // The verifier prompt embeds the candidate verbatim between
                // <<<CANDIDATE / CANDIDATE>>> markers. Parse it back out so the
                // stub can return a deterministic score for that exact candidate.
                const match = req.userMessage.match(/<<<CANDIDATE\n([\s\S]*?)\nCANDIDATE>>>/);
                const candidate = match?.[1] ?? '';
                const score = args.scoreFor(candidate);
                return JSON.stringify({ score, rationale: `score=${score}` });
            }
            return args.candidateTexts[req.personaId] ?? 'no-op';
        },
    });
}
describe('population/tournament', () => {
    describe('pickPersonaSlate', () => {
        it('returns N copies of the primary in round 0', () => {
            const slate = (0, tournament_1.pickPersonaSlate)({ primary: [persona_1.ARCHITECT_PERSONA] }, 0, 3);
            assert_1.strict.equal(slate.length, 3);
            assert_1.strict.equal(slate[0]?.id, 'architect');
            assert_1.strict.equal(slate[2]?.id, 'architect');
        });
        it('rotates fallback personas in round 1', () => {
            const slate = (0, tournament_1.pickPersonaSlate)({ primary: [persona_1.ARCHITECT_PERSONA], fallback: [persona_1.IMPLEMENTER_PERSONA] }, 1, 2);
            assert_1.strict.equal(slate.length, 2);
            assert_1.strict.equal(slate[0]?.id, 'implementer');
            assert_1.strict.equal(slate[1]?.id, 'architect');
        });
        it('throws on empty slate', () => {
            assert_1.strict.throws(() => (0, tournament_1.pickPersonaSlate)({ primary: [] }, 0, 2), /empty persona slate/);
        });
    });
    describe('runTournament — happy path', () => {
        it('selects the highest-scoring candidate and applies it', async () => {
            const obligation = { type: 'file-must-exist', path: 'out.txt' };
            const session = buildScoredSession({
                candidateTexts: {
                    architect: 'GOOD',
                    implementer: 'BETTER',
                },
                scoreFor: (c) => (c === 'BETTER' ? 0.95 : c === 'GOOD' ? 0.6 : 0),
            });
            const sink = new RecordingSink();
            const applied = [];
            // Two distinct primary personas → round 0 slate is [architect, implementer]
            // so the verifier sees one 'GOOD' and one 'BETTER' candidate.
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.2],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async (cand) => {
                    applied.push(cand.response.text);
                    return { satisfied: true, detail: `applied ${cand.response.text}` };
                },
                ledgerSink: sink,
            });
            assert_1.strict.equal(result.satisfied, true);
            assert_1.strict.equal(result.escalated, false);
            // Implementer's 'BETTER' (0.95) beats architect's 'GOOD' (0.6).
            assert_1.strict.equal(result.winner?.personaId, 'implementer');
            assert_1.strict.equal(applied.length, 1);
            assert_1.strict.equal(applied[0], 'BETTER');
            // Round-started, candidate-recorded ×2, winner ×1, discard ×1.
            assert_1.strict.equal(sink.rounds.length, 1);
            assert_1.strict.equal(sink.candidates.length, 2);
            assert_1.strict.equal(sink.winners.length, 1);
            assert_1.strict.equal(sink.discards.length, 1);
            assert_1.strict.equal(sink.escalations.length, 0);
            // The discard's score should be lower than the winner's.
            const winnerScore = sink.winners[0]?.score ?? 0;
            const discardScore = sink.discards[0]?.score ?? 0;
            assert_1.strict.ok(discardScore < winnerScore);
        });
    });
    describe('runTournament — diversity injection', () => {
        it('rotates personas and temperatures across failed rounds', async () => {
            // Round 0: only architect, both candidates score 0.3 → below threshold.
            // Round 1: implementer rotated in via fallback, scores 0.8.
            const obligation = { type: 'build-must-pass', command: 'true' };
            const session = buildScoredSession({
                candidateTexts: {
                    architect: 'WEAK',
                    implementer: 'STRONG',
                },
                scoreFor: (c) => (c === 'STRONG' ? 0.85 : 0.3),
            });
            const sink = new RecordingSink();
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA], fallback: [persona_1.IMPLEMENTER_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.1, 0.6, 0.9],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async () => ({ satisfied: true, detail: 'ok' }),
                ledgerSink: sink,
            });
            assert_1.strict.equal(result.satisfied, true);
            assert_1.strict.ok(result.rounds.length >= 2);
            // Round 0 used baseTemp 0.1, round 1 should use 0.6 (different temperature).
            const round0Temp = sink.rounds[0]?.temperatures[0];
            const round1Temp = sink.rounds[1]?.temperatures[0];
            assert_1.strict.equal(round0Temp, 0.1);
            assert_1.strict.equal(round1Temp, 0.6);
            // Round 1 should include implementer (fallback rotation).
            const round1Personas = sink.rounds[1]?.personaIds ?? [];
            assert_1.strict.ok(round1Personas.includes('implementer'));
        });
    });
    describe('runTournament — escalation', () => {
        it('escalates after the round cap with all candidates failing', async () => {
            const obligation = { type: 'file-must-exist', path: 'x.txt' };
            const session = buildScoredSession({
                candidateTexts: {
                    architect: 'WEAK',
                    implementer: 'WEAK',
                },
                scoreFor: () => 0.2, // always below threshold
            });
            const sink = new RecordingSink();
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA], fallback: [persona_1.IMPLEMENTER_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.1, 0.5, 0.9],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async () => ({ satisfied: false, detail: 'should not be called' }),
                ledgerSink: sink,
            });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.equal(result.escalated, true);
            assert_1.strict.equal(result.rounds.length, 3);
            assert_1.strict.equal(sink.escalations.length, 1);
            assert_1.strict.equal(sink.escalations[0]?.roundsRun, 3);
            assert_1.strict.equal(sink.winners.length, 0);
            // 3 rounds × 2 candidates = 6 discards.
            assert_1.strict.equal(sink.discards.length, 6);
        });
        it('escalates when winner scores high but apply fails repeatedly', async () => {
            const obligation = { type: 'file-must-exist', path: 'x.txt' };
            const session = buildScoredSession({
                candidateTexts: { architect: 'GOOD' },
                scoreFor: () => 0.95,
            });
            const sink = new RecordingSink();
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.1, 0.5, 0.9],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async () => ({ satisfied: false, detail: 'apply failed' }),
                ledgerSink: sink,
            });
            assert_1.strict.equal(result.satisfied, false);
            assert_1.strict.equal(result.escalated, true);
            assert_1.strict.equal(result.rounds.length, 3);
            // No winner should have been recorded, even though score was high.
            assert_1.strict.equal(sink.winners.length, 0);
        });
    });
    describe('runTournament — discard cost attribution', () => {
        it('records loser usage for cost attribution per impl guide §6', async () => {
            const obligation = { type: 'file-must-exist', path: 'x.txt' };
            const session = buildScoredSession({
                candidateTexts: { architect: 'GOOD', implementer: 'BAD' },
                scoreFor: (c) => (c === 'GOOD' ? 0.9 : 0.4),
            });
            const sink = new RecordingSink();
            await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA], fallback: [persona_1.IMPLEMENTER_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.2],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async () => ({ satisfied: true, detail: 'ok' }),
                ledgerSink: sink,
            });
            // Discards must include their token usage.
            assert_1.strict.equal(sink.discards.length, 1);
            assert_1.strict.ok((sink.discards[0]?.usage.outputTokens ?? 0) > 0);
        });
    });
    describe('runTournament — totalUsage', () => {
        it('sums every generation and verifier call', async () => {
            const obligation = { type: 'file-must-exist', path: 'x.txt' };
            const session = buildScoredSession({
                candidateTexts: { architect: 'GOOD' },
                scoreFor: () => 0.9,
            });
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: [persona_1.ARCHITECT_PERSONA] },
                config: {
                    candidatesPerRound: 2,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.2],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async () => ({ satisfied: true, detail: 'ok' }),
            });
            // 2 candidate-generation calls + 2 verifier calls = 4 calls;
            // each yields some output tokens via the stub.
            assert_1.strict.ok(result.usage.outputTokens > 0);
            // session.totalUsage equals the harness usage when no other calls happened.
            const sessUsage = session.totalUsage();
            assert_1.strict.equal(result.usage.outputTokens, sessUsage.outputTokens);
        });
    });
    // Phase 3 §6 exit criterion (a): a tricky obligation produces multiple
    // candidates, the verifier picks the best, and the top candidate commits.
    describe('Phase 3 §6 (a) — tricky-obligation exit criterion', () => {
        it('runs multiple candidates, scores them, and commits the best', async () => {
            const obligation = {
                type: 'file-must-exist',
                path: 'src/timezone.ts',
            };
            // Three candidates of clearly different quality.
            const session = new stub_session_1.StubSession({
                projectContext: 'CTX',
                responder: (req) => {
                    if (req.personaId === 'tournament-verifier') {
                        const match = req.userMessage.match(/<<<CANDIDATE\n([\s\S]*?)\nCANDIDATE>>>/);
                        const candidate = match?.[1] ?? '';
                        // "GREAT" handles all edge cases; "OK" handles most; "BAD" is wrong.
                        if (candidate.includes('GREAT'))
                            return JSON.stringify({ score: 0.95, rationale: 'all edges' });
                        if (candidate.includes('OK'))
                            return JSON.stringify({ score: 0.6, rationale: 'most edges' });
                        return JSON.stringify({ score: 0.2, rationale: 'wrong' });
                    }
                    // Round 0: architect twice (slate length 1, count 2 → repeat)
                    if (req.personaId === 'architect') {
                        // Use call ordinal to vary candidate quality.
                        const fingerprint = req.userMessage.length % 3;
                        if (fingerprint === 0)
                            return 'GREAT_TZ_HANDLER';
                        if (fingerprint === 1)
                            return 'OK_TZ_HANDLER';
                        return 'BAD_TZ_HANDLER';
                    }
                    return 'no-op';
                },
            });
            const personas = [persona_1.ARCHITECT_PERSONA, persona_1.IMPLEMENTER_PERSONA, persona_1.VERIFIER_PERSONA];
            const sink = new RecordingSink();
            const applied = [];
            const result = await (0, tournament_1.runTournament)({
                obligation,
                obligationIndex: 0,
                session,
                personas: { primary: personas, fallback: [] },
                config: {
                    candidatesPerRound: 3,
                    roundCap: 3,
                    scoreThreshold: 0.5,
                    temperatureSchedule: [0.2, 0.5, 0.8],
                },
                renderUserMessage: (o) => (0, manager_1.renderDynamicMessage)(o, '/repo'),
                applyCandidate: async (cand) => {
                    applied.push(cand.response.text);
                    return { satisfied: true, detail: 'tz handler written' };
                },
                ledgerSink: sink,
            });
            assert_1.strict.equal(result.satisfied, true, 'tournament must satisfy the obligation');
            // Multiple candidates were considered.
            assert_1.strict.equal(sink.candidates.length, 3, 'three candidates were generated');
            // Exactly one winner was committed.
            assert_1.strict.equal(applied.length, 1, 'only one candidate commits');
            // The winner is the highest-scoring text.
            const winnerScore = sink.winners[0]?.score ?? 0;
            assert_1.strict.ok(winnerScore >= 0.6, 'winner clears the score threshold');
            // The losers have lower scores (cost attribution for discards).
            for (const d of sink.discards) {
                assert_1.strict.ok(d.score <= winnerScore, 'every discard scored ≤ the winner');
            }
        });
    });
});
