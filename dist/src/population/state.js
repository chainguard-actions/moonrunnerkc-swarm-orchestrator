"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopulationStateBuilder = void 0;
/**
 * Mutable companion to the read-only `PopulationState`. The population
 * manager owns one instance; the predicate evaluator only ever sees a
 * snapshot via the `view()` method.
 */
class PopulationStateBuilder {
    oblg;
    status;
    constructor(obligations) {
        this.oblg = [...obligations];
        this.status = obligations.map(() => 'pending');
    }
    /** Read-only view passed to predicates. */
    view() {
        return { obligations: this.oblg, status: this.status };
    }
    /** Total obligation count. */
    size() {
        return this.oblg.length;
    }
    /** Status at the given index. Throws on out-of-range. */
    statusAt(index) {
        const s = this.status[index];
        if (s === undefined) {
            throw new Error(`obligation index ${index} out of range (size=${this.oblg.length})`);
        }
        return s;
    }
    /** Mutate obligation status. */
    setStatus(index, status) {
        if (this.status[index] === undefined) {
            throw new Error(`obligation index ${index} out of range (size=${this.oblg.length})`);
        }
        this.status[index] = status;
    }
    /** Number of obligations in the given status. */
    countInStatus(status) {
        let count = 0;
        for (const s of this.status)
            if (s === status)
                count += 1;
        return count;
    }
}
exports.PopulationStateBuilder = PopulationStateBuilder;
