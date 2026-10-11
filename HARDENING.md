<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.1** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

In the 'Build the verifier from source' step, the env var SWARM_ACTION_ROOT holds the value of `${{ github.action_path }}` (a github.* context — untrusted input). The run block then writes this value unsanitized to $GITHUB_ENV: `echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"`. No `printf '%s' ... | tr -d '\n\r'` sanitization is applied before the write, allowing a newline-injection attack that could set arbitrary environment variables. The fix is to sanitize the value before writing: `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` and then use `$safe` in the echo.

Locations:

- `action.yml:121`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

Fixed the unsanitized write to $GITHUB_ENV in the 'Build the verifier from source' step of action.yml. Added `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` before the echo statement, and replaced `$SWARM_ACTION_ROOT` with `$safe` in the SWARM_VERIFY_ENTRY assignment written to $GITHUB_ENV. This prevents newline injection attacks via the github.action_path context value.

