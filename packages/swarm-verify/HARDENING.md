<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator--packages--swarm-verify/v15.0.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator--packages--swarm-verify/v15.0.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

In action.yml, a composite action step uses a mutable tag instead of a full 40-character commit SHA: `uses: actions/setup-node@v4`.

Locations:

- `action.yml:17`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node@v4 to 49933ea5288caeca8642d1e84afbd3f7d6820020 # v4 in action.yml. Verify step already uses env vars; left unchanged.

