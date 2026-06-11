"use strict";
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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const scheduler_1 = require("../../src/falsification/scheduler");
function fakeAdapter(name) {
    return {
        name,
        handles: ['property-must-hold'],
        falsify: async () => ({
            result: { kind: 'no-falsification-found', reason: 'unsupported', attempts: 0 },
            cost: { wallClockMs: 0, dollarsBilled: 0, dollarsApiEquivalent: 0, counterExamplesFound: 0 },
        }),
    };
}
describe('FalsifierScheduler', () => {
    it('sequential mode preserves registration order', () => {
        const sched = new scheduler_1.FalsifierScheduler({ kind: 'sequential', statsPath: null });
        const adapters = ['a', 'b', 'c'].map(fakeAdapter);
        const decision = sched.order(adapters);
        assert_1.strict.equal(decision.kind, 'sequential');
        assert_1.strict.deepEqual(decision.order, ['a', 'b', 'c']);
        assert_1.strict.deepEqual(decision.scores, []);
    });
    it('ucb1 with no history scores untried adapters at +Infinity', () => {
        const sched = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null });
        const adapters = ['x', 'y', 'z'].map(fakeAdapter);
        const decision = sched.order(adapters);
        assert_1.strict.equal(decision.kind, 'ucb1');
        // All scores Infinity → ties broken by registration order.
        assert_1.strict.deepEqual(decision.order, ['x', 'y', 'z']);
        assert_1.strict.equal(decision.scores.length, 3);
        for (const s of decision.scores)
            assert_1.strict.equal(s.score, Number.POSITIVE_INFINITY);
    });
    it('ucb1 deprioritises adapters with worse cost-adjusted reward', () => {
        const sched = new scheduler_1.FalsifierScheduler({
            kind: 'ucb1',
            statsPath: null,
            explorationConstant: scheduler_1.DEFAULT_EXPLORATION_CONSTANT,
        });
        const adapters = ['cheap-good', 'expensive-bad'].map(fakeAdapter);
        // Seed several trials: cheap-good wins often & cheaply; expensive-bad rarely & dearly.
        for (let i = 0; i < 10; i += 1) {
            sched.recordOutcome('cheap-good', { successful: true, costUsd: 0.01, latencyMs: 100 });
        }
        for (let i = 0; i < 10; i += 1) {
            sched.recordOutcome('expensive-bad', { successful: false, costUsd: 1.0, latencyMs: 5000 });
        }
        const decision = sched.order(adapters);
        assert_1.strict.deepEqual(decision.order, ['cheap-good', 'expensive-bad']);
        assert_1.strict.ok(decision.scores[0].score > decision.scores[1].score);
    });
    it('order is deterministic given the same stats and adapter list', () => {
        const seedStats = {
            a: { trials: 5, successes: 2, falsePositives: 0, totalCostUsd: 1, totalLatencyMs: 500 },
            b: { trials: 5, successes: 4, falsePositives: 0, totalCostUsd: 1, totalLatencyMs: 500 },
            c: { trials: 5, successes: 1, falsePositives: 1, totalCostUsd: 1, totalLatencyMs: 500 },
        };
        const adapters = ['a', 'b', 'c'].map(fakeAdapter);
        const s1 = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null, initialStats: seedStats });
        const s2 = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null, initialStats: seedStats });
        assert_1.strict.deepEqual(s1.order(adapters).order, s2.order(adapters).order);
    });
    it('persists and reloads stats across instances', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-'));
        const statsPath = path.join(dir, 'stats.json');
        const a = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath });
        a.recordOutcome('foo', { successful: true, costUsd: 0.05, latencyMs: 200 });
        a.recordOutcome('foo', { successful: false, costUsd: 0.05, latencyMs: 200 });
        a.flush();
        assert_1.strict.ok(fs.existsSync(statsPath));
        const b = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath });
        const snap = b.snapshot();
        assert_1.strict.equal(snap.foo?.trials, 2);
        assert_1.strict.equal(snap.foo?.successes, 1);
    });
    it('flush is a no-op when constructed without statsPath', () => {
        const sched = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null });
        sched.recordOutcome('a', { successful: true, costUsd: 0.01, latencyMs: 50 });
        // Should not throw.
        sched.flush();
    });
    it('falsePositive flag bumps falsePositive counter', () => {
        const sched = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null });
        sched.recordOutcome('x', { successful: true, costUsd: 0, latencyMs: 0, falsePositive: true });
        assert_1.strict.equal(sched.snapshot().x?.falsePositives, 1);
    });
    it('single-adapter input bypasses scoring and returns sequential', () => {
        const sched = new scheduler_1.FalsifierScheduler({ kind: 'ucb1', statsPath: null });
        const decision = sched.order([fakeAdapter('only')]);
        assert_1.strict.deepEqual(decision.order, ['only']);
        assert_1.strict.deepEqual(decision.scores, []);
    });
});
