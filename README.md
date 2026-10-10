# moonrunnerkc/swarm-orchestrator

Audits PRs opened by AI coding agents for cheat patterns (test relaxation, mock-of-hallucination, assertion strip, no-op fix). Posts findings as a PR comment and gates merges on blocking results. Also runs the legacy v8 orchestrator pipeline when invoked with goal/contract-path.

Hardened by [Chainguard](https://www.chainguard.dev) from the upstream action at [https://github.com/moonrunnerkc/swarm-orchestrator](https://github.com/moonrunnerkc/swarm-orchestrator).

## Versions

| Version | Tag | Upstream commit |
|---------|-----|-----------------|
| swarm-verify-v1.0.0 | [`swarm-verify-v1.0.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.0.0) | [`afa09c2`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/afa09c2905ed7d2244c41f863a4163331a04e15d) |
| swarm-verify-v1.0.4 | [`swarm-verify-v1.0.4`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.0.4) | [`c2206b6`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/c2206b6c6418679fa9ba95ef300c47e71c2880e0) |
| swarm-verify-v1.0.5 | [`swarm-verify-v1.0.5`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.0.5) | [`ea419b4`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/ea419b4a5d49e92279c17f96851bd63e7401480e) |
| swarm-verify-v1.0.7 | [`swarm-verify-v1.0.7`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.0.7) | [`6c14d19`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/6c14d193454f48ada4bdf68b48eba9cf0599d549) |
| swarm-verify-v1.2.0 | [`swarm-verify-v1.2.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.2.0) | [`4454d33`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/4454d331dd9d39c2e282980923dab2d387555012) |
| swarm-verify-v1.3.0 | [`swarm-verify-v1.3.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/swarm-verify-v1.3.0) | [`c6f1111`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/c6f1111cf95e13d766d7b77ba704e98cca5a9d9c) |
| v10.0.0 | [`v10.0.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v10.0.0) | [`7df8b17`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/7df8b1707acf8565f0887384e0ac6151df18cd2b) |
| v10.3.0-advisory | [`v10.3.0-advisory`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v10.3.0-advisory) | [`c9dc1dd`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/c9dc1dda79e4e19db08121dd1d43f6db6fd0ec98) |
| v10.4.0-advisory | [`v10.4.0-advisory`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v10.4.0-advisory) | [`f9024a7`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/f9024a72604f5f45b9f59f15e0cbef4939c13736) |
| v11.1.0-advisory | [`v11.1.0-advisory`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v11.1.0-advisory) | [`61f13e9`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/61f13e97f54c317bbca45863ea5e2adfb85cb0d8) |
| v12.0.0 | [`v12.0.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v12.0.0) | [`dce7de7`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/dce7de7be645a23d6c615eb072e51fae8f073baf) |
| v12.1.0 | [`v12.1.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v12.1.0) | [`41fc7f6`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/41fc7f6a449656db8d963cc0deb5a147845eedd3) |
| v12.1.1 | [`v12.1.1`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v12.1.1) | [`303e932`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/303e9326bdf802fca1e9b6d091fef28d16a5e6f2) |
| v14.2.0 | [`v14.2.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v14.2.0) | [`270811a`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/270811a4474284d9be2d07765eb26c35bc0c5453) |
| v9.0.0 | [`v9.0.0`](https://github.com/chainguard-actions/moonrunnerkc-swarm-orchestrator/tree/v9.0.0) | [`f77e292`](https://github.com/moonrunnerkc/swarm-orchestrator/commit/f77e2921d248bd15db84a96f6032d42576b53faf) |

## Privacy

This Action contacts Chainguard's licensing server to verify authorization. Connection metadata (IP address, GitHub repository identifier, timestamp, and any metadata encoded in the auth token) is transmitted to Chainguard, Inc. even if authorization is denied in accordance with our [Privacy Notice](https://www.chainguard.dev/legal/privacy-notice)
