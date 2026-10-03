# Human approval of DoneLatch check definitions

DoneLatch v0.1.2 requires an outside-project approval before it runs acceptance commands, tests faults or accepts evidence. The human approves the **definitions**; this is not a security sandbox or independent attestation.

## Initial setup or a changed contract

In the selected project, from your own interactive terminal:

```sh
npx --yes github:alidaram99/donelatch#v0.1.2 init
# Edit receipts.yml for the actual outcome, then review referenced check scripts.
npx --yes github:alidaram99/donelatch#v0.1.2 trust
```

`trust` shows the canonical project root, selected configuration, executable and full argument arrays, inherited environment behavior, timeout/assertion settings, faults, exclusions, SHA-256 fingerprint and approval-file location. JSON string escaping and escaped bidi controls make terminal-hidden argument characters visible. Approval itself does not execute a project command. Type the entire displayed `APPROVE <SHA256>` phrase; a generic yes, piped input, JSON mode or a changed configuration cancels approval.

Once the hash is approved:

```sh
npx --yes github:alidaram99/donelatch#v0.1.2 run
npx --yes github:alidaram99/donelatch#v0.1.2 faultcheck
npx --yes github:alidaram99/donelatch#v0.1.2 verify-done
```

Every acceptance-configuration edit requires human review again, including format/comment-only edits. Approval binds the exact file bytes, normalized definitions and parser defaults. It covers command/argv, timeouts, assertion markers/exit codes, mutations and exclusions. Before each operation, DoneLatch validates the same loaded configuration object that it will execute; it does not validate one file and then spawn commands re-read from another version.

A source edit with unchanged check definitions only requires fresh evidence. Re-approval does not make old receipts current or passing.

## Where approvals live

| OS | User trust directory |
|---|---|
| Windows | `%APPDATA%/DoneLatch/trust`; fallback `~/AppData/Roaming/DoneLatch/trust` |
| macOS | `~/Library/Application Support/DoneLatch/trust` |
| Linux | `$XDG_CONFIG_HOME/donelatch/trust`; fallback `~/.config/donelatch/trust` |

Each canonical project/configuration pair has a separate SHA-256-named JSON record containing its identity, approved fingerprint and timestamp. Commands, arguments and check output are not stored there. Moving/cloning a project requires approval for the new identity; copied approval records do not validate a different project.

The directory must be outside the selected project **and its containing Git repository**. Relative overrides, symlink/junction parents, nonregular or hardlinked approval files are refused. POSIX directories/files are created with modes 0700/0600; these modes do not establish Windows ACL isolation. Invalid JSON fails closed; a fresh human review can replace an ordinary corrupt record. Oversized or linked files require manual correction by the owner first.

`DONELATCH_TRUST_DIR` is an explicit absolute launch-time override for managed configurations/tests. Do not source it from agent-editable project files. In CI, use an approval provisioned by a trusted human-controlled step, kept outside the checkout; do not add an automatic approval call to agent-authored CI just to bypass the gate. Tests and the shipped demo use isolated temporary approval directories for their owned fixtures, never the user's real approvals.

## What the hooks do

Claude/Codex return `decision: block`; Gemini returns `decision: deny`; Cursor returns a `followup_message`. An unapproved or changed configuration produces only a human-review message, **not commands for the agent to run checks**. This branch never becomes an allow merely because `stop_hook_active` or `loop_count` is set. Malformed input/configuration and unreadable approvals also refuse acceptance.

Deleting a previously approved `receipts.yml` does not turn a guarded project into NOT CONFIGURED. During automatic discovery, new nested Git metadata cannot silently hide an approved ancestor: the adapter refuses the ambiguous/unconfigured selection without inheriting the ancestor's commands. A truly unconfigured project with no relevant approval remains an opt-in skip, and no evidence is accepted.

Set `DONELATCH_PROJECT_ROOT` to the reviewed absolute project path in a human-controlled launcher for stable selection. Approving a deliberately different project does not authorize another repository's policy.

After approval, stale or missing evidence can request one ordinary corrective turn to run the approved CLI operations. Independent host limits can still suppress a Cursor follow-up or end any host's turn, even on a trust refusal. Hooks remain cooperative guardrails: a stopped agent is not accepted work. A separately controlled `verify-done` exit status remains the acceptance boundary.

## What approval does not pin

Approval does **not** hash referenced script contents, binaries, PATH resolution, dependencies or the inherited environment. For example, changing `checks/persist.mjs` while keeping its `node` argv unchanged does not change the approved definitions; the file is watched for freshness, but its side effects still require review. Protect executable resolution, referenced scripts, verifier and acceptance authority under stronger permissions when hostile code is in scope.

The store is outside the repository to prevent a repository-only policy edit from approving itself. It is not outside the OS user's authority. Same-user code or an agent with equivalent filesystem/terminal access can rewrite the store, invoke the low-level library approval primitive, or replace the verifier. The interactive prompt reduces accidental/programmatic approvals; it does not authenticate a biological human. Use a restricted account or independently controlled acceptance service for adversarial isolation. Temporary fault copies are also not sandboxes.
