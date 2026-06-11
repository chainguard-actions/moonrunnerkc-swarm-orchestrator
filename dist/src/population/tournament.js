"use strict";
// Speculative-synthesis tournament harness. Per impl guide §6:
// diversity injection across rounds, hard cap of three rounds before
// escalating. The harness is agnostic to *what* personas produce —
// applyCandidate knows how to translate the winner into on-disk
// changes.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOURNAMENT_CONFIG = void 0;
exports.runTournament = runTournament;
exports.pickPersonaSlate = pickPersonaSlate;
const crypto = __importStar(require("crypto"));
const types_1 = require("../session/types");
const verifier_persona_1 = require("./../persona/verifier-persona");
const streaming_verifier_1 = require("../verification/streaming-verifier");
// File-must-exist uses a smaller pool (architects converge);
// build/test get the wider pool because the decisions are subtler.
exports.DEFAULT_TOURNAMENT_CONFIG = {
    'file-must-exist': {
        candidatesPerRound: 2,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.2, 0.5, 0.8],
    },
    'build-must-pass': {
        candidatesPerRound: 3,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.4, 0.7],
    },
    'test-must-pass': {
        candidatesPerRound: 3,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.4, 0.7],
    },
    'function-must-have-signature': {
        candidatesPerRound: 2,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.3, 0.6],
    },
    'property-must-hold': {
        candidatesPerRound: 3,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.4, 0.7],
    },
    'import-graph-must-satisfy': {
        candidatesPerRound: 2,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.4, 0.7],
    },
    'coverage-must-exceed': {
        candidatesPerRound: 3,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.2, 0.5, 0.8],
    },
    'performance-must-not-regress': {
        candidatesPerRound: 2,
        roundCap: 3,
        scoreThreshold: 0.5,
        temperatureSchedule: [0.1, 0.3, 0.6],
    },
};
async function runTournament(options) {
    const { obligation, obligationIndex, session, personas, config, ledgerSink, memoStore } = options;
    const cap = Math.min(Math.max(1, config.roundCap), 3);
    const rounds = [];
    let totalUsage = (0, types_1.emptyUsage)();
    let bestScore = 0;
    let verifierCallsSavedByMemoization = 0;
    let streamingAbortedCandidates = 0;
    let streamingCharsBeforeAbort = 0;
    const streamingAssertions = options.streamingAssertions ?? [];
    const useStreaming = streamingAssertions.length > 0 || options.costTracker !== undefined;
    // Synthetic verdict for stream-aborted candidates: cannot win a round.
    const streamAbortedVerdict = (reason) => ({
        score: -1,
        rationale: `stream-aborted: ${reason}`,
        rawText: '',
        usage: (0, types_1.emptyUsage)(),
        model: 'stream-aborted',
    });
    for (let roundIndex = 0; roundIndex < cap; roundIndex += 1) {
        const slate = pickPersonaSlate(personas, roundIndex, config.candidatesPerRound);
        const tempIdx = config.temperatureSchedule.length === 0 ? 0 : roundIndex % config.temperatureSchedule.length;
        const baseTemp = config.temperatureSchedule[tempIdx] ?? 0.2;
        ledgerSink?.recordRoundStarted({
            obligationIndex,
            obligationType: obligation.type,
            roundIndex,
            roundCap: cap,
            personaIds: slate.map((p) => p.id),
            temperatures: slate.map(() => baseTemp),
        });
        const streamAborts = [];
        const candidates = await Promise.all(slate.map(async (persona, candidateIndex) => {
            const userMessage = options.renderUserMessage(obligation, persona, roundIndex, candidateIndex);
            const sampling = { ...persona.sampling, temperature: baseTemp };
            const sessionRequest = {
                personaId: persona.id,
                personaSystemSuffix: persona.systemSuffix,
                sampling,
                userMessage,
            };
            let response;
            let aborted = false;
            let abortReason = null;
            let outcome = null;
            if (useStreaming) {
                outcome = await (0, streaming_verifier_1.runStreamingCompletion)(session, sessionRequest, obligation, streamingAssertions, options.costTracker);
                response = outcome.streamResult.response;
                aborted = outcome.aborted;
                abortReason = outcome.abortReason;
            }
            else {
                response = await session.complete(sessionRequest);
            }
            const responseSha256 = sha256(response.text);
            const candidate = {
                candidateIndex,
                personaId: persona.id,
                response,
                verdict: aborted ? streamAbortedVerdict(abortReason ?? 'unknown') : null,
                responseSha256,
                temperature: baseTemp,
            };
            streamAborts[candidateIndex] = aborted && outcome !== null
                ? { aborted: true, reason: abortReason ?? 'unknown', outcome }
                : null;
            return candidate;
        }));
        // Stream-abort entries come BEFORE candidate-recorded so audit
        // order matches causation.
        for (const c of candidates) {
            const ab = streamAborts[c.candidateIndex];
            if (!ab)
                continue;
            streamingAbortedCandidates += 1;
            streamingCharsBeforeAbort += ab.outcome.abortedAtChars;
            options.streamingSink?.recordStreamAborted({
                obligationIndex,
                roundIndex,
                candidateIndex: c.candidateIndex,
                personaId: c.personaId,
                partialResponseSha256: c.responseSha256,
                abortedAtChars: ab.outcome.abortedAtChars,
                reason: ab.reason,
                usageAtAbort: c.response.usage,
                model: c.response.model,
            });
        }
        let roundUsage = (0, types_1.emptyUsage)();
        for (const c of candidates) {
            roundUsage = (0, types_1.addUsage)(roundUsage, c.response.usage);
            ledgerSink?.recordCandidate({
                obligationIndex,
                roundIndex,
                candidateIndex: c.candidateIndex,
                personaId: c.personaId,
                responseSha256: c.responseSha256,
                usage: c.response.usage,
                model: c.response.model,
            });
        }
        const verdicts = candidates.map(() => null);
        const verdictByHash = new Map();
        const usageCountedHashes = new Set();
        // Stream-aborted verdicts MUST be staked first so an aborted
        // candidate is not silently promoted by a memo-store hash collision.
        for (const c of candidates) {
            if (c.verdict !== null && c.verdict.model === 'stream-aborted') {
                verdictByHash.set(c.responseSha256, c.verdict);
            }
        }
        if (memoStore) {
            for (const c of candidates) {
                if (verdictByHash.has(c.responseSha256))
                    continue;
                const hit = memoStore.findPriorWinnerByHash(obligation, c.responseSha256);
                if (hit) {
                    const priorScore = hit.origin.type === 'tournament-winner-selected'
                        ? hit.origin.score
                        : config.scoreThreshold;
                    const synthetic = {
                        score: Math.max(config.scoreThreshold, priorScore),
                        rationale: `memoized: ${hit.detail}`,
                        rawText: '',
                        usage: (0, types_1.emptyUsage)(),
                        model: 'memoized',
                    };
                    verdictByHash.set(c.responseSha256, synthetic);
                }
            }
        }
        const toScoreSerially = [];
        for (const c of candidates) {
            if (verdictByHash.has(c.responseSha256)) {
                verifierCallsSavedByMemoization += 1;
                continue;
            }
            // Stake the slot before scoring so later same-hash candidates
            // dedupe against this one.
            verdictByHash.set(c.responseSha256, null);
            toScoreSerially.push(c);
        }
        const freshVerdicts = await Promise.all(toScoreSerially.map((c) => {
            const opts = {};
            if (config.verifierPersona !== undefined)
                opts.persona = config.verifierPersona;
            else
                opts.persona = verifier_persona_1.TOURNAMENT_VERIFIER_PERSONA;
            if (config.verifierModel !== undefined)
                opts.model = config.verifierModel;
            return (0, verifier_persona_1.scoreCandidate)(session, obligation, c.response.text, c.candidateIndex, opts);
        }));
        for (let i = 0; i < toScoreSerially.length; i += 1) {
            const c = toScoreSerially[i];
            const v = freshVerdicts[i];
            if (!c || !v)
                continue;
            verdictByHash.set(c.responseSha256, v);
        }
        // Same-hash candidates inherit the verdict but do not double-count
        // its cost into roundUsage.
        for (let i = 0; i < candidates.length; i += 1) {
            const c = candidates[i];
            if (!c)
                continue;
            const v = verdictByHash.get(c.responseSha256) ?? null;
            verdicts[i] = v;
            if (v) {
                c.verdict = v;
                if (!usageCountedHashes.has(c.responseSha256)) {
                    roundUsage = (0, types_1.addUsage)(roundUsage, v.usage);
                    usageCountedHashes.add(c.responseSha256);
                }
                if (v.score > bestScore)
                    bestScore = v.score;
            }
        }
        const ranked = [...candidates].sort((a, b) => (b.verdict?.score ?? 0) - (a.verdict?.score ?? 0));
        const top = ranked[0] ?? null;
        let winnerIndex = null;
        const discarded = new Set();
        if (top && top.verdict && top.verdict.score >= config.scoreThreshold) {
            const apply = await options.applyCandidate(top, obligation);
            if (apply.satisfied) {
                winnerIndex = top.candidateIndex;
                const winnerInfo = {
                    roundIndex,
                    candidateIndex: top.candidateIndex,
                    personaId: top.personaId,
                };
                ledgerSink?.recordWinner({
                    obligationIndex,
                    roundIndex,
                    candidateIndex: top.candidateIndex,
                    personaId: top.personaId,
                    responseSha256: top.responseSha256,
                    score: top.verdict.score,
                    rationale: top.verdict.rationale,
                });
                if (memoStore) {
                    memoStore.ingestWinner({
                        type: 'tournament-winner-selected',
                        ts: new Date().toISOString(),
                        runId: '',
                        seq: 0,
                        prevHash: '',
                        entryHash: '',
                        obligationIndex,
                        roundIndex,
                        candidateIndex: top.candidateIndex,
                        personaId: top.personaId,
                        responseSha256: top.responseSha256,
                        score: top.verdict.score,
                        rationale: top.verdict.rationale,
                    }, obligation.type);
                }
                for (const c of candidates) {
                    if (c.candidateIndex === top.candidateIndex)
                        continue;
                    if (!c.verdict)
                        continue;
                    ledgerSink?.recordDiscard({
                        obligationIndex,
                        roundIndex,
                        candidateIndex: c.candidateIndex,
                        personaId: c.personaId,
                        responseSha256: c.responseSha256,
                        score: c.verdict.score,
                        rationale: c.verdict.rationale,
                        usage: c.response.usage,
                        model: c.response.model,
                    });
                }
                rounds.push({ roundIndex, candidates, usage: roundUsage, winnerIndex });
                totalUsage = (0, types_1.addUsage)(totalUsage, roundUsage);
                return {
                    obligationIndex,
                    rounds,
                    satisfied: true,
                    winner: winnerInfo,
                    detail: `tournament won at round ${roundIndex} by ${top.personaId} (score=${top.verdict.score.toFixed(2)}); ${apply.detail}`,
                    usage: totalUsage,
                    escalated: false,
                    bestScore,
                    verifierCallsSavedByMemoization,
                    streamingAbortedCandidates,
                    streamingCharsBeforeAbort,
                };
            }
            // Winner failed application/verification — discard and fall
            // through to the next round (or escalate when cap is hit).
            ledgerSink?.recordDiscard({
                obligationIndex,
                roundIndex,
                candidateIndex: top.candidateIndex,
                personaId: top.personaId,
                responseSha256: top.responseSha256,
                score: top.verdict.score,
                rationale: `apply failed: ${apply.detail}`,
                usage: top.response.usage,
                model: top.response.model,
            });
            discarded.add(top.candidateIndex);
        }
        for (const c of candidates) {
            if (!c.verdict)
                continue;
            if (discarded.has(c.candidateIndex))
                continue;
            ledgerSink?.recordDiscard({
                obligationIndex,
                roundIndex,
                candidateIndex: c.candidateIndex,
                personaId: c.personaId,
                responseSha256: c.responseSha256,
                score: c.verdict.score,
                rationale: c.verdict.rationale,
                usage: c.response.usage,
                model: c.response.model,
            });
        }
        rounds.push({ roundIndex, candidates, usage: roundUsage, winnerIndex });
        totalUsage = (0, types_1.addUsage)(totalUsage, roundUsage);
    }
    ledgerSink?.recordEscalation({
        obligationIndex,
        obligationType: obligation.type,
        roundsRun: rounds.length,
        bestScore,
        detail: `tournament exhausted ${rounds.length} round(s) without satisfying obligation`,
    });
    return {
        obligationIndex,
        rounds,
        satisfied: false,
        winner: null,
        detail: `tournament escalated after ${rounds.length} round(s); best score ${bestScore.toFixed(2)}`,
        usage: totalUsage,
        escalated: true,
        bestScore,
        verifierCallsSavedByMemoization,
        streamingAbortedCandidates,
        streamingCharsBeforeAbort,
    };
}
// Round 0 uses primaries; later rounds rotate in fallbacks. Repeats
// from primary when the slate is shorter than `count` — the
// "same persona at different temperatures" path.
function pickPersonaSlate(slate, roundIndex, count) {
    const pool = roundIndex === 0 || (slate.fallback?.length ?? 0) === 0
        ? [...slate.primary]
        : roundIndex % 2 === 1
            ? [...(slate.fallback ?? []), ...slate.primary]
            : [...slate.primary, ...(slate.fallback ?? [])];
    if (pool.length === 0) {
        throw new Error('tournament: empty persona slate');
    }
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const persona = pool[i % pool.length];
        if (persona)
            out.push(persona);
    }
    return out;
}
function sha256(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
