# DoneLatch v0.1.0 verification record

Verification date: **2026-10-03**. This is a record of checks actually performed, with explicit deployment and integration limits.

## Scope and brand

- Standalone source folder: `products/donelatch/` in the income-portfolio repository.
- Public product repository: https://github.com/alidaram99/donelatch.
- Name check before creating it: GitHub repository-name search for `donelatch` returned no results; npm registry `donelatch` returned HTTP 404. Exact-name web search found generic Java latch-variable/industrial references, not an identified branded software product. This is not trademark clearance. ProofLatch was rejected because an existing software project used that name.
- No Orcheri application, configuration, or agent global configuration was edited. Exactly one new public product repository was created with the existing authorized GitHub login. No external posts, comments, issues, PRs, or accounts were created.

## Local verification

Node.js **24.17.0**, Windows, ESM.

| Check | Observed result |
| --- | --- |
| `npm run build` | Both self-contained runtime bundles generated successfully. |
| `npm test` | **57 passed, 0 failed, 0 skipped** (39 behavioral tests, 18 adapter tests). |
| `npm run demo` | Weak test refused; strong persistence assertion accepted; later edit refused. |
| Dependency-free CLI smoke | Copied only `bin/` and `bundle/`, with no source dependencies or npm install; `faultcheck`, `run`, and `verify-done` passed for the strong fixture. |
| Actual hook subprocesses | All four adapters emitted exactly `{}` for real current receipts, returned vendor-specific correction on a later edit, and stayed UNVERIFIED after the retry cap. |
| Claude marketplace/manifest validation | Both passed with installed Claude Code **2.1.282**. No model session was launched. |
| Independent review | A separate read-only reviewer checked core, packaging, adapters, and claims. Reproduced faults were corrected before publication. |
| Package preview | `npm pack --dry-run --json` included CLI bundles, plugins/skill, license and YAML ISC notice; no private receipt keys, runtime logs, node_modules or publishing cache. |

Exact demo output:

```text
WEAK CHECK: baseline passed; skipped persisted write survived; DONE REFUSED.
STRONG CHECK: skipped persisted write detected; fresh baseline passed; DONE ACCEPTED.
AFTER EDIT: earlier receipts are stale; DONE REFUSED.
Fault injection left the source unchanged; only the deliberate stale-edit step changed the disposable demo.
```

The acceptance contract is persisted settings. A return-value assertion misses an omitted write. A separate reader process checks the saved bytes and produces the declared `ASSERT_PERSISTENCE` failure when the write is omitted. Each fault uses a separate reset temporary copy with a healthy baseline. The original demo source is not modified by fault injection.

## What the tests actually cover

Freshness: content changes even when modification time is restored exactly, additions/deletions/renames/touches, configuration and Git HEAD changes, edits during a root check or copied baseline, latest failed-run supersession, latest weak-faultcheck supersession, in-flight operation refusal, and ignored-prefix boundaries.

Fault validity: healthy marker-free baseline, semantic persisted-output assertion, independent mutants, literal dollar-metacharacter replacement, unique literal matching, survived faults, parser/setup errors, timeouts, and undeclared failures. Windows protected-path aliases and case-insensitive excluded paths are tested.

Receipt integrity: native Ed25519 signature verification, payload/signature/order/key tampering, malformed logs, symlinked source and receipt directories, path traversal, protected hardlinked log refusal, CLI success/refusal/setup exits.

Adapter behavior: official vendor response semantics, JSON-only stdout, visible unconfigured-project notice, nearest-repository root discovery, explicit root binding, vendor environment isolation, one-retry cap, aborted Cursor turns, and actual subprocesses using the committed bundled verifier.

## Publication checks

The public repository, release, website, and public CI are checked after pushing the standalone product. The final checked URLs and CI conclusions are appended below after deployment; local test results above do not imply deployment success.

## Known limits

- No live model-driven Claude, Codex, Gemini or Cursor session was used. Protocol subprocess tests and Claude manifest validation do not establish complete end-to-end host installation. Codex/Gemini were not available on PATH and Cursor was not runtime-tested.
- An agent hook can be disabled, skipped, untrusted, or fail open. It requests at most one correction, then leaves the turn visibly UNVERIFIED. A host stopping is not completion acceptance.
- Fault coverage is a small owner-declared set. A marker and exit code are an explicit trusted contract; they are not independent detection of test gaming or all possible defects.
- Local signatures bind the retained local key and detect changed bytes. They do not stop a same-user attacker or detect replacement/truncation without an independently retained anchor.
- Temporary copies are not sandboxes. Commands remain trusted and may access external absolute paths or network. Symlinks/junctions, including linked dependencies, are unsupported by copied-project execution in this release.
- Additional excludes narrow the guarantee. Windows ACL changes, external services, trusted time, atomic race-proof snapshots, and full dependency integrity are not attested.
- There is no current paid analysis service or generated revenue. Monetization is a future documented option.

Install formats and primary-source references: [AGENT-INSTALL.md](AGENT-INSTALL.md). Security boundary: [SECURITY.md](../SECURITY.md).
