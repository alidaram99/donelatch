# DoneLatch v0.1.1

Discovery and Gemini CLI extension release. The v0.1.0 completion-evidence engine is unchanged.

- Root `gemini-extension.json`, `GEMINI.md`, and a native `AfterAgent` hook; install from the tagged public repository.
- Shared native hook file preserves Claude's `Stop` hook. Each host skips the other host's event with an unknown-event warning. Do not also install the manual Gemini hook.
- Direct-answer website copy, visible FAQ with matching JSON-LD, search/AI crawler directives, sitemap, and AI-reader summary.
- Links to the team's other tools; a scoped IndexNow key and post-deployment notification.
- Regression coverage invokes Gemini's actual shipped command, including the quoted extension path, on real passing and stale receipts.

Included from v0.1.0:

- `init`, `run`, `faultcheck`, and `verify-done`; `receipts` and `donelatch` command aliases.
- Current watched-file/configuration/Git binding, latest-failure supersession, Ed25519 receipt signatures and hash chaining.
- Configured behavioral faults in independent temporary copies, with healthy baseline calibration and explicit assertion marker/exit-code detection.
- Claude Code marketplace/plugin, Codex plugin/skill/catalog, Gemini AfterAgent and Cursor stop adapters; capped correction and honest UNVERIFIED output.
- Self-contained runtime bundles, working without npm-installed dependencies in a cloned plugin cache.
- Reproducible persistence demo: weak check refused, strong check accepted, later edit refused.
- Local tests and independent review; public CI runs Node.js 24 on Windows and Linux.

Requires Node.js 24+. Distributed via this GitHub repository and release, not the npm registry.

Hooks are cooperative guardrails. They can be bypassed or fail open, and the host may stop after the one-turn retry cap. Local signatures are not independent attestation. Configured commands are trusted; temporary copies are not a security sandbox. No telemetry, paid service, universal correctness guarantee, or automatic Orcheri modification is included.

See [installation](https://github.com/alidaram99/donelatch/blob/main/docs/AGENT-INSTALL.md), [verification](https://github.com/alidaram99/donelatch/blob/main/docs/VERIFY.md), and [security boundaries](https://github.com/alidaram99/donelatch/blob/main/SECURITY.md).
