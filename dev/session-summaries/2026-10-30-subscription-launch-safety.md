# Session summary — subscription launch safety (FID-2026-1030-054)

**Date:** 2026-10-30
**FID:** FID-2026-1030-054
**Implementation:** `cbc31df`
**Status:** implemented, verified, archived

## Request

Continue the launch sequence with 054: subscription lifecycle and the enforced
no-sales launch state.

## Measured defect

The no-sales decision was carried by two indirect conditions: no plan was left
`active`, and `STRIPE_SECRET_KEY` was unset so checkout returned `503`. Prepaid
credit requires that key configured, so the second condition disappears at
launch. Nothing else consulted a sales policy: `listActivePlans()` published any
stored active plan, the checkout route only checked Stripe readiness and plan
status, and the admin API could activate a plan at any time.

## Change

- `lib/plan-sales.ts` — `PLAN_SALES_ENABLED` parsed into an explicit policy
  (unset or any non-truthy value means off) plus a pure
  `decidePlanActivation` decision.
- `lib/store/plan-rows.ts` — `listSellablePlans()` returns nothing while sales
  are off; the landing page, `/plans` and `/api/plans` use it.
- `lib/store/plans.ts` — creating or updating a plan into `active` is refused
  with `409` while off. Editing an already-active plan, archiving and drafts stay
  allowed, so existing subscriptions are never invalidated.
- `app/api/account/subscription/route.ts` — policy is checked before Stripe
  configuration and returns `403` with `X-Reason: plan_sales_disabled`.
- `.env.example` and `docs/subscriptions-decision.md` — the flag is documented
  as the gate, with the Stripe key no longer described as one.

Not gated on purpose: manual comps, extensions, revocation, the customer portal,
the account subscription summary, and webhook-driven invoice activation. A
checkout created before the switch is an existing obligation and still
completes through its signed invoice.

## Verification (actually run)

```text
npm run verify: exit 0
  lint: zero warnings          typecheck: exit 0
  tests 290 / pass 290         quality: PASS (400-line ceiling, 266 files)
  production build: clean      http-suite: 284 checks PASS
  trial-http-suite: all checks PASS
CI run 41098426834 (cbc31df): success
attribution-guard 41098426816: success
```

New coverage:

- `tests/subscription-sales-policy.test.mjs` — unset/truthy/other flag values and
  the activation matrix (create/draft/archived refused while off, active edits
  allowed, everything allowed while on).
- HTTP suite — a draft is authored, publishing is `409`, a plan forced active in
  storage still yields an empty `/api/plans`, `/plans` renders the unavailable
  state, a crafted checkout is `403 plan_sales_disabled` with no Stripe mention,
  a signed `invoice.paid` activates a pre-existing in-flight checkout, a manual
  comp is active, and included usage serves, bills `subscription` and leaves
  credit unchanged.

## Not claimed

- No real Stripe recurring lifecycle: Checkout, renewal, failure, cancellation,
  resume or portal were not exercised. That is B4/062.
- No funded upstream wallet sized to a sold allowance.
- No offering decision: the flag stays unset, so nothing is for sale.
- The policy changes new sales only; it does not audit already-issued
  entitlements or size existing allowances.
