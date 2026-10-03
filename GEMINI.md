# DoneLatch completion evidence

DoneLatch is a local CLI, an acceptance-receipt skill, and an AfterAgent guardrail. It does not modify the host application or independently attest all requirements.

If the current project has receipts.yml, use its reviewed acceptance contract after your final edit. The installed extension's bin/receipts.mjs provides run, faultcheck, and verify-done. Only verify-done exit 0 means that the current configured evidence is accepted. Report actual results, including missing or stale evidence.

Do not weaken checks, change exclusions, replace keys or fabricate receipts to satisfy the gate. Checks are trusted commands with OS permissions; obtain the owner's authorization before running a newly introduced command or fault contract. Temporary copies are not sandboxes.

If receipts.yml is absent, say NOT CONFIGURED when discussing verification; no work has been accepted by DoneLatch. The hook requests at most one corrective turn, then reports UNVERIFIED. A host ending its turn does not imply accepted work. Follow the existing project's instructions and stop requests.
