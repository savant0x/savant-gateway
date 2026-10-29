# Lifetime trial routing — 2026-10-29

Status: active. The operator resumed work. Implement FID-015 with configurable
100,000-token development default, activation off, empty pair map and zero
gateway grant budget. No further trial-size question blocks implementation.
No wallet funding, Stripe credentials or deployment changes.

Intent before edits: additive durable grant/reservation ledger, explicit paid
fallback, account balances and transition prices, regression/HTTP verification.

Implemented the planned disabled infrastructure. Trial grants snapshot historical
free usage and never grow when configuration changes. Verified email and finite
gateway grant issuance budget gate first issuance. Durable reservation records
settle once, including late usage; free reservation/usage writes share the same
transaction. Pair routing refuses unknown-cost, disabled, delisted or cross-provider
paid targets and reuses credit holds. Usage retains requested and serving ids.

Account UI shows lifetime balance/holds/usage and paired rates; model API adds
trial_paid_transition. Legacy regression HTTP suite explicitly disables trials.
New trial HTTP suite is part of test:http, verify and the existing pre-push gate.

Receipt: lint zero warnings; typecheck; 118 unit tests; quality PASS (197 files);
51-route production build; existing 100 HTTP checks and trial suite all PASS.
Browser account heading/rates/overflow passed 1440/390/320. A concurrency fixture
initially exceeded its grant after prompt overhead; corrected to fit exactly one
concurrent estimate, then passed. No live customer data or credentials changed.

Remaining launch requirements are explicit in docs/launch-readiness.md. These
include verification delivery, quota refresh, exact upstream cost_tokens, shared
RPM/subscription capacity, public trial presentation and real funding/payments.
The implementation is disabled, not a claim of launch readiness.
