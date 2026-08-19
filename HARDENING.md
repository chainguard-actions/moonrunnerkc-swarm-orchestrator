<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v10.0.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v10.0.0** was hardened automatically. 5 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

All workflow files use mutable tag-based refs instead of pinned 40-character SHA commits, making them vulnerable to supply-chain attacks if the referenced action is compromised. Unpinned refs include: actions/checkout@v4, actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4, docker/login-action@v3, docker/metadata-action@v5, docker/setup-buildx-action@v3, docker/build-push-action@v6, actions/github-script@v7.

Locations:

- `.github/workflows/cd.yml:21`
- `.github/workflows/ci.yml:14`
- `.github/workflows/codex-canary.yml:36`
- `.github/workflows/leaderboard-refresh.yml:14`
- `.github/workflows/pr-audit.yml:14`

### missing-permissions (severity: medium)

ci.yml has no top-level `permissions:` block and none of its jobs (typecheck-and-lint, build-and-test, loc-budget, security-audit, docker) define job-level permissions. This means the workflow runs with the default broad permissions granted by GitHub Actions.

Locations:

- `.github/workflows/ci.yml:1`

### script-injection (severity: high)

Sub-rule (a): `${{ github.event.pull_request.number }}` is directly interpolated inside two run: shell commands. An attacker who controls the PR number field (e.g. via a crafted event payload) could inject shell metacharacters. Offending lines: (1) `node dist/src/cli.js audit "${GITHUB_REPOSITORY}#${{ github.event.pull_request.number }}"` and (2) `"https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${{ github.event.pull_request.number }}/comments"`. Both should use an env: variable and quote the expansion instead.

Locations:

- `.github/workflows/pr-audit.yml:30`
- `.github/workflows/pr-audit.yml:52`

### script-injection (severity: high)

Sub-rule (a): `${{ env.REGISTRY }}` and `${{ env.OWNER }}` are directly interpolated inside a run: shell command: `docker run --rm --entrypoint node ${{ env.REGISTRY }}/${{ env.OWNER }}/swarm-orchestrator:sha-${GITHUB_SHA::7} ...`. Any expression inside a run: block is a script-injection risk regardless of which context it reads from. These should be referenced as environment variables ($REGISTRY/$OWNER) instead.

Locations:

- `.github/workflows/cd.yml:57`

### script-injection (severity: high)

Sub-rule (a): `${{ matrix.node-version }}` is directly interpolated inside a run: shell command: `echo "Node.js ${{ matrix.node-version }} on ubuntu-latest" >> $GITHUB_STEP_SUMMARY`. Any ${{ ... }} expression inside a run: block is a script-injection risk. This should be referenced as an environment variable instead.

Locations:

- `.github/workflows/ci.yml:75`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, missing-permissions, script-injection

**Notes:**

Fixed all 5 findings across 5 workflow files:

1. unpinned-uses: Pinned all 9 action references to full 40-char SHAs with tag comments in cd.yml, ci.yml, codex-canary.yml, leaderboard-refresh.yml, and pr-audit.yml.

2. missing-permissions: Added `permissions: contents: read` top-level block to ci.yml.

3. script-injection (pr-audit.yml): Moved `${{ github.event.pull_request.number }}` into env var PR_NUMBER in both affected steps (Run swarm audit and Render and post comment).

4. script-injection (cd.yml): Moved `${{ env.REGISTRY }}` and `${{ env.OWNER }}` into step-level env vars in the 'Verify swarm-orchestrator image' step, referenced as $REGISTRY/$OWNER in the shell.

5. script-injection (ci.yml): Moved `${{ matrix.node-version }}` into env var NODE_VERSION in the 'Publish test summary' step, referenced as $NODE_VERSION in the shell.

