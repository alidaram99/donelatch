---
name: acceptance-receipt
description: Produce fresh DoneLatch acceptance and fault-check receipts for a configured coding project before reporting completion.
---

Read the project's `receipts.yml` and preserve its user-approved checks, protected files, and mutation scope. A passing test alone is not an accepted outcome.

Before any execution, ask the CLI's `verify-done` for current approval/evidence status. If it says the check configuration changed or is not approved, do not run checks, approve it, edit the outside-repo trust store, or invoke `trust`. Report that a human must review and run `donelatch trust` in the project. Human approval is required again after every acceptance-configuration change. Only an already approved configuration may proceed to execution.

Locate this plugin's `bin/receipts.mjs` from the installed plugin root. Invoke it with Node in the target project: `node /path/to/donelatch/bin/receipts.mjs run`, then `faultcheck`, then `verify-done`. Quote paths that contain spaces. Run these after the last source or acceptance-configuration edit. Report the verifier's real result and the receipt path.

Configured commands execute with the current user's permissions. Review unfamiliar check commands and their side effects before running them; preserve the user's authorization scope. Fault copies are not security sandboxes. Avoid destructive commands, live credentials, and external writes in fault checks.

If checks miss a configured fault, identify the weak outcome contract and improve the test with concrete behavioral assertions. Do not remove the failing mutation, weaken a protected contract, modify the verifier, edit the receipt log, or change key material just to obtain a green result. A change to the agreed acceptance contract requires the owner's decision unless already authorized.

If verification still fails, state which checks, freshness conditions, or fault controls remain unmet. Hooks can request a correction but can be disabled or reach their retry cap; they do not certify completion. CI or a separate reviewer should run `verify-done` as the acceptance boundary. Do not call local signatures independent human review or proof of total correctness.
