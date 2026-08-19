<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v12.1.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v12.1.1** was hardened automatically. 8 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action.yml `runs.image` field references the Docker image `docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11` using a mutable tag (`:11`) instead of a SHA digest. A mutable tag can be silently updated to point to a different image, enabling supply-chain attacks. Pin to a specific SHA digest, e.g. `docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:<64-hex-char-digest>`.

Locations:

- `action.yml:168`

### script-injection (severity: high)

Sub-rule (a): `${{ github.event.pull_request.number }}` is interpolated directly inside a `run:` shell command string. An attacker who controls the PR number field (or a malicious PR title/body if the expression were broader) can inject shell metacharacters. Offending lines: `node dist/src/cli.js audit "${GITHUB_REPOSITORY}#${{ github.event.pull_request.number }}"` and the `curl` URL `...issues/${{ github.event.pull_request.number }}/comments`. Fix by moving the value into an `env:` variable and referencing it as `"$ENV_VAR"` in the shell.

Locations:

- `.github/workflows/pr-audit.yml:34`
- `.github/workflows/pr-audit.yml:75`

### script-injection (severity: high)

Sub-rule (a): Multiple `${{ github.event.inputs.* }}` and `${{ github.run_id }}` expressions are interpolated directly inside `run:` shell command strings. Offending lines include: `--months "${{ github.event.inputs.months || '12' }}"`, `--per-vendor "${{ github.event.inputs.perVendor || '10' }}"`, `--batch-size "${{ github.event.inputs.batchSize || '15' }}"`, `--timeout-ms "${{ github.event.inputs.timeoutMs || '200000' }}"`, and `--batch-id "stream-${{ github.run_id }}"`. Workflow dispatch inputs are user-controlled and must be passed via `env:` variables.

Locations:

- `.github/workflows/agent-stream.yml:60`
- `.github/workflows/agent-stream.yml:75`

### script-injection (severity: high)

Sub-rule (a): `${{ github.event.inputs.apiBudget }}` and `${{ github.event.inputs.limit }}` are interpolated directly inside a `run:` shell command string: `--api-budget "${{ github.event.inputs.apiBudget || '1500' }}"` and `--limit "${{ github.event.inputs.limit || '50' }}"`. Workflow dispatch inputs are user-controlled and must be passed via `env:` variables.

Locations:

- `.github/workflows/backward-mine.yml:52`

### script-injection (severity: high)

Sub-rule (a): `${{ github.event.inputs.limit }}`, `${{ github.event.inputs.apiBudget }}`, and `${{ github.event.inputs.maxCostUsd }}` are interpolated directly inside a `run:` shell command string. Workflow dispatch inputs are user-controlled and must be passed via `env:` variables.

Locations:

- `.github/workflows/complaint-mine.yml:64`

### script-injection (severity: high)

Sub-rule (a): `${{ matrix.id }}` and `${{ github.event.inputs.installTimeoutMs }}` / `${{ github.event.inputs.wallClockMs }}` are interpolated directly inside `run:` shell command strings. Matrix values and workflow dispatch inputs flow through YAML template substitution before the shell sees them. Offending lines: `node dist/scripts/real-prs/eg-viable-measure.js --only "${{ matrix.id }}"` and the `SWARM_EG_INSTALL_TIMEOUT_MS` / `SWARM_EG_WALLCLOCK_MS` env values. Fix by moving matrix.id into an env var and referencing it as `"$ENV_VAR"`.

Locations:

- `.github/workflows/eg-viable-measure.yml:57`
- `.github/workflows/eg-viable-measure.yml:54`

### script-injection (severity: high)

Sub-rule (a): `${{ inputs.live }}` is interpolated directly inside a `run:` shell command string: `if [ "${{ inputs.live }}" = "true" ]; then`. Workflow dispatch inputs are user-controlled and must be passed via `env:` variables.

Locations:

- `.github/workflows/benchmarks-full.yml:42`

### missing-permissions (severity: medium)

The workflow file `ci.yml` has no top-level `permissions:` key and none of its jobs (typecheck-and-lint, build-and-test, loc-budget, security-audit, docker) define a `permissions:` block. Without explicit permissions, the workflow inherits the repository default, which may grant write access to all scopes. Add a top-level `permissions: read-all` or minimal per-job permissions.

Locations:

- `.github/workflows/ci.yml:1`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, missing-permissions

**Notes:**

Fixed all 8 findings: (1) Pinned Docker image in action.yml from mutable :11 tag to sha256:ea5d7e6b94c66bc181c74a6596be2231eac243f7dee1d69b80db2c840fa7f05b, preserving docker:// scheme and :11 tag inline. (2) Fixed script injection in pr-audit.yml by moving github.event.pull_request.number into PR_NUMBER env var in both affected steps. (3) Fixed script injection in agent-stream.yml by moving github.event.inputs.months/perVendor/batchSize/timeoutMs and github.run_id into env vars. (4) Fixed script injection in backward-mine.yml by moving github.event.inputs.apiBudget/limit into env vars. (5) Fixed script injection in complaint-mine.yml by moving github.event.inputs.limit/apiBudget/maxCostUsd into env vars. (6) Fixed script injection in eg-viable-measure.yml by moving matrix.id into MATRIX_ID env var (inputs were already in env). (7) Fixed script injection in benchmarks-full.yml by moving inputs.live into INPUT_LIVE env var. (8) Added top-level permissions: contents: read to ci.yml.

