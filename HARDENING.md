<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator--/v12.1.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **moonrunnerkc--swarm-orchestrator--/v12.1.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action.yml uses a Docker image with a mutable tag instead of a SHA digest. The image reference 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11' uses the tag ':11', which can be silently updated to point to a different (potentially malicious) image. It should be pinned to a specific SHA digest, e.g. 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:<64-hex-char-digest>'.

Locations:

- `action.yml:175`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned the Docker image reference in action.yml from 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11' to 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:ea5d7e6b94c66bc181c74a6596be2231eac243f7dee1d69b80db2c840fa7f05b' # :11. The SHA digest was resolved via the Docker Registry API. The original tag is preserved as a comment outside the YAML quotes for readability.

