<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.5

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.5** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

In the 'Build the verifier from source' step, the env var SWARM_ACTION_ROOT is set from `${{ github.action_path }}` (a github.* context value, treated as untrusted input per the check rules). Its value is then written to $GITHUB_ENV via:

  echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"

without the required sanitization step (`printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'`) applied before the write. This is a case (c) violation: an untrusted github.* value is routed through an env var and written to $GITHUB_ENV unsanitized, enabling a newline-injection attack that could set arbitrary environment variables for subsequent steps.

Locations:

- `action.yml:109`
- `action.yml:113`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

In the 'Build the verifier from source' step of action.yml, added sanitization of the SWARM_ACTION_ROOT value (derived from ${{ github.action_path }}) before writing to $GITHUB_ENV. The fix introduces a `safe_root` variable that strips newlines using `printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'`, then uses `safe_root` in the echo to $GITHUB_ENV instead of the unsanitized `$SWARM_ACTION_ROOT`. This prevents newline injection attacks that could set arbitrary environment variables for subsequent steps.

