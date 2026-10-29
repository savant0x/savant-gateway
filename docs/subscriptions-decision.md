# Subscription system — keep or remove

Decision date: 2026-10-29. Status: **keep the implementation, do not sell plans
at launch.** This document records the evidence and the reasoning; it is not a
claim that subscriptions are production-ready.

## What the system actually is

A plan is an operator-authored product: price, month/year interval, included
model groups and individual models, a weighted-token allowance per period, an
overage mode (`block` or `credit`) with markup, and a draft/active/archived
state. A subscription is a purchased snapshot of that plan plus the exact model
ids the customer may use. Editing a plan later changes future checkouts only;
refreshing entitlements is an explicit admin action.

At request time the gateway picks exactly one billing source:

- `subscription` included usage reserves weighted tokens against the open
  allowance period and charges zero.
- Exhausted `block` plans return `402 subscription_limit_reached`.
- Exhausted `credit` plans take the normal credit hold with the snapshot markup.
- A subscription-group model with no covering plan returns
  `403 subscription_required`; a past-due plan returns
  `402 subscription_past_due` before free or credit routing.

Stripe Checkout runs in subscription mode; signed `invoice.paid` activates the
period; `invoice.payment_failed` marks past due; the customer portal, cancel,
and resume are wired. Manual plans are comps with no Stripe ids. Duplicate
Checkout requests return `409`.

## Evidence of what works

- Local signed-webhook activation, one-period opening, replay no-op, exhausted
  `block` and `credit` behavior, and manual extend/revoke were exercised in the
  FID-008 disposable HTTP receipt (CHANGELOG, 2026-10-29).
- `tests/plans.test.mjs` covers validation, entitlement snapshots, allowance and
  overage math, and lifecycle mapping.
- Admin **Plans** and **Subscriptions**, customer `/plans`, the account
  subscription card, and per-plan revenue analytics all exist and typecheck.

## What is not verified

- A real Stripe Checkout session, Stripe-delivered recurring invoice, failed
  payment, cancellation, renewal, and portal access. No Stripe test credentials
  are configured (blocker B1/B4 in `SCOPE.md`).
- A funded upstream wallet. The paid wallet balance is `$0`, so any included
  allowance that routes to a paid upstream model would fail upstream even though
  the local accounting says the customer is entitled.
- Capacity interaction. Included subscription usage does **not** pass through
  free-pool admission; it spends paid upstream capacity directly. There is no
  shared capacity control across subscriptions, trial, and the daily free
  allocation, which `docs/launch-readiness.md` still lists as an open gate.

## Options considered

1. **Remove the system.** Deletes tables, Stripe lifecycle, webhook branches,
   admin panels, customer pages, analytics queries, and tests. High blast radius
   on a working revenue path, and it would break per-plan revenue analytics and
   the archive's verified receipts. Rejected.
2. **Keep it and sell plans at launch.** Requires real Stripe acceptance, a
   funded wallet sized to the allowances sold, and a shared capacity model.
   Selling an allowance the upstream cannot serve converts revenue into refund
   and churn risk. Rejected for launch.
3. **Keep the implementation, offer nothing yet.** Plans stay draft/archived so
   `/plans` and `/api/plans` publish nothing purchasable; Stripe stays
   unconfigured, so even a crafted checkout returns `503`; admin tooling remains
   available for comps and testing. **Selected.**

## How the launch gate is operated

- No plan is left `active` at launch. Archiving a plan removes it from the
  public catalog and from new checkouts.
- `STRIPE_SECRET_KEY` stays unset in production until the acceptance run in
  `docs/launch-readiness.md` passes; checkout already returns `503` without it.
- The free path does not depend on subscriptions: free-group models route
  through `free_pool_allocations`, and paid models require prepaid credit.

## Revisit criteria

Re-enable plan sales only when all of the following are true:

1. A real test-mode Checkout, invoice, failure, cancellation, renewal, and
   portal journey has passed with recorded evidence.
2. The upstream wallet is funded, with a low-balance alert and an operating
   reserve.
3. Included allowances are sized from measured upstream cost and a shared
   capacity model, not from a per-plan guess.
4. Refund, dispute, expiration, and promotional-credit policy is written and
   reflected in the product copy.
