"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const score_1 = require("../../benchmarks/leaderboard/score");
// Sanity gate over the entire v10 corpus. The leaderboard harness must
// return zero failed expectations — every broken case caught, every
// clean control clean. This guards detector regressions across the
// 500-case corpus in one assertion.
describe('leaderboard / corpus scoring', function () {
    this.timeout(20_000);
    it('reports zero failed expectations across the full v10 corpus', () => {
        const out = (0, score_1.scoreCorpus)();
        assert_1.strict.equal(out.failedExpectations.length, 0, JSON.stringify(out.failedExpectations.slice(0, 5)));
        assert_1.strict.ok(out.corpusSize >= 500);
        assert_1.strict.ok(out.perAgent.length >= 1);
        assert_1.strict.ok(out.perCategory.length === 10);
    });
});
