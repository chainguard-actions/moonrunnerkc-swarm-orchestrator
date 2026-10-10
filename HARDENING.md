<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/swarm-verify-v1.2.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/swarm-verify-v1.2.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### static-unsanitized-env-write (severity: medium)

unsanitized write to $GITHUB_ENV: variable $SWARM_ACTION_ROOT in step "Build the verifier from source" comes from a ${{...}} expression and should be sanitized with printf/tr before writing

Locations:

- `action.yml:117`

## Iteration Notes

### Iteration 1

**Fixes applied:** static-unsanitized-env-write

**Notes:**

Fixed unsanitized write to $GITHUB_ENV in the 'Build the verifier from source' step. The $SWARM_ACTION_ROOT variable (derived from ${{ github.action_path }}) was being written to $GITHUB_ENV without sanitization. Added a sanitization step using `printf '%s' "$SWARM_ACTION_ROOT" | tr -d '\n\r'` to strip newlines before writing the value to $GITHUB_ENV. The sanitized value `safe_root` is also used for the `cd` command.

