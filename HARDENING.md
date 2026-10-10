<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.1.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.1.0** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

The 'Build the verifier from source' step writes the value of $SWARM_ACTION_ROOT (sourced from `${{ github.action_path }}` via the env: block) to $GITHUB_ENV without the required sanitization step (`printf '%s' ... | tr -d '\n\r'`). The line `echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"` writes a github.* context value to the special environment file unsanitized. A safe pattern would be: `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'); echo "SWARM_VERIFY_ENTRY=$safe/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"`.

Locations:

- `action.yml:113`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

Fixed the unsanitized write to $GITHUB_ENV in the 'Build the verifier from source' step. The value of $SWARM_ACTION_ROOT (sourced from ${{ github.action_path }}) was being written directly to $GITHUB_ENV. Added sanitization: `safe=$(printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r')` and replaced `$SWARM_ACTION_ROOT` with `$safe` in the echo command that writes to $GITHUB_ENV.

