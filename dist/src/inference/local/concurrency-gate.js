"use strict";
// A LocalBackend wrapper that bounds the number of concurrent
// `chat` / `stream` calls. Necessary because the underlying
// HTTP daemon (Ollama in particular) serializes inference for
// a single loaded model: queueing N parallel requests means
// the late ones spend most of their per-request timeout
// budget WAITING in the daemon's queue, then abort during
// inference. Limiting client-side concurrency to 1 (the
// documented `--local-max-concurrency` default) lets each call
// start its timeout when it actually begins talking to the
// model.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConcurrencyLimitedBackend = void 0;
class ConcurrencyLimitedBackend {
    name;
    inner;
    limit;
    active = 0;
    waiters = [];
    constructor(inner, limit) {
        if (!Number.isFinite(limit) || limit < 1) {
            throw new Error(`ConcurrencyLimitedBackend: limit must be >= 1, got ${limit}`);
        }
        this.inner = inner;
        this.limit = limit;
        this.name = inner.name;
    }
    supportsGrammar() {
        return this.inner.supportsGrammar();
    }
    async chat(request) {
        await this.acquire();
        try {
            return await this.inner.chat(request);
        }
        finally {
            this.release();
        }
    }
    async stream(request, observer) {
        await this.acquire();
        try {
            return await this.inner.stream(request, observer);
        }
        finally {
            this.release();
        }
    }
    acquire() {
        if (this.active < this.limit) {
            this.active += 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.waiters.push(() => {
                this.active += 1;
                resolve();
            });
        });
    }
    release() {
        this.active -= 1;
        const next = this.waiters.shift();
        if (next)
            next();
    }
}
exports.ConcurrencyLimitedBackend = ConcurrencyLimitedBackend;
