# Install DoneLatch for coding agents

DoneLatch asks a coding agent to provide current acceptance and fault-check receipts before it finishes. It runs locally. Hook adapters read the verifier's result; they do not run check commands, mutate source files, or create successful receipts themselves. Release CLI and hooks use committed self-contained bundles, so a cloned release or plugin cache does not need an npm install step or network request at hook execution time.

## Set up a project first

Use Node.js 24 or newer. Clone a trusted release outside the project you want to verify:

```sh
git clone --branch v0.1.1 --depth 1 https://github.com/alidaram99/donelatch.git
cd donelatch
```

Release bundles include their runtime dependency. `npm ci` is needed to develop, rebuild, or test the source package, not to invoke a released CLI or hook.

In the target project, initialize and review the configuration before executing it:

```sh
node "/absolute/path/to/donelatch/bin/receipts.mjs" init
# Review receipts.yml and configure checks and narrowly scoped mutations.
node "/absolute/path/to/donelatch/bin/receipts.mjs" run
node "/absolute/path/to/donelatch/bin/receipts.mjs" faultcheck
node "/absolute/path/to/donelatch/bin/receipts.mjs" verify-done
```

Paths with spaces must be quoted. Windows accepts forward slashes, for example `node "C:/Tools/DoneLatch/bin/receipts.mjs" run`. The command aliases are `receipts` and `donelatch` when installed as a CLI. `npx --yes github:alidaram99/donelatch verify-done` is also available; repeated hook calls should use a reviewed local checkout instead of downloading code at every stop.

Merge the examples below into an existing agent configuration; preserve other hooks. These are installation instructions for the user's project. This repository does not change an Orcheri installation or its configuration.

The adapter searches upward from the host project directory for `receipts.yml`, stopping at the closest `.git` file/directory. Set `DONELATCH_PROJECT_ROOT` to an absolute path to pin one project. A project without configuration receives a visible **NOT CONFIGURED** notice and no continuation; it has not been checked or accepted. An existing invalid configuration fails verification instead of being silently skipped.

## Claude Code

The repository is a Claude Code marketplace with one plugin. From a reviewed local checkout:

```sh
claude plugin validate "/absolute/path/to/donelatch"
claude plugin marketplace add "/absolute/path/to/donelatch"
claude plugin install donelatch@donelatch-marketplace
```

GitHub marketplace discovery is also supported:

```sh
claude plugin marketplace add alidaram99/donelatch
claude plugin install donelatch@donelatch-marketplace
```

The verifier and CLI are self-contained; installing the marketplace does not rely on a host running npm lifecycle scripts. The correction prompt invokes the CLI in that installed plugin's root, so `run` and `faultcheck` work with the cached release files and Node alone.

The bundled Stop hook uses exec-form Node arguments, so a Windows plugin-cache path containing spaces is one argument. The optional skill is `/donelatch:acceptance-receipt`. For a project-only manual adapter, add this to `.claude/settings.json` instead of installing the plugin:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["/absolute/path/to/donelatch/hooks/stop.mjs", "claude"],
        "timeout": 30
      }]
    }]
  }
}
```

Stop receives `cwd` and `stop_hook_active`. A failing verifier returns `decision: "block"` with a correction reason; a passing verifier returns `{}`. DoneLatch requests at most one continuation, then shows an UNVERIFIED warning. Claude also has its own continuation cap. Source: [Claude Code hooks](https://code.claude.com/docs/en/hooks), [marketplace installation](https://code.claude.com/docs/en/plugin-marketplaces), [plugin manifest](https://code.claude.com/docs/en/plugins-reference).

## Codex

DoneLatch includes a portable root `plugin.json`, a compatibility `.codex-plugin/plugin.json`, a skill, and a Codex marketplace catalog. Add the marketplace:

```sh
codex plugin marketplace add alidaram99/donelatch --ref v0.1.1
codex plugin marketplace list
```

In supported local ChatGPT desktop/Codex clients, open the Plugins Directory, select DoneLatch's marketplace, and install the plugin. Marketplace addition alone is not installation or hook trust. Open `/hooks` to inspect and trust the current hook. A changed hook needs review again. Scripts and dependencies must exist in the execution environment; ordinary Chat and cloud-orchestrated threads are not supported by this local command hook.

For CLI-only setup, add the following to the target project's `.codex/hooks.json` and review it in `/hooks`:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node \"/absolute/path/to/donelatch/hooks/stop.mjs\" codex",
        "timeout": 30
      }]
    }]
  }
}
```

Use an absolute checkout path because Codex can start in a subdirectory. On Windows, substitute a quoted forward-slash path. The bundled plugin command resolves `PLUGIN_ROOT` inside Node instead of relying on shell environment-variable expansion.

Codex Stop receives `cwd`, `turn_id`, and `stop_hook_active`; `decision: "block"` creates a continuation prompt rather than rejecting an already rendered answer. The adapter uses one continuation and then a visible UNVERIFIED warning. This is a native Stop hook, not an invented after-turn event. Sources: [official Codex hooks](https://developers.openai.com/codex/hooks), [plugin packaging and marketplace setup](https://developers.openai.com/plugins/build/plugins).

## Gemini CLI

Install the tagged extension, review the hook permissions, then restart Gemini CLI:

```sh
gemini extensions install https://github.com/alidaram99/donelatch --ref v0.1.1
gemini extensions list
```

The root gemini-extension.json declares the name/version/context. Gemini discovers its AfterAgent handler from hooks/hooks.json; the command quotes the substituted extensionPath so cache paths with spaces work. The bundled CLI/verifier and existing acceptance-receipt skill need no runtime npm install.

The shared hook file also contains Claude's Stop entry. Current Claude validation warns that AfterAgent is an unknown event and ignores it; Gemini's official registry skips the unknown Stop entry with a warning. Each host uses its own event, root variable and timeout units. Use one installation path per host to avoid duplicating a manual and extension hook. References: [extension layout and variable substitution](https://geminicli.com/docs/extensions/reference/), [Gemini event-name filtering](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookRegistry.ts), [gallery release requirements](https://geminicli.com/docs/extensions/releasing/).

For manual project-only setup instead of extension installation, merge this into the target project's `.gemini/settings.json`:

```json
{
  "hooks": {
    "AfterAgent": [{
      "hooks": [{
        "type": "command",
        "name": "donelatch",
        "command": "node \"/absolute/path/to/donelatch/hooks/stop.mjs\" gemini",
        "timeout": 30000
      }]
    }]
  }
}
```

AfterAgent supplies `cwd` and `stop_hook_active`. `decision: "deny"` with a reason retries the response. DoneLatch returns one JSON object on stdout and diagnostics on stderr. Its second failing invocation emits a visible UNVERIFIED warning without retrying. Gemini timeout values are milliseconds. Other nonzero hook exits are nonfatal warnings, so a broken or unavailable script can fail open. Inspect `/hooks panel` before relying on the integration. Sources: [Gemini hook reference](https://geminicli.com/docs/hooks/reference/), [hook debugging](https://geminicli.com/docs/hooks/best-practices/).

## Cursor

Merge this into the target project's `.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "stop": [{
      "command": "node \"/absolute/path/to/donelatch/hooks/stop.mjs\" cursor",
      "timeout": 30,
      "loop_limit": 1
    }]
  }
}
```

Cursor stop supplies `status` and `loop_count`. Only a completed turn can receive DoneLatch's `followup_message`; aborted/error turns are left alone. Both the hook configuration and script cap continuation at one. A stop hook requests another user turn; it does not retract the agent's preceding claim or provide an unconditional completion veto. After the cap, the UNVERIFIED warning is on stderr in Cursor's Hooks output channel; stop has no supported user-message field.

The adapter uses the host's `cwd` or `CURSOR_PROJECT_DIR`, or a single `workspace_roots` entry, then locates the nearest project configuration. It refuses an ambiguous/missing root rather than checking the plugin directory. `DONELATCH_PROJECT_ROOT` can explicitly select one project. Inspect Customize → Hooks and the Hooks output channel. Source: [Cursor hooks and stop semantics](https://cursor.com/docs/hooks).

## Verify the integration without an agent session

In the DoneLatch checkout:

```sh
node --test test/hooks.test.mjs
claude plugin validate .
claude plugin validate .claude-plugin/plugin.json
```

The protocol tests cover vendor-specific retry decisions, a passing result, verifier errors, one-retry caps, project/subdirectory identity, repository boundaries, unconfigured-project notices, and JSON-only stdout. The release test invokes Gemini's actual extension command with native path substitution on real fresh and stale receipts. Claude marketplace validation passed with Claude Code 2.1.282; plugin validation passed with the expected warning that AfterAgent is ignored. No live model session was launched by these commands. Full host-controlled hook execution in Claude, Codex, Gemini CLI, and Cursor remains unverified until exercised in the user's installed versions.

## Acceptance boundaries

Hooks can be disabled, skipped, timed out, untrusted, or bypassed. This adapter deliberately stops retrying after one correction turn; the host may then finish an UNVERIFIED turn. **Stopping is not acceptance.** No retry-cap branch creates a passing receipt, and `verify-done` continues to fail when evidence is missing.

Use a CI job, release script, or independent reviewer to execute `verify-done` and reject its nonzero exit. Protect the acceptance configuration and verifier separately from agent-editable files when adversarial enforcement matters. A signature records local key possession and detects changed receipt bytes; it is not independent review, a trustworthy wall clock, or a guarantee of all requirements.

Configured checks can execute commands with your permissions. A temporary fault copy is isolation from source edits, not a security sandbox. Use offline fixtures and bounded check commands for fault checks; do not point them at production writes, credentials, or destructive filesystem actions.
