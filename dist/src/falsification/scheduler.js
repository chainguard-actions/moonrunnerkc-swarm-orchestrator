"use strict";
/**
 * Adaptive falsifier scheduler (UCB1).
 *
 * The sequential dispatcher runs adapters in registration order. When
 * multiple adapters claim the same obligation type — `codex-falsifier`
 * and `copilot-falsifier` both implementing `property-must-hold`, for
 * example — pure registration order leaves measurable performance on
 * the table and gives every operator the same blunt rotation.
 *
 * UCB1 (Auer, Cesa-Bianchi, Fischer 2002) is the smallest legitimate
 * bandit that fits: deterministic given the persisted stats, requires
 * one pass over the candidates per dispatch, no pseudo-random sampling,
 * no Beta-distribution machinery. The exploration term grows
 * unboundedly for un-tried adapters so cold starts converge in O(N)
 * dispatches without an explicit warm-up phase.
 *
 * Replay determinism: order() is a pure function of (statsSnapshot,
 * adapter list, exploration constant). Persist the snapshot before each
 * dispatch and replay reproduces. The dispatcher records the chosen
 * order in the ledger so audits can reconstruct the decision without
 * the snapshot file.
 *
 * No plugin system, no generic ML framework, no online-learning
 * boilerplate. The class is ~180 LOC and implements one algorithm.
 */
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
exports.FalsifierScheduler = exports.DEFAULT_EXPLORATION_CONSTANT = void 0;
exports.defaultStatsPath = defaultStatsPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Default UCB1 exploration constant. Standard Auer et al. choice. */
exports.DEFAULT_EXPLORATION_CONSTANT = Math.SQRT2;
/**
 * Adaptive scheduler. One instance per run. Persists stats to a JSON
 * file (`.swarm/falsifier-stats.json` by default) so adaptation
 * accumulates across runs.
 */
class FalsifierScheduler {
    kind;
    statsPath;
    explorationC;
    stats;
    constructor(opts) {
        this.kind = opts.kind;
        this.statsPath = opts.statsPath;
        this.explorationC = opts.explorationConstant ?? exports.DEFAULT_EXPLORATION_CONSTANT;
        this.stats = new Map();
        if (opts.initialStats) {
            for (const [name, s] of Object.entries(opts.initialStats))
                this.stats.set(name, { ...s });
        }
        else if (this.statsPath) {
            this.loadFromDisk();
        }
    }
    /**
     * Order `adapters` by descending UCB1 score (or registration order
     * when `kind === 'sequential'`). Ties broken by stable insertion
     * order from the input list, so determinism survives the sort.
     */
    order(adapters) {
        if (this.kind === 'sequential' || adapters.length <= 1) {
            return {
                kind: this.kind,
                order: adapters.map((a) => a.name),
                scores: [],
            };
        }
        const totalTrials = adapters.reduce((acc, a) => acc + (this.stats.get(a.name)?.trials ?? 0), 0);
        const indexed = adapters.map((a, i) => ({ adapter: a, originalIndex: i, score: this.scoreFor(a.name, totalTrials) }));
        indexed.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            return a.originalIndex - b.originalIndex;
        });
        return {
            kind: 'ucb1',
            order: indexed.map((e) => e.adapter.name),
            scores: indexed.map((e) => ({ adapter: e.adapter.name, score: e.score })),
        };
    }
    /** UCB1 score for `name`. Untried adapters score `+Infinity`. */
    scoreFor(name, totalTrials) {
        const s = this.stats.get(name);
        if (!s || s.trials === 0)
            return Number.POSITIVE_INFINITY;
        const reward = s.trials > 0 ? rewardOf(s) : 0;
        const exploration = this.explorationC * Math.sqrt(Math.log(Math.max(1, totalTrials)) / s.trials);
        return reward + exploration;
    }
    /** Update the running stats for `adapterName` from a single dispatch. */
    recordOutcome(adapterName, outcome) {
        const cur = this.stats.get(adapterName) ?? emptyStats();
        cur.trials += 1;
        if (outcome.successful)
            cur.successes += 1;
        if (outcome.falsePositive)
            cur.falsePositives += 1;
        cur.totalCostUsd += Math.max(0, outcome.costUsd);
        cur.totalLatencyMs += Math.max(0, outcome.latencyMs);
        this.stats.set(adapterName, cur);
    }
    /** Persist stats to disk. No-op when constructed without `statsPath`. */
    flush() {
        if (!this.statsPath)
            return;
        const obj = {};
        for (const [k, v] of this.stats.entries())
            obj[k] = v;
        fs.mkdirSync(path.dirname(this.statsPath), { recursive: true });
        // Write to a sibling tmp file then rename for crash-safety.
        const tmp = `${this.statsPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
        fs.renameSync(tmp, this.statsPath);
    }
    /** Read-only snapshot for ledger writers and tests. */
    snapshot() {
        const out = {};
        for (const [k, v] of this.stats.entries())
            out[k] = { ...v };
        return out;
    }
    loadFromDisk() {
        if (!this.statsPath || !fs.existsSync(this.statsPath))
            return;
        try {
            const raw = fs.readFileSync(this.statsPath, 'utf8');
            const parsed = JSON.parse(raw);
            for (const [name, s] of Object.entries(parsed)) {
                this.stats.set(name, {
                    trials: s.trials ?? 0,
                    successes: s.successes ?? 0,
                    falsePositives: s.falsePositives ?? 0,
                    totalCostUsd: s.totalCostUsd ?? 0,
                    totalLatencyMs: s.totalLatencyMs ?? 0,
                });
            }
        }
        catch {
            // Corrupted stats file: start clean. The next flush overwrites.
            this.stats = new Map();
        }
    }
}
exports.FalsifierScheduler = FalsifierScheduler;
/**
 * Reward in [0, 1] for UCB1: success rate net of the false-positive
 * penalty, scaled mildly downward when the adapter is expensive. Cost
 * and latency enter as soft penalties so a cheap-but-low-yield adapter
 * can still compete with an expensive-but-effective one. The numbers
 * are tunable but the choice does not affect determinism.
 */
function rewardOf(s) {
    if (s.trials === 0)
        return 0;
    const successRate = s.successes / s.trials;
    const fpRate = s.falsePositives / s.trials;
    const meanCost = s.totalCostUsd / s.trials;
    // Cost penalty: 0 at $0/call, 0.25 at $0.50/call, asymptotic at 0.5.
    const costPenalty = 0.5 * (1 - 1 / (1 + meanCost * 4));
    const reward = successRate - 0.5 * fpRate - costPenalty;
    if (reward < 0)
        return 0;
    if (reward > 1)
        return 1;
    return reward;
}
function emptyStats() {
    return {
        trials: 0,
        successes: 0,
        falsePositives: 0,
        totalCostUsd: 0,
        totalLatencyMs: 0,
    };
}
/**
 * Default stats path under `.swarm/`. Operators may override via CLI
 * flag; tests pass null to disable persistence entirely.
 */
function defaultStatsPath(repoRoot) {
    return path.join(repoRoot, '.swarm', 'falsifier-stats.json');
}
