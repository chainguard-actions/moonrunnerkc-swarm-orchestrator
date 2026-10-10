<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.7

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.0.7** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### github-env-injection (severity: high)

In the 'Build the verifier from source' step, the env var SWARM_ACTION_ROOT is set from `${{ github.action_path }}` (a github.* context value, treated as untrusted input). The run block then writes this value directly to $GITHUB_ENV via: `echo "SWARM_VERIFY_ENTRY=$SWARM_ACTION_ROOT/packages/swarm-verify/dist/swarm-verify.js" >> "$GITHUB_ENV"`. No sanitization (`printf '%s' ... | tr -d '\n\r'`) is applied before the write. A newline embedded in the path could inject arbitrary environment variable assignments into subsequent steps.

Locations:

- `action.yml:118`

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** github-env-injection, static-unsanitized-env-write

**Notes:**

In the 'Build the verifier from source' step of action.yml, added sanitization of the SWARM_ACTION_ROOT value (derived from ${{ github.action_path }}) before writing to $GITHUB_ENV. The fix captures the sanitized value in `safe_root` using `printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'` and uses that in the echo command that writes SWARM_VERIFY_ENTRY to $GITHUB_ENV. This prevents newline injection attacks where a crafted path could inject arbitrary environment variable assignments into subsequent steps.

