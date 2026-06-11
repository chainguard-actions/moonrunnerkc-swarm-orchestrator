"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerAttribution = providerAttribution;
function providerAttribution(session) {
    if (typeof session.providerInfo !== 'function')
        return {};
    const info = session.providerInfo();
    return {
        provider: info.provider,
        modelId: info.model,
        backend: info.backend,
        grammar: info.grammar,
        seed: info.seed,
        usageEstimated: info.usageEstimated,
    };
}
