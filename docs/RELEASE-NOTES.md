# DoneLatch v0.1.2 - human-approved check configuration

Fixes security finding S7: a coding agent could rewrite receipts.yml, then receive a completion-hook prompt telling it to execute those changed commands.

- Added donelatch trust: an interactive human review showing exact command/args and relevant policy, requiring the full SHA-256 approval phrase. Approval itself runs no checks; no piped/JSON/yes mode.
- Per-project approvals live in the OS user configuration directory outside the project and containing repository. They pin raw configuration bytes, parsed definitions/defaults, commands/argv, timeouts, markers/exit codes, faults and exclusions.
- run, faultcheck and verify-done require matching approval before using the loaded definitions. Changed or invalid definitions cannot execute through the CLI or core operations.
- All four completion adapters return a human-only refusal for unapproved/changed configuration, without instructions to run checks. Trust refusals do not become allows through ordinary retry flags.
- Deleted approved policies and new nested Git metadata cannot silently opt out. Genuine never-configured projects still opt in explicitly. Malformed Cursor input now reaches refusal instead of an empty response.
- Linked approval directories/files and hardlinks are refused; reviewed hashes are checked again before writing. Corrupt ordinary JSON can be replaced after explicit review. Review output escapes terminal and bidi controls.
- All installation lines and manifests use v0.1.2; source bundles remain self-contained and free under MIT. Tests/demo use isolated fixture approval stores, not personal approvals.

**Migration:** existing projects need a human to review and run donelatch trust once before running checks. Every configuration change requires re-review. Ordinary source edits still require fresh evidence.

**Boundaries:** hooks are cooperative guardrails; host limits may end an UNVERIFIED turn. Approval does not pin referenced script contents, PATH/executable resolution or inherited environment. Same-user code can alter approval files/verifier or automate a terminal; the prompt is not human authentication. Temporary copies are not security sandboxes, and local signatures are not independent attestation. No hosted paid service is included.

See the [approval guide](https://github.com/alidaram99/donelatch/blob/main/docs/TRUST.md), [agent installation](https://github.com/alidaram99/donelatch/blob/main/docs/AGENT-INSTALL.md), and [security boundaries](https://github.com/alidaram99/donelatch/blob/main/SECURITY.md).
