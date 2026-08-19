<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v9.0.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v9.0.0** was hardened automatically. 3 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

All three workflow files reference external actions using mutable version tags instead of pinned 40-character SHA commit hashes, making them vulnerable to supply-chain attacks if the upstream action is compromised or the tag is moved.

.github/workflows/cd.yml: actions/checkout@v4, docker/login-action@v3, docker/metadata-action@v5, docker/setup-buildx-action@v3, docker/build-push-action@v6

.github/workflows/ci.yml: actions/checkout@v4, actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4

.github/workflows/codex-canary.yml: actions/checkout@v4, actions/setup-node@v4, actions/github-script@v7

Locations:

- `.github/workflows/cd.yml:25`
- `.github/workflows/cd.yml:28`
- `.github/workflows/cd.yml:34`
- `.github/workflows/cd.yml:44`
- `.github/workflows/cd.yml:47`
- `.github/workflows/cd.yml:57`
- `.github/workflows/ci.yml:14`
- `.github/workflows/ci.yml:17`
- `.github/workflows/ci.yml:37`
- `.github/workflows/ci.yml:42`
- `.github/workflows/ci.yml:48`
- `.github/workflows/ci.yml:88`
- `.github/workflows/ci.yml:97`
- `.github/workflows/ci.yml:104`
- `.github/workflows/ci.yml:107`
- `.github/workflows/ci.yml:122`
- `.github/workflows/codex-canary.yml:35`
- `.github/workflows/codex-canary.yml:38`
- `.github/workflows/codex-canary.yml:60`

### missing-permissions (severity: medium)

ci.yml has no top-level `permissions:` key and none of its jobs (typecheck-and-lint, build-and-test, loc-budget, security-audit, docker) define job-level `permissions:` blocks. Without explicit permissions, the workflow inherits the default repository token permissions, which may be overly broad.

Locations:

- `.github/workflows/ci.yml:1`

### script-injection (severity: high)

GitHub Actions expressions (`${{ ... }}`) are interpolated directly inside `run:` shell command strings, violating sub-rule (a). Before the shell executes the command, YAML template substitution replaces the expression with its value — allowing an attacker who controls the value to inject arbitrary shell commands.

.github/workflows/cd.yml — 'Verify swarm-orchestrator image' step: `docker pull ${{ env.REGISTRY }}/${{ env.OWNER }}/swarm-orchestrator:sha-${GITHUB_SHA::7}` and `docker run --rm --entrypoint node ${{ env.REGISTRY }}/${{ env.OWNER }}/swarm-orchestrator:sha-${GITHUB_SHA::7} ...`. The `env.OWNER` value is set from `github.repository_owner`, a GitHub-controlled but still template-substituted context.

.github/workflows/ci.yml — 'Publish test summary' step: `echo "Node.js ${{ matrix.node-version }} on ubuntu-latest" >> $GITHUB_STEP_SUMMARY`. The `matrix.node-version` value is interpolated directly into the shell command string.

Locations:

- `.github/workflows/cd.yml:63`
- `.github/workflows/cd.yml:70`
- `.github/workflows/ci.yml:80`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, missing-permissions, script-injection

**Notes:**

Fixed all three findings across three workflow files:

1. unpinned-uses: Pinned all 9 unique action references (19 total occurrences) to full 40-character SHA hashes with original version tags preserved as comments. Actions pinned: actions/checkout@v4, docker/login-action@v3, docker/metadata-action@v5, docker/setup-buildx-action@v3, docker/build-push-action@v6, actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4, actions/github-script@v7.

2. missing-permissions: Added top-level `permissions: contents: read` to ci.yml. The cd.yml already had appropriate permissions and codex-canary.yml had job-level permissions.

3. script-injection: (a) In cd.yml 'Verify swarm-orchestrator image' step: moved ${{ env.REGISTRY }} and ${{ env.OWNER }} into the step's env: block as REGISTRY and OWNER, then referenced them as ${REGISTRY} and ${OWNER} in the shell script. (b) In ci.yml 'Publish test summary' step: moved ${{ matrix.node-version }} into a NODE_VERSION env var and referenced it as ${NODE_VERSION} in the shell script.

