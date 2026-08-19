<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v10.4.0-advisory

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v10.4.0-advisory** was hardened automatically. 3 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

All workflow files use mutable tag-based refs instead of full 40-character SHA commit hashes, making them vulnerable to supply-chain attacks. Failing references include: actions/checkout@v4, actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4, actions/configure-pages@v5, actions/upload-pages-artifact@v3, actions/deploy-pages@v4, docker/login-action@v3, docker/metadata-action@v5, docker/setup-buildx-action@v3, docker/build-push-action@v6, actions/github-script@v7.

Locations:

- `.github/workflows/cd.yml:27`
- `.github/workflows/ci.yml:13`
- `.github/workflows/codex-canary.yml:35`
- `.github/workflows/leaderboard-refresh.yml:14`
- `.github/workflows/pages.yml:47`
- `.github/workflows/pr-audit.yml:17`

### script-injection (severity: high)

Multiple workflow run: blocks directly interpolate ${{ }} expressions into shell commands before the shell parses them, enabling command injection. Sub-rule (a) violations: (1) pr-audit.yml line 30: node dist/src/cli.js audit with ${{ github.event.pull_request.number }} — attacker-controlled PR number interpolated directly into shell command. (2) pr-audit.yml line 47: curl URL contains ${{ github.event.pull_request.number }}. (3) pages.yml line 40: gh api call contains ${{ github.repository }} interpolated into shell. (4) cd.yml lines 62 and 68: docker commands contain ${{ env.REGISTRY }} and ${{ env.OWNER }} interpolated directly. (5) ci.yml ~line 90: echo command contains ${{ matrix.node-version }} interpolated into shell. All should use env: variables and reference them as $VAR instead.

Locations:

- `.github/workflows/pr-audit.yml:30`
- `.github/workflows/pr-audit.yml:47`
- `.github/workflows/pages.yml:40`
- `.github/workflows/cd.yml:62`
- `.github/workflows/ci.yml:90`

### missing-permissions (severity: medium)

ci.yml has no top-level permissions: key and none of its jobs (typecheck-and-lint, build-and-test, loc-budget, security-audit, docker) define job-level permissions: blocks. Without explicit permissions, the workflow inherits the repository default token permissions, which may be overly broad (write access to all scopes on some repositories).

Locations:

- `.github/workflows/ci.yml:1`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, missing-permissions

**Notes:**

Fixed all three findings across 6 workflow files:

1. unpinned-uses: Pinned all 12 action references to full 40-char SHAs with tag comments preserved: actions/checkout@v4→11d5960a, actions/setup-node@v4→49933ea5, actions/setup-python@v5→a26af69b, actions/upload-artifact@v4→ea165f8d, actions/configure-pages@v5→983d7736, actions/upload-pages-artifact@v3→56afc609, actions/deploy-pages@v4→d6db90164, docker/login-action@v3→c94ce9fb, docker/metadata-action@v5→c299e40c, docker/setup-buildx-action@v3→8d2750c6, docker/build-push-action@v6→10e90e36, actions/github-script@v7→f28e40c7.

2. script-injection: Moved all ${{ }} expressions out of run: shell strings into env: blocks — PR_NUMBER for github.event.pull_request.number in pr-audit.yml (both node CLI and curl URL), GH_REPO for github.repository in pages.yml gh api call, REGISTRY/OWNER for env.REGISTRY/env.OWNER in cd.yml docker commands, NODE_VERSION for matrix.node-version in ci.yml echo command.

3. missing-permissions: Added top-level `permissions: contents: read` to ci.yml which had no permissions block.

