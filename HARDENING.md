<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.2

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.2** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

In the 'Build the verifier from source' step, the env var SWARM_ACTION_ROOT is set from `${{ github.action_path }}` (a github.* context value treated as untrusted). The run block then writes this value to $GITHUB_ENV without sanitization: `echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"`. An attacker who can influence github.action_path could inject newlines to set arbitrary environment variables. The required sanitization step (`safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')`) is absent before the write.

Locations:

- `action.yml:110`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

In the 'Build the verifier from source' step of action.yml, added sanitization of the SWARM_ACTION_ROOT variable before writing to $GITHUB_ENV. The fix adds `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` and then uses `$safe` instead of `$SWARM_ACTION_ROOT` in the echo to $GITHUB_ENV. This prevents newline injection attacks where an attacker could influence github.action_path to inject arbitrary environment variables.

