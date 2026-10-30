# FID: Subscription lifecycle and enforced no-sales launch state

**Filename:** `FID-2026-1030-054-subscription-launch-safety.md`
**ID:** FID-2026-1030-054
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-050, FID-2026-1030-051, FID-2026-1030-053
**YAGNI-Compliance:** Verified — retain snapshots and invoice-driven lifecycle.

## Summary

Make the recorded no-plan-sales launch decision enforceable even when prepaid
Stripe payments are enabled; audit subscription accounting and lifecycle instead
of treating a zero-price catalog label as an entitlement or a payment redirect as renewal.

## Environment

Plan/subscription stores, `lib/plan-lifecycle.ts`, `lib/stripe-subscriptions.ts`,
plans/account/admin routes and webhook dispatch. Local lifecycle is implemented.

## Detailed Description

### Problem / expected behavior / root cause

The no-sales decision currently relies on draft/archived plans and unconfigured
Stripe. Prepaid launch requires Stripe configuration, so absence of credentials
cannot remain the subscription-sales safety gate. Existing manual subscriptions
and invoice processing still require honest accounting and correct access.

### Evidence

`docs/subscriptions-decision.md` keeps implementation and sells nothing; it lists
draft/archived plans plus unset Stripe as the operating mechanism. Public model
scope uses active plan coverage; gateway included calls reserve subscription holds.

## Impact Assessment

Public purchasability, checkout/portal, snapshots, invoices/periods, included
capacity and overage. Risk high: accidental plan sale or unfunded entitlement.
Do not remove existing subscriptions, invent billing periods or silently change snapshots.

## Proposed Solution

### Approach and steps

1. Add one explicit launch sales policy enforced at plan publication/checkout,
   independent of whether Stripe is configured for prepaid credit.
2. Verify immutable purchased snapshots, explicit refresh, period boundaries,
   exhaustion/overage, past-due/cancel/resume and manual-comps semantics.
3. Apply provider capacity, usage and durable settlement contracts from 048–051;
   invoice event replay/order follows 053's atomic event rules.
4. Prove the no-sales branch through UI/API/crafted checkout requests. If the
   operator changes the offering, require real recurring lifecycle acceptance
   before selling, including renewal/failure/portal/cancellation and funded capacity.

### Verification

Extend existing `tests/plans.test.mjs`, `tests/revenue.test.mjs`; planned
`tests/subscription-sales-policy.test.mjs`. HTTP cases set prepaid Stripe ready
while subscription sales remain off; prove no public plan or new subscription
checkout, with existing entitlement access still correct. Intended callers:
public/checkout guards share sales policy; webhook/store owns real period transitions.

## Verification Gates

- gate: test tests/plans.test.mjs
- gate: test tests/revenue.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
named existing files and planned `tests/subscription-sales-policy.test.mjs`.
No-sales acceptance is mandatory for current launch. Real recurring acceptance
is additionally mandatory only after an explicit offering change; it remains a tracked gate.

## Perfection Loop

RED: prepaid configuration can remove a supposed no-sales safeguard. GREEN:
independent sales policy plus lifecycle proof. AUDIT: pending. ADVERSARIAL: an
admin activates a plan or a caller crafts checkout directly; the gate must hold.
Five questions: every entitlement state, aggregate capacity, hostile purchase
requests, immutable snapshots and honest invoice provenance.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: new-sales denial must not discard
valid prior checkout/invoice obligations or revoke purchased snapshots. Test
the sales-off transition with a payment already in flight and existing access.
Final convergence checks are in the master planning-audit receipt.

Design only. Current completion path proves safe no-sales operation and existing
accounting; it does not authorize enabling recurring purchases.

## Lessons Learned

An intentionally disabled offering needs a tested policy boundary, not missing credentials.
