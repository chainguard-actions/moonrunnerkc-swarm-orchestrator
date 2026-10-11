<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v14.3.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v14.3.0** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

The 'Build the verifier from source' step sets SWARM_ACTION_ROOT from ${{ github.action_path }} (a github.* context, which is treated as untrusted input per the check rules) in the env: block, then writes a value derived from it to $GITHUB_ENV without the required sanitization step (printf '%s' ... | tr -d '\n\r'). The offending line is: echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV". A safe pattern would be: safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'); echo "SWARM_VERIFY_ENTRY=$safe/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"

Locations:

- `action.yml:130`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

Fixed the 'Build the verifier from source' step in action.yml. Added sanitization of SWARM_ACTION_ROOT (which comes from ${{ github.action_path }}) before writing to $GITHUB_ENV. The fix uses `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` and then writes `$safe` to $GITHUB_ENV instead of the unsanitized `$SWARM_ACTION_ROOT`. This addresses both the github-env-injection finding (line 130) and the static-unsanitized-env-write finding (line 117).

