<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v12.0.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **moonrunnerkc--swarm-orchestrator/v12.0.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action.yml Docker image reference uses a mutable tag (:11) instead of a SHA digest. The line `image: 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11'` can be silently replaced by a different image if the tag is overwritten, enabling supply-chain attacks. It should be pinned to a full SHA256 digest, e.g. `image: 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:<64-hex-char-digest>'`.

Locations:

- `action.yml:163`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned the Docker image reference in hardened/action/action.yml from 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11' to 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11@sha256:ea5d7e6b94c66bc181c74a6596be2231eac243f7dee1d69b80db2c840fa7f05b'. The 'docker://' scheme and ':11' tag are preserved inline, with the immutable digest appended to prevent supply-chain attacks via tag mutation.

