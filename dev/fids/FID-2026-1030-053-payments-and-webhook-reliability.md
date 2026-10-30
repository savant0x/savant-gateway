# FID: Payment and webhook reliability with fraud controls

**Filename:** `FID-2026-1030-053-payments-and-webhook-reliability.md`
**ID:** FID-2026-1030-053
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-047, FID-2026-1030-052
**YAGNI-Compliance:** Verified — harden real checkout/fulfillment, retain signed-event tests.

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

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: bind accepted payment events to the
configured service environment/account as well as signatures and amounts.
Quarantine mismatches; do not let fixture/service-mode events credit production.
Final convergence checks are in the master planning-audit receipt.

Design only. Credentials, actual financial transactions and externally configured
risk controls remain operator actions; successful fixtures are not a live payment.

## Lessons Learned

Deduplication is reliable only when its state cannot outrun the financial effect.
