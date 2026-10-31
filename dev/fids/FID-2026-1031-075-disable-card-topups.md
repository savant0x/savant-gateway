# FID: Disable card top-ups for a crypto-only launch

**Filename:** `FID-2026-1031-075-disable-card-topups.md`
**ID:** FID-2026-1031-075
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** verified
**Created:** 2026-10-31
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-068
**YAGNI-Compliance:** Verified — one policy flag over the existing Stripe path; no payment code is removed.

## Summary

The operator selected a crypto-only launch and directed that card top-ups be
disabled now. Card availability is currently derived only from whether Stripe
credentials exist, so adding keys to a host would silently reopen card sales
against the operator's decision. The launch gate must be explicit, default off,
and independent of credential presence.

## Environment

`app/api/account/topup/route.ts`, `app/account/page.tsx`,
`components/account/topup-card.tsx`, `components/account/billing-history.tsx`,
`lib/stripe.ts`, `.env.example`, `tests/`. The Stripe webhook and fulfillment
path stay in place so an in-flight session created before the change still
credits correctly and so the lane can be reopened deliberately later.

## Detailed Description

### Problem / expected behavior / root cause

`POST /api/account/topup` returns a Checkout URL whenever
`readStripeConfig()` reports configured keys. Nothing else gates the sale. The
account page passes `stripe.configured` straight to `TopupCard`, and the
disabled branch says payments "will become available", without naming the lane.
Billing history and the account footer name Stripe as the payment path.

Expected: with no explicit enablement, the route refuses card checkout even when
Stripe keys are present, the account page shows an honest unavailable state that
names the USDC lane, and no customer-facing copy claims Stripe is the active
payment path.

### Proposed Solution

1. Add `lib/card-topups.ts` with `readCardTopupPolicy()`, mirroring
   `lib/plan-sales.ts`: `CARD_TOPUPS_ENABLED` unset means disabled; only
   `1/true/yes/on` enables it.
2. Refuse `POST /api/account/topup` with `503` and `X-Reason:
   card_topups_disabled` **before** `readStripeConfig()`, so credentials cannot
   enable sales.
3. Compute the account page's top-up state as `stripe.configured &&
   policy.enabled` and pass the policy reason to the card.
4. Render the reason in `TopupCard`, and correct the Stripe-specific copy in the
   top-up card, billing history and account footer to describe recorded payment
   rather than an active card lane.
5. Document the flag in `.env.example` next to the Stripe block.
6. Unit-test the policy matrix, including that Stripe keys alone do not enable
   card sales.

### Verification

`tests/card-topups.test.mjs` proves the flag matrix and credential independence.
`npm run lint` and `npm run typecheck` prove the route and page wiring. A real
card checkout is not exercised because the lane is intentionally closed; the
webhook suite continues to prove fulfillment for any session that already exists.

## Verification Gates

- gate: test tests/card-topups.test.mjs
- gate: lint
- gate: typecheck

## Perfection Loop

RED: card sales depend on credential presence, not an operator decision.
GREEN: one explicit policy flag, checked before configuration. AUDIT: route
refusal precedes Stripe reads; page state cannot disagree with the route.
ADVERSARIAL: an operator who later adds keys must not reopen cards by accident;
a customer must not see a button that cannot work. Five questions: every
credential state, safe at any scale, no silent reopening, maintainable in two
years, and honest about a lane that is not built yet.

## Implementation Evidence

- **File:line ranges:**
  - `lib/card-topups.ts:21` — `readCardTopupPolicy()`, unset means disabled,
    only `1/true/yes/on` enables.
  - `app/api/account/topup/route.ts:31` — policy check before
    `readStripeConfig()`, refusing with `503` and `X-Reason:
    card_topups_disabled`.
  - `app/account/page.tsx:68-69` — page state is
    `stripe.configured && policy.enabled`; `:169` passes the policy reason.
  - `components/account/topup-card.tsx:115` — renders the actual reason instead
    of a generic promise.
  - `components/account/billing-history.tsx:81` — copy no longer claims Stripe
    checkouts.
  - `.env.example` — `CARD_TOPUPS_ENABLED=false` with the re-enable condition.
  - `tests/card-topups.test.mjs:7-38` — four cases including credentials alone.
  - `scripts/http-suite/checks.mjs:239-244` — live refusal and reason header.
- **Gate output:** `npm test` exit 0 — 348 tests, 348 pass, 0 fail;
  `npm run lint` exit 0 with no warnings; `npm run typecheck` exit 0;
  `npm run quality` PASS (400-line ceiling, 320 files); `npm run build` exit 0
  (compiled successfully); `npm run test:http` exit 0 — 644 checks PASS and the
  trial suite PASS.
- **Adversarial proof:** the HTTP suite runs with `STRIPE_SECRET_KEY` set and
  still receives `503 card_topups_disabled`, which is the credential-presence
  case this FID exists to close.
- **Step statuses:** 1 implemented, 2 implemented, 3 implemented,
  4 implemented, 5 implemented, 6 implemented.

## Resolution

Loop 1 AUDIT: the flag is read once per request on the route and once per render
on the account page; both derive from the same helper, so they cannot disagree.
SELF-CORRECT: the disabled copy names USDC rather than promising generic
"payments", because the operator's ruling is a specific lane, not a date.

## Lessons Learned

A payment method that activates on credential presence is not a decision; it is
an accident waiting for a deployment.
