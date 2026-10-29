# Lifetime trial routing — 2026-10-29

Status: closed at operator request. FID-015 implemented with configurable
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

Implementation committed as `d3e4a56`; FID-015 closed against that commit and
archived. The remaining launch controls are not represented as completed.

## Handoff

Operator instruction: "make a handoff and close the session".

Branch: `main`. Implementation `d3e4a56`; closure `20c6edc`. Both were pushed
to origin/main. The restart interrupted the original push; it was repeated
successfully with all pre-push gates passing. Remote HEAD was confirmed as
`20c6edc044c6c42b0e4753b5d18714c0179187c1` before this handoff edit.

Tracked worktree was clean. Preserve the existing untracked local-only
`.savant/`, `debug/`, and `dev/audit/` directories; do not stage or delete them.
No release, deployment, live wallet funding, or Stripe setup occurred.

### Resume here

1. Read the governing single-agent protocol, SCOPE.md, this handoff,
   docs/launch-readiness.md and docs/trial-conversion-contract.md.
2. Keep trial activation off. `.env.example` defaults: TRIAL_ENABLED=false,
   TRIAL_WEIGHTED_TOKENS=100000, TRIAL_GATEWAY_GRANT_BUDGET=0 and
   TRIAL_MODEL_PAIRS={}. The amount is configurable; 100,000 is a development
   default, not a final activated offering. Do not enable it merely to test.
3. Continue launch controls with a new converged FID: automatic provider quota
   refresh and UTC reset handling; shared admission across subscriptions/trials;
   exact upstream usage.cost_tokens capture in JSON/SSE; shared RPM and abuse
   controls; verification delivery; and honest public trial/paid pricing labels.
   The account UI and model API already expose transition rates, but the public
   catalog's current Free labels describe the active legacy mode.
4. Validate explicit pairs before activation. The stored catalog audit found
   six exact paid counterparts among eleven free rows. Five lack exact matches;
   never infer substitutions for different model revisions. Candidate ids and
   missing counterparts are listed in the trial contract.
5. Preserve the operator's instruction to fund the upstream wallet and configure
   Stripe near launch. Real Checkout, real webhook delivery, funded paid upstream
   inference, deployment and release acceptance are not verified by mock tests.

### Implementation map

- lib/trials.ts: config parsing and fail-closed defaults.
- lib/schema/trials.ts and lib/trial-ledger.ts: grants, durable reservations,
  historical usage offset, immutable grant amount and one-time settlement.
- lib/store/free-pool.ts: atomic shared-pool/trial reservation and settlement.
- lib/gateway-trial.ts: explicit paired paid route and credit hold.
- lib/store/usage.ts: requested model id plus serving_upstream_id, trial replay
  protection in the usage transaction.
- components/account/trial-card.tsx and lib/store/trial-offer.ts: account
  balances/rates and model API transition metadata.
- tests/trials.test.mjs and scripts/trial-http-suite.mjs: ledger and production
  HTTP coverage, included in existing test/verify/pre-push commands.

The trial gate requires verified email, positive acquisition budget, explicit
valid paid pairs and quota synced within five minutes. Without automatic
refresh it intentionally refuses stale capacity. Subscription entitlement has
precedence; complete cross-mode upstream-capacity control before activation.
Usage currently settles raw input/output tokens times model weight; exact
upstream billed cost_tokens remains a launch requirement. No cancellation or
real-payment acceptance should be inferred from the successful SSE fixture.

### Verification receipt

Final successful pre-push receipt on the committed tree:

```text
attribution-guard: PASS
lint: exit 0, zero warnings
typecheck: exit 0
tests: 118 passed, 0 failed
quality: PASS (400-line ceiling, 197 files scanned)
production build: compiled successfully, 51 routes
http-suite: 100 checks PASS
trial-http-suite: all checks PASS
pre-push: all gates passed
main -> main
```

Browser account trial heading, configured unequal rates and document overflow
checks passed at 1440, 390 and 320 pixels against disposable data. All runtime
trial/payment tests used disposable databases and mock upstream responses.
FID-015 is archived; no active implementation FID remains from this session.
