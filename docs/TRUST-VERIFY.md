# DoneLatch v0.1.2: S7 resolution and live verification

Checked 2026-10-03, 07:44 UTC. These are observed release and regression results, not a guarantee of arbitrary agent correctness or adversarial isolation.

## Published artifact

- [Public repository](https://github.com/alidaram99/donelatch)
- [v0.1.2 release](https://github.com/alidaram99/donelatch/releases/tag/v0.1.2)
- [Website](https://alidaram99.github.io/donelatch/)
- Release tag: `cec737d96a2773eeec72bdb39cf14b1e318432f9`.
- Portfolio implementation: `a13c608`; Windows short-path correction: `cdef33d`.
- [Root-layout extension ZIP](https://github.com/alidaram99/donelatch/releases/download/v0.1.2/donelatch-v0.1.2.zip): **206,546 bytes**.
- ZIP SHA-256: `9d21401f1dea80ae279ffb8abeeefb50b4c81276142baaba93e3370343a30e3b`. Independently downloaded public bytes and GitHub asset digest match the local tested archive.
- Extracted archive has `gemini-extension.json` at its root. Its bundled CLI printed `0.1.2` without installing dependencies into the extracted archive.

The v0.1.0/v0.1.1 verification documents are historical records. This document describes the changed acceptance behavior in v0.1.2.

## S7 fix

`donelatch trust` displays executable/argv and relevant acceptance configuration for interactive human review. Approval itself runs no project check. It requires the full displayed `APPROVE <SHA256>` phrase, rechecks the fingerprint before storing it, and rejects piped input and JSON approval. Review output escapes terminal and bidi control characters.

Approval records live outside the selected project and containing Git repository:

| OS | Default directory |
|---|---|
| Windows | `%APPDATA%/DoneLatch/trust` |
| macOS | `~/Library/Application Support/DoneLatch/trust` |
| Linux | `$XDG_CONFIG_HOME/donelatch/trust`, fallback `~/.config/donelatch/trust` |

Records pin the project/configuration identity, exact configuration bytes and parsed definitions/defaults: command, argv, timeouts, failure assertions, faults and exclusions. They store no command arguments or check output. Relative/in-repository approval locations, linked directory parents, special or hardlinked record files are refused. A reviewed ordinary corrupt JSON record can be repaired; an unsafe physical file remains refused.

`run`, `faultcheck` and `verify-done` require matching approval. All four completion adapters return a human-only refusal before suggesting any check execution if trust is missing or changed:

> Check configuration changed or is not approved; a human must run `donelatch trust` in this project.

Claude and Codex use `decision: block`; Gemini uses `decision: deny`; Cursor uses its supported `followup_message`. No branch instructs the agent to run project checks or approve its own changed configuration. Ordinary retry flags do not clear a trust refusal. Host-imposed limits remain outside this adapter's authority.

## Executed checks

| Check | Observed result |
|---|---|
| Local Node 24 build and full suite on Windows | **74 passed, 0 failed, 0 skipped**. |
| Independent read-only security/hook review | **34 passed, 0 failed, 0 skipped**; no blocking findings. |
| [Public release CI](https://github.com/alidaram99/donelatch/actions/runs/37107151737) | **74/74 on each of Windows and Linux**, zero skips; bundle rebuild stayed identical; demo passed on both. |
| [Pages deployment](https://github.com/alidaram99/donelatch/actions/runs/37106885681) | Success; IndexNow HTTP 200. This does not prove indexing or ranking. |
| Unapproved and edited policy | All four adapters deny human-only; no run/faultcheck command instruction, even after retry. Direct operations refuse execution. |
| Approved policy | Normal evidence correction resumes; actual run/faultcheck receipts are accepted until source/configuration changes. |
| Removed approved policy or new nested `.git` | Cannot silently turn the guarded project into an opt-in skip. Ancestor commands are not inherited. |
| Malformed YAML or hook input | Human-only refusal, including Cursor. |
| Approval identity/location attacks | Copied identities, in-repo stores, symlink/junction parents and hardlinked records fail closed. |
| Interactive approval | Exact definitions displayed; wrong phrase and edits during review refuse approval; no check runs. |
| Claude manifest validation | Marketplace passed; plugin passed with the documented warning that Gemini's `AfterAgent` event is ignored by Claude. |

The first public candidate's [Windows CI](https://github.com/alidaram99/donelatch/actions/runs/37106885677) exposed two availability failures: a raw Windows `8.3` ancestor path was compared to a canonical trust path, incorrectly refusing genuinely unconfigured projects. A real NTFS short-path reproduction confirmed the cause. The correction compares canonical containment too and has a real short-path regression; final Windows/Linux CI above passed. No safety regression was skipped to obtain that result.

## Live installation from the tag

Actually executed with an isolated npm cache:

```sh
npx --yes github:alidaram99/donelatch#v0.1.2 --version
# 0.1.2
```

A disposable project deliberately configured a command that would write `UNAPPROVED_PAYLOAD_EXECUTED`. Using the newly installed tag without approval produced:

| Operation | Exit code | Result |
|---|---|---|
| `run --json` | 2 | `ok: false` |
| `faultcheck --json` | 2 | `ok: false` |
| `verify-done --json` | 1 | `ok: false` |
| `trust --json` | 2 | `ok: false`, noninteractive approval refused |

The payload file did not exist afterward. Temporary fixtures were removed with containment-checked cleanup; no user approval or global agent configuration was changed.

Existing projects must migrate through a human terminal:

```sh
# HUMAN ONLY: review receipts.yml and referenced scripts before approving.
npx --yes github:alidaram99/donelatch#v0.1.2 trust
```

## Real demo

```text
WEAK CHECK: baseline passed; skipped persisted write survived; DONE REFUSED.
STRONG CHECK: skipped persisted write detected; fresh baseline passed; DONE ACCEPTED.
AFTER EDIT: earlier receipts are stale; DONE REFUSED.
```

The demo approves only the shipped disposable fixture definitions in an isolated temporary store. It does not approve a user's project or touch their trust records.

## Public HTTP verification

Direct GETs returned HTTP 200 for the public repository, v0.1.2 release page, release ZIP, tag manifest, website, `/donelatch/TRUST.md`, `/donelatch/llms.txt`, `/donelatch/robots.txt`, `/donelatch/sitemap.xml` and origin `/robots.txt`.

Live home HTML contains version `0.1.2`, the pinned human-review command and valid `SoftwareApplication`/`FAQPage` JSON-LD. The tag's Gemini manifest reports `0.1.2`. The origin-root robots file now exists; it is maintained by the separate team hub, not by this fix.

## Remaining boundaries

Hooks are cooperative guardrails. Full host-managed model sessions in Claude, Codex, Gemini and Cursor were not launched; the shipped adapter protocols and native-command subprocess behavior were tested. A host can disable, skip or cap a hook, ending an **UNVERIFIED** turn. Stopping does not create accepted evidence.

Approval does **not** pin referenced script contents, PATH/executable resolution or inherited environment. Same-user code can rewrite the outside approval store, automate a terminal or replace the verifier; an interactive prompt is not human authentication. Protect those authorities separately for hostile-code isolation. Fault copies are not sandboxes, and locally signed receipts are not independent attestation.

Orcheri application/configuration was not modified. No account was created and no external post/comment/issue/PR was made. Optional hosted analysis remains a future proposal, not a shipped paid service. See [approval boundaries](TRUST.md), [agent setup](AGENT-INSTALL.md) and [security](https://github.com/alidaram99/donelatch/blob/main/SECURITY.md).
