# FID: Payment and webhook reliability with fraud controls

**Filename:** `FID-2026-1030-053-payments-and-webhook-reliability.md`
**ID:** FID-2026-1030-053
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-047, FID-2026-1030-052
**YAGNI-Compliance:** Verified — harden real checkout/fulfillment, retain signed-event tests.
**Archived:** 2026-10-30 — implementation `8531f9b`; receipt above from that tree.

## Summary

Prove hosted payments become exact credit once despite duplicate/reordered events
and process failure; enforce approved top-up/fraud rules and recover failed delivery.
Keep local fixtures, real service acceptance and production configuration distinct.

## Environment

`app/api/account/topup/route.ts`, `lib/stripe.ts`,
`app/api/webhooks/stripe/route.ts`, `lib/store/topups.ts` and credit ledger.

## Detailed Description

### Problem / expected behavior / root cause

Signature/amount/currency/replay tests exist, but real Checkout/delivery is
unverified. Webhook `claimEvent` persists event IDs separately from subsequent
handling; crash/retry behavior requires atomicity proof, not a replay flag alone.
A checkout return is advisory and must never grant credit.

### Evidence

Webhook :94-105 claims/releases billing events, :295-317 verifies signatures
before claiming. `fulfillTopup` is the existing financial writer. The launch
plan requires real service-delivered events and operator-provided credentials/HTTPS.

## Impact Assessment

Checkout, event state, credit ledger, refunds/disputes and customer purchase UI.
Risk critical: lost payments, duplicate credit and card-testing abuse. 044/061
approve monetary/policy limits; provider fraud controls need actual configuration.

## Proposed Solution

### Approach and steps

1. Audit supported event/state transitions, pending payment expiry, asynchronous
   success/failure and account ownership. Explicitly reject mismatched amounts/currency.
2. Make event claim and financial effect atomic or recoverably stateful; a crash
   after claim must not permanently suppress an unpaid-to-credited transition.
3. Enforce approved purchase bounds, rate/risk rules, idempotent checkout intent,
   and refund/dispute references through 052. Do not claim unconfigured fraud tooling.
4. Provide replay/reconciliation and failed-webhook visibility without bypassing
   signatures or manually marking payment success; record real controlled acceptance.

### Verification

Extend `tests/topup.test.mjs` and production HTTP signed-event checks; planned
`tests/payment-events.test.mjs` covers claim/commit crash, replay, ordering,
partial failure and ownership. Intended chain: account checkout → pending top-up;
signed webhook → atomic event/fulfillment/ledger; operator reconciliation reuses it.
Real Checkout, delivery, duplicate delivery and failure must be observed separately.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
existing `tests/topup.test.mjs` and planned `tests/payment-events.test.mjs`.
HTTP tests require restart at claim/fulfillment boundaries. External acceptance
needs protected Stripe configuration and public HTTPS; 062 owns final release receipt.

## Perfection Loop

RED: missing real acceptance and incomplete crash/claim proof. GREEN: atomic or
recoverable payment effects, approved risk controls and real delivery evidence.
AUDIT: pending. ADVERSARIAL: an acknowledged event cannot be lost between dedupe
and credit. Five questions: all event orders, bounded replay, hostile signatures,
one fulfillment authority and auditable payment-to-ledger mapping.

## Re-audit and convergence (2026-10-30, post-052)

RED (measured in source):

- `claimEvent` inserts a `billing_events` row and the handler deletes it only in
  a caught exception. A process death after the claim and before the financial
  effect leaves a `processed_at` row that suppresses the event forever, while
  the payment is uncredited.
- The claim records no state, attempt count or failure reason, and events carry
  no mode binding, so a fixture/test-mode delivery could reach a live account.
- `fulfillTopup` verifies amount and currency but not that the session's
  metadata user owns the pending top-up.
- No operator view of failed, stale or quarantined payment events exists.

GREEN (documented before code):

1. `billing_events` becomes a state machine: `claimed → processed | failed |
   quarantined`, with attempts, claim time, livemode and last error. A stale
   claim (older than the grace window) or a failed row is reclaimable; a recent
   claim is in-flight; processed and quarantined rows are terminal.
2. The financial effect stays atomic in `fulfillTopup`; the event state is
   updated around it. A duplicate delivery is answered as a replay and never
   reaches the writer twice.
3. Environment binding is explicit: `STRIPE_EXPECTED_LIVEMODE` (when set)
   quarantines a mismatched delivery without crediting. Unset means the mode is
   recorded but not enforced, and that limitation is stated.
4. `fulfillTopup` requires the metadata user to own the pending top-up and
   distinguishes a mismatch (quarantine) from a missing row.
5. An authenticated admin view lists event state, failed/stale claims and
   pending top-ups. Replay still requires a signed Stripe delivery.

AUDIT: the route is the only caller of the event transitions; `fulfillTopup`
remains the single financial writer and runs inside one transaction.

ADVERSARIAL: crash after claim, duplicate delivery, reordered retry, forged
metadata ownership, mode mismatch and a failed handler must each leave at most
one credit and a visible state.

## Implementation

| Responsibility | File |
| --- | --- |
| Event state machine with attempts, mode and failure reason | `lib/payment-events.ts` |
| Durable event columns | `lib/schema/payments.ts`, `lib/db.ts` |
| Declared payment environment | `lib/stripe.ts` (`STRIPE_EXPECTED_LIVEMODE`) |
| Claim/complete/fail/quarantine around the atomic writer | `app/api/webhooks/stripe/route.ts` |
| Ownership check and mismatch result | `lib/store/topups.ts` |
| Operator visibility | `app/api/admin/payments/route.ts` |
| Independent expectations | `tests/payment-events.test.mjs` |
| Route reachability | `scripts/http-suite/quota-checks.mjs` |

## Verification

`npm run verify` exit 0 on 2026-10-30:

```text
lint: zero warnings
typecheck: exit 0
tests 280 / pass 280 / fail 0
quality: PASS (400-line ceiling, 265 files scanned)
production build: clean
http-suite: 262 checks PASS
trial-http-suite: all checks PASS
```

The eight new cases cover: one claim with in-flight duplicates, stale-claim
retry after a crash, terminal processed, failed-then-immediate-retry with the
reason cleared, terminal quarantine, mode mismatch quarantined before any
claim, an undeclared mode recorded but not enforced, and the operator listing
showing state and attempts. Existing signed-event HTTP checks still pass with
their credited/replay shapes, and the admin payments view returns durable state.

Evidence limits: no real Stripe Checkout, delivery, duplicate delivery or
refund was observed — that needs operator credentials, a public HTTPS endpoint
and 062 acceptance. Mode enforcement applies only when `STRIPE_EXPECTED_LIVEMODE`
is set and is unset in the test suites. Pending top-ups are visible but not
automatically expired, and re-delivery remains a signed Stripe action rather
than an in-app replay. Fixture events remain distinguishable from live ones only
through the declared environment.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: bind accepted payment events to the
configured service environment/account as well as signatures and amounts.
Quarantine mismatches; do not let fixture/service-mode events credit production.
Final convergence checks are in the master planning-audit receipt.

Design only. Credentials, actual financial transactions and externally configured
risk controls remain operator actions; successful fixtures are not a live payment.

## Lessons Learned

Deduplication is reliable only when its state cannot outrun the financial effect.
