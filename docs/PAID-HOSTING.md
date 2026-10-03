# Optional hosted analysis: future plan

Version 0.1.2 has no paid service and makes no revenue claim. The CLI, local fault checks, hooks, and local receipts are free under MIT. A payment page, subscription, or current paid Actor must not be inferred from this document.

A later Apify pay-per-event service could analyze an explicitly uploaded, redacted contract/evidence bundle and suggest a small set of stronger negative controls. It must return a concrete finding tied to the supplied evidence, not a paid badge promising that arbitrary work is correct.

The hosted boundary needs review before implementation: opt-in uploads, no secrets by default, bounded isolated execution if execution is offered at all, deletion/retention policy, actual measured compute, and a clear refund/error charging rule. Local signing must not be represented as independent hosted attestation.

The intended payout route is the owner's existing Apify developer payout method via an approved Payoneer/SWIFT account. That approval and any platform fees are external requirements. There is no Stripe/PayPal dependency in the plan. Paid demand, pricing, and margins have not been validated; charge only after there is a useful hosted capability and an honest cost measurement.

The compounding product asset would be a permissioned library of real outcome-contract failures and useful negative controls. User source code is not that asset and must not be silently collected. A future owner-rule guard pack should also remain explicit about policy coverage and bypassability.
