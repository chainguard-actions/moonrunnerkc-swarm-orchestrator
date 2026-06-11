"use strict";
// Subprocess wrapper. Each CLI's preferred prompt-delivery mode has
// its own correctness trap: copilot's `-p` must be last; codex takes a
// positional after `exec`; claude-code reads stdin so very long
// prompts don't bump ARG_MAX. The shape is pinned in `PromptDelivery`
// and applied here once for all adapters.
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnCli = spawnCli;
exports.truncate = truncate;
const child_process_1 = require("child_process");
/** Spawn the underlying CLI, capping captured output at `profile.maxOutputBytes`. */
function spawnCli(req, profile) {
    const { args, stdinPrompt } = composeSpawnArgs(req, profile.promptDelivery);
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const child = (0, child_process_1.spawn)(req.binaryPath, args, {
            cwd: req.cwd,
            env: req.env,
            stdio: [stdinPrompt === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        });
        const out = child.stdout;
        const err = child.stderr;
        if (out === null || err === null) {
            reject(new Error(`spawn(${profile.errorLabel}) did not return stdout/stderr pipes`));
            return;
        }
        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
        }, req.timeoutMs);
        timer.unref();
        out.setEncoding('utf8');
        err.setEncoding('utf8');
        out.on('data', (c) => {
            if (stdoutBytes < profile.maxOutputBytes) {
                stdout += c;
                stdoutBytes += c.length;
            }
        });
        err.on('data', (c) => {
            if (stderrBytes < profile.maxOutputBytes) {
                stderr += c;
                stderrBytes += c.length;
            }
        });
        child.on('error', (e) => reject(new Error(`failed to spawn ${profile.errorLabel} binary "${req.binaryPath}": ${e.message}. ${profile.binaryMissingHint}`, { cause: e })));
        child.on('close', (exitCode) => {
            clearTimeout(timer);
            if (timedOut) {
                reject(new Error(`${profile.errorLabel} exec exceeded the ${req.timeoutMs}ms time budget; the call was killed. ` +
                    `Increase FalsificationInput.timeBudgetMs if the obligation legitimately needs more time.`));
                return;
            }
            resolve({
                stdout,
                stderr,
                exitCode: typeof exitCode === 'number' ? exitCode : 1,
                wallClockMs: Date.now() - startedAt,
            });
        });
        if (stdinPrompt !== null && child.stdin !== null) {
            child.stdin.write(stdinPrompt);
            child.stdin.end();
        }
    });
}
function composeSpawnArgs(req, delivery) {
    switch (delivery.kind) {
        case 'positional':
            return { args: [...req.args, req.prompt], stdinPrompt: null };
        case 'flag':
            return { args: [...req.args, delivery.flag, req.prompt], stdinPrompt: null };
        case 'stdin':
            return { args: [...req.args], stdinPrompt: req.prompt };
    }
}
/** Trim a string to `max` chars, appending an ellipsis when truncated. */
function truncate(value, max) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max)}…[truncated]`;
}
