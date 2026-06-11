"use strict";
// Scheduler↔tournament glue: lifts the runTournament call out of
// manager.ts so the manager focuses on the per-obligation scheduling
// loop while this file owns the ledger-sink wiring and the
// applyCandidate callback that funnels each round-winner back into the
// shared `attemptApplyAndVerify` seam.
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTournament = executeTournament;
const manager_1 = require("./manager");
const persona_message_1 = require("./persona-message");
const tournament_1 = require("./tournament");
async function executeTournament(args) {
    const { obligation, obligationIndex, primaryPersona, registry, session, ledger, repoRoot, commandTimeoutMs, tournamentConfig, memoStore, renderContext, fileMustExistPaths, runId, } = args;
    const config = {
        ...tournament_1.DEFAULT_TOURNAMENT_CONFIG[obligation.type],
        ...(tournamentConfig?.[obligation.type] ?? {}),
    };
    const fallback = registry
        .list()
        .filter((p) => (p.id !== primaryPersona.id && p.handles.length === 0 ? false : p.id !== primaryPersona.id));
    const personas = { primary: [primaryPersona], fallback };
    const sink = {
        recordRoundStarted(p) {
            ledger.append({
                type: 'tournament-round-started',
                ...p,
            });
        },
        recordCandidate(p) {
            ledger.append({
                type: 'candidate-recorded',
                ...p,
                ...(0, manager_1.providerAttribution)(session),
            });
        },
        recordWinner(p) {
            ledger.append({
                type: 'tournament-winner-selected',
                ...p,
            });
        },
        recordDiscard(p) {
            ledger.append({
                type: 'candidate-discarded',
                ...p,
                ...(0, manager_1.providerAttribution)(session),
            });
        },
        recordEscalation(p) {
            ledger.append({
                type: 'tournament-escalated',
                ...p,
            });
        },
    };
    const tournamentOpts = {
        obligation,
        obligationIndex,
        session,
        personas,
        config,
        renderUserMessage: (o) => (0, persona_message_1.renderDynamicMessage)(o, repoRoot, renderContext),
        applyCandidate: async (candidate, ob) => {
            const r = await (0, manager_1.attemptApplyAndVerify)({
                obligation: ob,
                obligationIndex,
                responseText: candidate.response.text,
                repoRoot,
                ledger,
                runId,
                fileMustExistPaths,
                commandTimeoutMs,
                renderContext,
                trigger: 'per-obligation-falsification',
            });
            return {
                satisfied: r.satisfied,
                detail: `${r.applyDetail}; ${r.verifyDetail}`,
            };
        },
        ledgerSink: sink,
        streamingSink: {
            recordStreamAborted(p) {
                ledger.append({
                    type: 'candidate-stream-aborted',
                    ...p,
                });
            },
        },
    };
    if (memoStore !== undefined)
        tournamentOpts.memoStore = memoStore;
    if (args.streamingAssertions !== undefined)
        tournamentOpts.streamingAssertions = args.streamingAssertions;
    if (args.costTracker !== undefined)
        tournamentOpts.costTracker = args.costTracker;
    const result = await (0, tournament_1.runTournament)(tournamentOpts);
    return {
        satisfied: result.satisfied,
        detail: result.detail,
        tournament: result,
    };
}
