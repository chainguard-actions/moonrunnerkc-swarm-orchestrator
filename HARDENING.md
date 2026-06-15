<!-- markdownlint-disable -->

# Hardening Report: moonrunnerkc--swarm-orchestrator/v12.0.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **moonrunnerkc--swarm-orchestrator/v12.0.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action.yml uses a Docker image reference with a mutable tag (:11) instead of a SHA digest. The image 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11' can be silently updated to point to a different (potentially malicious) image without any change to the action definition. This is a supply-chain risk. It should be pinned to a full SHA256 digest, e.g. 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:<64-hex-char-digest>'.

Locations:

- `action.yml:168`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Replaced the mutable Docker image tag 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator:11' with the immutable SHA256 digest 'docker://ghcr.io/moonrunnerkc/swarm-orchestrator@sha256:ea5d7e6b94c66bc181c74a6596be2231eac243f7dee1d69b80db2c840fa7f05b' in action.yml line 168. The original tag is preserved as a comment (# :11) outside the YAML quotes.

