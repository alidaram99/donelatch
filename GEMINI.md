# DoneLatch completion evidence

DoneLatch is a local CLI, an acceptance-receipt skill, and an AfterAgent guardrail. It does not modify the host application or independently attest all requirements.

If the current project has receipts.yml, use its reviewed acceptance contract after your final edit. The installed extension's bin/receipts.mjs provides run, faultcheck, and verify-done. Only verify-done exit 0 means that the current configured evidence is accepted. Report actual results, including missing or stale evidence.

Check verify-done first. If the check configuration changed or is not approved, do not execute the project checks, invoke trust, or write the user-level approval store. Report that a human must review and run donelatch trust in the selected project. Ordinary source edits require fresh checks; configuration edits require human approval first.

Do not weaken checks, change exclusions, replace keys or fabricate receipts to satisfy the gate. Checks are trusted commands with OS permissions; obtain the owner's authorization before running a newly introduced command or fault contract. Temporary copies are not sandboxes.

If receipts.yml is absent and the project was never approved, say NOT CONFIGURED; no work has been accepted. A deleted approved policy still needs human review and cannot opt out. Ordinary evidence correction is capped at one turn. Trust refusals stay human-only across retry flags, though host limits can still end the turn. A host ending its turn does not imply accepted work. Follow the existing project's instructions and stop requests.
