# DoneLatch v0.1.1 discovery verification

Checked 2026-10-03, 06:05 UTC. This is an observation record, not a claim of indexing, gallery inclusion, paid demand, or universal correctness.

## Published release

- [Public repository](https://github.com/alidaram99/donelatch)
- [Website](https://alidaram99.github.io/donelatch/)
- [v0.1.1 release](https://github.com/alidaram99/donelatch/releases/tag/v0.1.1)
- Release tag points to `755c6110fc2d4bede31eae9c2d6856a613326848`.
- Corresponding portfolio implementation commit: `a141f88`.
- [Self-contained extension ZIP](https://github.com/alidaram99/donelatch/releases/download/v0.1.1/donelatch-v0.1.1.zip), 183,907 bytes. SHA256: `f8b2a83dc933d53bcbdfe496e9d8b81a0938a6cae9202fb122dc39bd0c9284a4`.
- Extraction confirmed `gemini-extension.json` at archive root. Its bundled CLI printed `0.1.1` without installing npm dependencies into the extracted archive.
- An actual GitHub-tag install with `npx --yes github:alidaram99/donelatch#v0.1.1 --version` exited successfully and printed `0.1.1`. The npm cache was isolated under this product's ignored `.publish/` directory.

The v0.1.0 completion-evidence engine and its historical [verification record](VERIFY.md) remain unchanged. This release adds discovery and Gemini extension packaging.

## GitHub discovery metadata

Saved and read back through the GitHub API:

> DoneLatch refuses completion acceptance until fresh checks pass and detect a configured fault. Free local CLI and Claude Code, Codex, Gemini CLI and Cursor guardrails.

Homepage: `https://alidaram99.github.io/donelatch/`.

The repository has 19 topics: `acceptance-testing`, `agent-plugin`, `agent-verification`, `ai-agents`, `claude-code`, `cli`, `codex`, `cursor`, `developer-tools`, `evidence`, `gemini-cli`, `mutation-testing`, `nodejs`, `receipts`, `testing`, `fault-injection`, `gemini-cli-extension`, `local-first`, `test-quality`.

The four additions are `fault-injection`, `gemini-cli-extension`, `local-first`, and `test-quality`. No MCP topic was added: this is a CLI/hook extension, not an MCP server. [Official GitHub topic documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).

## Native Gemini extension and compatibility

Added root `gemini-extension.json` with name `donelatch`, version `0.1.1`, description and `GEMINI.md` context. Added the native `AfterAgent` event to `hooks/hooks.json`, using the quoted `${extensionPath}/hooks/stop.mjs` path and a 30,000 ms timeout. The pre-existing Claude `Stop` entry remains intact.

Install:

```sh
gemini extensions install https://github.com/alidaram99/donelatch --ref v0.1.1
gemini extensions list
```

Review permissions and restart Gemini; configure `receipts.yml` before relying on acceptance. Use the extension or the manual Gemini hook, rather than both.

The public repo, native root manifest, topic and new tag meet the documented automatic-discovery prerequisites. Google's release guide describes a daily tagged-repository crawl, contingent on validation; **actual gallery inclusion has not been observed**. [Official releasing guide](https://geminicli.com/docs/extensions/releasing/). The native hook file and path substitution follow the [extension reference](https://geminicli.com/docs/extensions/reference/); the event's input/output follows the [hook reference](https://geminicli.com/docs/hooks/reference/).

Both products use the same native hook filename. Claude Code 2.1.282 marketplace validation passed; plugin validation passed with one expected warning: `hooks.AfterAgent: unknown hook event; entry ignored at runtime`. Gemini's [official hook registry](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookRegistry.ts) likewise skips Claude's unknown `Stop` event with a warning. This is documented compatibility with a warning, not silent compatibility.

A regression test runs Gemini's actual shipped command, with native path substitution, against real passing receipts and a later source edit. The host-specific retry and UNVERIFIED behavior also passes. No live model session or global agent configuration was changed. Full host-managed execution inside installed Claude/Codex/Gemini/Cursor versions remains unverified.

## Crawlable website and search notifications

- The first HTML paragraph directly answers the problem: DoneLatch refuses completion acceptance until fresh checks pass and detect a configured behavioral fault.
- Four visible HTML questions and answers match four `FAQPage` entries. `SoftwareApplication` reports version `0.1.1`, a free offer, MIT license, and the public repository. No invented reviews or ratings.
- Canonical URL and `index,follow` remain present. Markup is readable without executing an app bundle. [Google SoftwareApplication documentation](https://developers.google.com/search/docs/appearance/structured-data/software-app).
- `robots.txt` explicitly allows Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot and Google-Extended. The existing canonical sitemap has actual modification date `2026-10-03`; `llms.txt` now includes Gemini installation, version and team links.
- Added a wrapping, mobile-friendly “More tools from the same team” footer linking the hub, ExactGround, CanaryIndex, Waraq Markdown and API alternatives.
- Added a public IndexNow key file under `/donelatch/` and a Pages post-deployment script. It first verifies the page and exact key content, then submits only this project's home URL through the documented single-URL GET with `keyLocation`. No workspace content, credentials or receipts are sent.
- The deployment log records **IndexNow HTTP 202**, meaning URL received with key validation pending. Notification success does not prove indexing or ranking. The optional notification step cannot undo a successful website deployment. [IndexNow protocol](https://www.indexnow.org/documentation).

**Robots scope caveat:** crawlers use the origin-root `/robots.txt`, not `/donelatch/robots.txt`. At this check `https://alidaram99.github.io/robots.txt` returned 404; the product file does not independently control origin crawling. Google's documented 4xx handling treats a missing robots file as no restrictions. The team hub publisher should serve the allow policy and sitemap declarations at the origin root. [Required file location](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt), [Google robots status handling](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

## Executed verification

| Check | Observed result |
|---|---|
| Local Node.js 24 build | Passed; committed bundles stayed identical. |
| Local npm test | 59 passed, 0 failed, 0 skipped. |
| Actual Gemini native command | Accepts current passing evidence; refuses a later edit; capped continuation never creates acceptance. |
| Claude marketplace validator | Passed. |
| Claude plugin validator | Passed with the expected unknown `AfterAgent` warning. |
| [Public release CI](https://github.com/alidaram99/donelatch/actions/runs/37101718832) | Success; Windows and Linux each 59 passed, 0 failed, 0 skipped. Both rebuilt identical bundles and ran the demo. |
| [Pages deployment](https://github.com/alidaram99/donelatch/actions/runs/37101718803) | Success, including scoped IndexNow GET. |
| Real persistence demo | Weak return-value assertion: removed write survives, DONE REFUSED. Fresh-reader assertion: removed write detected, DONE ACCEPTED. Later source edit: DONE REFUSED. |

## Public URL checks

Direct HTTP GETs after deployment returned:

| URL | HTTP |
|---|---|
| https://github.com/alidaram99/donelatch | 200 |
| https://github.com/alidaram99/donelatch/releases/tag/v0.1.1 | 200 |
| https://github.com/alidaram99/donelatch/releases/download/v0.1.1/donelatch-v0.1.1.zip | 200 |
| https://raw.githubusercontent.com/alidaram99/donelatch/v0.1.1/gemini-extension.json | 200 |
| https://alidaram99.github.io/donelatch/ | 200 |
| https://alidaram99.github.io/donelatch/style.css | 200 |
| https://alidaram99.github.io/donelatch/icon.svg | 200 |
| https://alidaram99.github.io/donelatch/robots.txt | 200 |
| https://alidaram99.github.io/donelatch/sitemap.xml | 200 |
| https://alidaram99.github.io/donelatch/llms.txt | 200 |
| https://alidaram99.github.io/donelatch/97f9d2704a2f4b575c3bb73eac6d6a48.txt | 200; key matches |
| https://alidaram99.github.io/exactground/ | 200 |
| https://alidaram99.github.io/canaryindex/ | 200 |
| https://alidaram99.github.io/waraqmd/ | 200 |
| https://alidaram99.github.io/api-alternatives/ | 200 |
| https://alidaram99.github.io/ | **404; parallel hub publication still pending** |
| https://alidaram99.github.io/robots.txt | **404; origin-root policy not published yet** |

The hub link is present as requested, but it must not be reported as working until its publisher's deployment is observed. No other repository or Orcheri application/configuration was edited. No comments, issues, pull requests, social submissions or accounts were created. The only external write surfaces were the authorized repository metadata/commits/release and the scoped search-engine notification.
