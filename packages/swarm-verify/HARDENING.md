<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator--packages--swarm-verify/v14.4.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator--packages--swarm-verify/v14.4.0** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

Step 'Build the verifier from source' writes a value derived from github.action_path (via env SWARM_ACTION_ROOT: ${{ github.action_path }}) to $GITHUB_ENV without the required sanitization step: `echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/dist/swarm-verify.js" >> "$GITHUB_ENV"`. Fix: `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` before writing.

Locations:

- `action.yml:122`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:122`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

In the 'Build the verifier from source' step, $SWARM_ACTION_ROOT now has newlines stripped with printf/tr before it is written to $GITHUB_ENV.

