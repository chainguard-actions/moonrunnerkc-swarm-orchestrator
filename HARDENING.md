<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v12.1.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v12.1.0** was hardened automatically. 3 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### script-injection (severity: high)

Multiple workflow run: blocks directly interpolate ${{ ... }} expressions, violating sub-rule (a). In pr-audit.yml, `${{ github.event.pull_request.number }}` is interpolated directly in two run: blocks (the audit command string and the curl URL). In backward-mine.yml, `${{ github.event.inputs.apiBudget || '1500' }}` and `${{ github.event.inputs.limit || '50' }}` are interpolated directly in a run: block. In benchmarks-full.yml, `${{ inputs.live }}` is interpolated in a run: block. In eg-viable-measure.yml, `${{ matrix.id }}` is interpolated in a run: block. In cd.yml, `${{ env.REGISTRY }}` and `${{ env.OWNER }}` are interpolated in a run: block. In ci.yml, `${{ matrix.node-version }}` is interpolated in a run: block. In pages.yml, `${{ github.repository }}` is interpolated in a run: block. All of these should be passed via env: variables and referenced as shell variables instead.

Locations:

- `.github/workflows/pr-audit.yml:30`
- `.github/workflows/pr-audit.yml:56`
- `.github/workflows/backward-mine.yml:42`
- `.github/workflows/benchmarks-full.yml:35`
- `.github/workflows/eg-viable-measure.yml:46`
- `.github/workflows/cd.yml:107`
- `.github/workflows/ci.yml:131`
- `.github/workflows/pages.yml:42`

### missing-permissions (severity: medium)

ci.yml has no top-level `permissions:` key and no job-level `permissions:` key on any of its jobs (typecheck-and-lint, build-and-test, loc-budget, security-audit, docker). Without explicit permissions, the workflow inherits the repository default, which may be overly broad. A top-level `permissions:` block with minimal scopes (e.g. `contents: read`) should be added.

Locations:

- `.github/workflows/ci.yml:1`

### unpinned-uses (severity: high)

action.yml references a Docker image using a mutable tag (:11) instead of a SHA digest. The line `image: 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11'` can resolve to a different image at any time if the tag is overwritten, enabling a supply-chain attack. It should be pinned to a full SHA256 digest, e.g. `image: 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:<64-hex-char-digest>'`.

Locations:

- `action.yml:168`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, missing-permissions, script-injection

**Notes:**

Fixed all three findings:

1. unpinned-uses (action.yml line 168): Pinned Docker image from mutable ':11' tag to immutable SHA256 digest 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11@sha256:ea5d7e6b94c66bc181c74a6596be2231eac243f7dee1d69b80db2c840fa7f05b'.

2. missing-permissions (ci.yml line 1): Added top-level 'permissions: contents: read' block to ci.yml.

3. script-injection (8 locations): Moved all ${{ }} expressions out of run: blocks into env: blocks and referenced them as shell variables:
   - pr-audit.yml: PR_NUMBER for github.event.pull_request.number (2 occurrences)
   - backward-mine.yml: API_BUDGET and MINE_LIMIT for workflow dispatch inputs
   - benchmarks-full.yml: LIVE_INPUT for inputs.live
   - eg-viable-measure.yml: MATRIX_ID for matrix.id
   - cd.yml: STEP_REGISTRY and STEP_OWNER for env.REGISTRY and env.OWNER
   - ci.yml: NODE_VERSION for matrix.node-version
   - pages.yml: GH_REPOSITORY for github.repository

