DoneLatch refuses acceptance of a coding agent's "done" until human-approved check definitions produce fresh passing checks and detect a configured behavioral fault.

# DoneLatch

**A green test is evidence. A test that misses your actual requirement is weak evidence.**

DoneLatch is a free, MIT-licensed local CLI and completion-hook plugin for Claude Code, Codex, Gemini CLI, and Cursor. It binds acceptance results to the current watched files, Git commit, and check configuration, then uses a deliberate behavioral fault as a negative control. It leaves a locally signed receipt instead of trusting a narrative saying the work is done.

[Website](https://alidaram99.github.io/donelatch/) · [Install for your agent](docs/AGENT-INSTALL.md) · [Verification record](docs/VERIFY.md) · [Security boundaries](SECURITY.md) · [v0.1.2](https://github.com/alidaram99/donelatch/releases/tag/v0.1.2)

## Why check the checks?

In Stack Overflow's 2025 survey, 66% of developers answering its AI-frustrations question reported solutions that were almost right, and 45% reported harder debugging of AI-generated code. Those are survey responses, not a measured agent-failure rate. [Source: Stack Overflow](https://survey.stackoverflow.co/2025/ai#ai-tool-frustrations).

A persistence test that only checks `saveSettings() === true` still passes when the write is removed. DoneLatch's example shows exactly that: the weak check passes, the fault survives, and completion is refused. A separate reader that checks the persisted bytes catches the same fault. After another edit, the previous receipt is refused again.

Mutation testing already exists. DoneLatch adds a small, explicit outcome-contract check and current-state completion gate for coding-agent workflows; it does not replace a full mutation-testing engine, independent review, or production monitoring.

## 60-second start

Requires **Node.js 24+** and Git for GitHub-based `npx` installation. No API key or paid account.

In your target project:

```sh
npx --yes github:alidaram99/donelatch#v0.1.2 init
# Edit receipts.yml: use a trusted acceptance command and one meaningful fault.
# HUMAN ONLY: inspect the exact definitions and approve their displayed hash.
npx --yes github:alidaram99/donelatch#v0.1.2 trust
npx --yes github:alidaram99/donelatch#v0.1.2 run
npx --yes github:alidaram99/donelatch#v0.1.2 faultcheck
npx --yes github:alidaram99/donelatch#v0.1.2 verify-done
```

`init` writes a template. It does not infer the right requirement or provide instant proof: you must replace the placeholder check and fault. The command aliases are `donelatch` and `receipts`. This release is distributed on GitHub; it is not a published npm-registry package.

Try the complete example with no project setup:

```sh
git clone --branch v0.1.2 --depth 1 https://github.com/alidaram99/donelatch.git
cd donelatch
npm ci
npm run demo
```

```text
WEAK CHECK: baseline passed; skipped persisted write survived; DONE REFUSED.
STRONG CHECK: skipped persisted write detected; fresh baseline passed; DONE ACCEPTED.
AFTER EDIT: earlier receipts are stale; DONE REFUSED.
```

The example runs in a disposable copy. Fault injection does not edit your original source.
The demo approves only its shipped fixtures in an isolated temporary trust store; it does not approve your project or alter your user approvals.

## Who approves check commands?

A human runs `donelatch trust` in an interactive terminal after configuring the project. It shows each executable, every argument, working directory, inherited-environment behavior, timeouts, failure assertions, faults and exclusions. Type the complete displayed `APPROVE <SHA256>` phrase to approve that exact configuration. No checks execute during this review, and piped input, `--yes` and JSON approval are not supported.

Approvals are stored outside the repository in a per-project file:

| OS | Default trust directory |
| --- | --- |
| Windows | `%APPDATA%/DoneLatch/trust` |
| macOS | `~/Library/Application Support/DoneLatch/trust` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/donelatch/trust` |

Any change to `receipts.yml`, including commands, arguments, faults, exclusions or file formatting, requires a new human review. `run`, `faultcheck` and `verify-done` reject an unapproved configuration. Hooks return a human-only refusal with **no instruction to execute project checks**; an ordinary retry flag does not clear that refusal. Deleting a previously approved configuration also refuses acceptance. See [the approval guide](docs/TRUST.md).

This pins definitions, **not referenced script contents, executable/PATH resolution or inherited environment**. Keep those under appropriate permissions and review their side effects. The same OS user can rewrite the store/verifier or automate a terminal; an outside-repo store and interactive prompt are cooperative safeguards, not human authentication or adversarial isolation. Pin `DONELATCH_PROJECT_ROOT` to a reviewed absolute root when project selection matters.

## Define an outcome contract

Write a check that observes the result a user needs. If persistence matters, read the saved file in a fresh process. If a boundary matters, test inputs on both sides of it. On that assertion failing, print the configured marker and exit with its declared nonzero code.

```yaml
version: 1
checks:
  - id: persist
    command: node
    args: [checks/persist.mjs]
    timeoutMs: 3000
    failureExitCodes: [1]
    failureMarker: ASSERT_PERSISTENCE
faults:
  - id: skip-write
    file: src/store.mjs
    find: 'writeFileSync(target, JSON.stringify(value));'
    replace: '// deliberately skip the persisted write'
    checkIds: [persist]
exclude: [runtime]
```

Faults are language-agnostic **literal** replacements at exactly one matching location. The `find` and `replace` strings are not regexes. Configure 1–16 acceptance checks and 1–16 faults. Examples include skipping a write, flipping a comparison, or returning before a required operation. You choose the relevant defect; DoneLatch does not invent a universal correctness oracle.

Check commands are executable-plus-argument arrays, run without an implicit shell. They execute with your OS permissions. Review the configuration before running it, and use offline fixtures rather than production writes or credentials.

## What each command verifies

| Command | Behavior |
| --- | --- |
| `init` | Writes `receipts.yml`; refuses to overwrite it. Does not run checks. |
| `trust` | Human-only interactive review; records the current configuration hash in the user trust directory without running checks. |
| `run` | Executes all configured checks and records their actual results. Refuses passing evidence if watched inputs change during execution. |
| `faultcheck` | Makes independent temporary copies, confirms a healthy baseline, injects each configured fault, then requires an expected assertion failure. |
| `verify-done` | Reads evidence without running project commands. Requires the latest run and latest faultcheck to pass for the same current state. |

All commands support `--root PATH` and `--config PATH`. `--json` is supported except for interactive `trust`. Exit `0` means that command succeeded; only `verify-done` exit `0` means current completion evidence is accepted. Exit `1` means refused/failed/weak/stale; exit `2` means invalid setup or inconclusive execution. The status is included in JSON. A source parser error, missing executable, timeout, or truncated output does not count as useful fault detection. Ambiguous failures are rejected conservatively.

The healthy temporary baseline must pass **without the failure marker**. A nonzero mutant must produce the declared marker and allowed assertion exit code. Merely making any command fail does not establish sensitivity to the intended outcome.

## Freshness and receipts

Receipts live in `.receipts/log.jsonl`. Each contains the Git HEAD, changed-file listing when Git is available, watched file names, SHA-256 content hashes, modification times, modes, configuration hash, timestamps, output, and results. An Ed25519 signature and a previous-receipt hash detect altered receipt bytes under the retained local signing identity.

Changing, adding, deleting, renaming, or touching a watched file invalidates earlier evidence. Changing Git HEAD or `receipts.yml` also invalidates it. A later failed run or weak faultcheck supersedes older passing evidence. Backdating a changed file cannot preserve its content hash.

By default, all files under the selected root are watched except `.git`, `.receipts`, and `node_modules`. Additional `exclude` prefixes narrow the guarantee. Put generated output in an explicitly excluded path; **do not exclude a user-facing artifact whose correctness you need to verify**. The configuration and fault targets cannot be excluded. Project symlinks/junctions are unsupported in this release; a fault copy fails if it encounters one, including linked dependencies.

The state directory creates its own `.gitignore` when first used. Do not force-add its private key or logs: check output may contain secrets. Local signatures are **not independent attestation**. A process with the same OS permissions can alter configuration, use the key, or replace the entire local history. Log truncation has no independent external anchor. Wall-clock trust and Windows ACL changes are outside the guarantee.

## Use it with your agent

Claude Code marketplace installation:

```sh
claude plugin marketplace add alidaram99/donelatch
claude plugin install donelatch@donelatch-marketplace
```

Codex marketplace discovery:

```sh
codex plugin marketplace add alidaram99/donelatch --ref v0.1.2
```

Then install in the supported Plugins Directory and inspect/trust the hook in `/hooks`. Adding a marketplace does not install or trust the plugin.

Gemini CLI extension installation:

```sh
gemini extensions install https://github.com/alidaram99/donelatch --ref v0.1.2
```

The extension bundles the CLI, acceptance-receipt skill, context and bounded `AfterAgent` hook. The repository satisfies the documented gallery discovery prerequisites; it is not a claim of current gallery inclusion. Cursor `stop` and manual Gemini installation can still use the reviewed local adapter. All four exact configurations and primary-source references are in [agent installation](docs/AGENT-INSTALL.md).

The release includes self-contained CLI and verifier bundles. A cloned plugin cache can run them with Node alone, without npm installation or a network call at every stop.

**Hooks are cooperative guardrails.** Claude/Codex can request a continuation, Gemini can retry, and Cursor can request a follow-up. DoneLatch caps ordinary evidence correction at one turn, then visibly reports UNVERIFIED. Trust refusals stay human-only on every invocation; host limits can still end the turn. A host can still stop an unverified turn; that does not make `verify-done` pass. Hooks may be disabled, skipped, untrusted, or fail open. Use the CLI exit code in a separately controlled release or CI acceptance step when acceptance must be enforced.

This is a standalone project. It does not change Orcheri or any agent's global configuration during installation of this source repository.

## How does it compare?

| Tool | Main job | Relationship to DoneLatch |
| --- | --- | --- |
| [Stryker](https://stryker-mutator.io/docs/) | Automated mutation testing with language-specific mutation engines and reports | Prefer it for comprehensive mutation analysis. DoneLatch uses a small configured set and links that evidence to current completion. |
| [Checkly](https://www.checklyhq.com/product/monitoring-as-code/) | API/browser monitoring, including monitoring defined as code | Prefer it for deployed uptime and synthetic monitoring. DoneLatch checks configured local outcome contracts. |
| Ordinary CI tests | Execute checks on a commit | Still necessary. DoneLatch adds a negative control and refuses stale local completion evidence. |
| An agent's final message | Explains what the agent says it did | Useful context; not execution evidence. DoneLatch records actual check results. |

## Frequently asked questions

### How do I stop Claude Code or Codex from saying it is done without tests?

Install the Stop adapter, configure a real acceptance assertion plus fault, have a human run `donelatch trust`, and inspect the resulting receipts. The hook requests correction; only a separately controlled `verify-done` acceptance step can reject the outcome reliably. An agent reaching its retry cap remains unverified.

### Can passing tests still miss a real bug?

Yes. The demo's weak return-value check misses a removed write. Faultcheck exposes that particular blind spot; it does not prove coverage of all defects.

### Why is my passing receipt stale after a small edit or commit?

It was recorded for another watched state or Git HEAD. Run both checks again after the last edit. Even a comment edit requires fresh evidence by design.

### Is this an AI model, a security sandbox, or a full mutation-testing framework?

It is a deterministic local completion-evidence tool. It does not require an LLM. Temporary copies isolate injected source edits; trusted check commands can still access network, credentials, or absolute paths. It is not a sandbox.

### Does DoneLatch upload my repository or charge per check?

No. Version 0.1.2 is local, free, and has no telemetry or hosted service. Your own configured commands may use the network. Optional hosted analysis is a documented future plan, not an available paid product.

### Does this verify every user requirement or prevent malicious agents?

No. It verifies the configured watched scope and declared negative controls. Keep policy, verifier, and signing/acceptance authority outside agent-controlled permissions for adversarial enforcement, and retain independent review for broader requirements.

### Does it work with Arabic projects?

Paths and check output are UTF-8 and faults are literal strings. It is language-agnostic, but the check must correctly assert the application's behavior; the CLI does not assess Arabic prose or translation quality.

## Develop and verify

```sh
npm ci
npm run build
npm test
npm run demo
```

Committed bundles are rebuilt and checked for drift in CI. Test coverage includes stale/backdated edits, changes during checks, weak tests, latest-failure supersession, marker calibration, timeouts, parser errors, path escapes, symlinks/hardlinks, signature-chain tampering, CLI exits, and actual adapter subprocesses. See [verification and known limits](docs/VERIFY.md).

Optional hosted fault analysis via Apify is reserved for a later release: [commercial plan](docs/PAID-HOSTING.md). The free CLI remains MIT. No payment integration is present today.
