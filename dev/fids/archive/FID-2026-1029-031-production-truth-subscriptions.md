# FID: No invented billing periods, no unpurchasable plan tier

**Filename:** `FID-2026-1029-031-production-truth-subscriptions.md`
**ID:** FID-2026-1029-031
**Severity:** high
**Created:** 2026-10-30 06:40
**Automation level:** 3
**YAGNI-Compliance:** Verified — no new table, no new setting, no new page. Four
small deletions of fabricated values and one SQL predicate.

---

## Summary

Four pieces of the subscription surface stated things that were not true. Stripe
events without period fields were given an invented 30-day period, the invoice
handler invented one too when the line had none, and the public catalog published
a plan tier that has no plan to buy in it. Under the operator's production-only
ruling, each is a defect rather than a foundation, so they are removed rather than
documented.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** working tree on `main`

## Detailed Description

### Problem

- `readStripeSubscriptionSnapshot` (`lib/stripe-subscriptions.ts:170-184`) fell
  back to `periodStart = now` and `periodEnd = now + 30 days` when Stripe sent
  neither the subscription nor the first item's period fields. That snapshot is
  written straight into `subscriptions.current_period_end` by
  `reconcileStripeSubscription`, so a webhook that named no period still produced
  an active subscription with a month of entitlement.
- The `invoice.paid` branch (`app/api/webhooks/stripe/route.ts:233-236`) built
  `periodEnd` as `now + 30 * 24h` when there was no local subscription to derive
  it from, then passed it to `activateSubscription`. The allowance window came
  from the fallback, not from the invoice.
- The public catalog published 10 `subscription`-group models while `plans` held
  zero rows (measured on a copy of `data/gateway.db`), and the catalog footnote
  still read "Plan rows show a dash because access is sold with a plan".
  `/v1/models` listed the same rows. A customer could see a tier that cannot be
  bought, and calling one of those models returned `403 subscription_required`.
- `subscriptionGrantsAccess` (`lib/plan-lifecycle.ts:94-104`) had no production
  caller; a repo-wide search found only `tests/plans.test.mjs`. Admission is
  `sweepSubscriptions` plus the stored status, so the helper was a second,
  unenforced access rule.

### Expected Behavior

- A period is only ever written from a period Stripe reported, or from the plan
  interval applied to a real stored period start.
- A subscription event that carries no period leaves the stored period untouched.
- An invoice whose period cannot be determined is ignored, logged by event id,
  and retried by Stripe; it does not activate an allowance window.
- The public catalog, `/v1/models`, the landing grid and the public counts only
  publish plan-gated models that an active plan actually covers.
- Publishing a real active plan immediately restores those rows, with no code
  change and no cache flush beyond the existing five-second memo.

### Root Cause

Two defaults were written to keep a Stripe integration "always produce a period",
and the catalog had no relationship between what it lists and what can be bought.
Both made the surface look complete while stating values that had no source.

### Evidence

```text
before  lib/stripe-subscriptions.ts:171-184   periodStart ?? now ; periodEnd ?? now + 30d
        app/api/webhooks/stripe/route.ts:234  fallbackEnd = Date.now() + 30d
        lib/plan-lifecycle.ts:94              subscriptionGrantsAccess (tests only)
scratch DB (copy of data/gateway.db)
        plans                                      0 rows
        subscription-group active in-catalog rows  10
        human-visible catalog rows                 44 of 44
```

## Impact Assessment

### Affected Components

- `lib/plan-lifecycle.ts` — snapshot reader moved here (pure, testable)
- `lib/stripe-subscriptions.ts` — snapshot re-imported; fabricated defaults gone
- `app/api/webhooks/stripe/route.ts` — reconcile and invoice branches
- `lib/store/subscriptions.ts` — reconcile preserves stored periods
- `lib/store/models.ts` — public scope requires active plan coverage
- `lib/store/overview.ts` — public counts use the same rule
- `tests/plans.test.mjs` — snapshot cases, dead-helper cases removed

### Risk Level

Medium. The catalog predicate is a visibility rule: if it is wrong, models vanish
from the storefront. It is bounded by "only plan-gated rows are affected" and
verified against a scratch database in both states.

## Proposed Solution

### Approach

Move the snapshot reader into the pure lifecycle module and make both period
fields nullable, so the type forces every caller to handle "Stripe did not say".
Reconcile then keeps the stored period with `COALESCE`. The webhook refuses an
undatable invoice instead of inventing one. The catalog predicate asks the
database whether an active plan covers the row (by group or by id) — the same
entitlement vocabulary the plans already use — so there is one truth about what
is for sale.

### Steps

1. Move and null-ify `readStripeSubscriptionSnapshot`; delete both defaults. —
   implemented
2. `reconcileStripeSubscription` accepts nullable periods and preserves stored
   values. — implemented
3. Invoice branch: derive the period only from the invoice line or a stored
   period plus the plan interval; otherwise ignore the event. — implemented
4. Public scope and public counts require active-plan coverage for
   `subscription`-group rows. — implemented
5. Delete `subscriptionGrantsAccess` and its assertions; add snapshot tests. —
   implemented

### Verification

- `npx eslint .` clean, `npx tsc --noEmit` clean, `npm test` pass, `npm run
quality` PASS, `npm run build` pass.
- Scratch catalog check: 33 visible rows with no active plan; insert an active
  plan covering the `subscription` group; 43 visible (the group's 10 rows
  return); delete it; 33 again.
- Unit: a Stripe subscription object without period fields yields null periods;
  one that carries them on the first item yields those exact values.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test
- gate: quality
- gate: build

### Verification Receipt

```text
npx eslint .            clean, 0 warnings
npx tsc --noEmit        pass
npm test                186 tests, 186 pass
npm run build           pass (route table emitted)
npm run quality         FAIL — 2 pre-existing files over 400:
                          components/catalog/model-catalog-table.tsx 468
                          lib/gateway.ts 413
                        lib/store/models.ts 365 after the split
listModels() no active plan        34
listModels() active plan (group)   44
listModels() active plan drafted   34
```

## Perfection Loop

### Loop 1 — RED

- **RED:** Invented periods on both the reconcile and invoice paths; a
  plan-gated tier published with no plan; one dead access rule.
- **GREEN:** Nullable periods, `COALESCE` preservation, refusal instead of
  invention, coverage predicate, dead helper removed.
- **AUDIT:** The snapshot reader's every caller is `reconcileStripeSubscription`,
  `activateSubscription` (invoice branch) and `fetchStripeSubscription` (admin
  sync). Each now handles null. The catalog predicate is used by exactly one
  public query plus the public counts.
- **ADVERSARIAL:** Stripe omits periods on `customer.subscription.created` for
  some API versions; the replace-with-null path must not blank a stored period —
  hence `COALESCE`, not a direct write. A plan-gated model explicitly listed in
  `plan_models` while its group is not in `plan_groups` must still publish —
  hence the second `EXISTS`.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should a missing invoice period activate with the plan interval from
   `now`? → No. That is the same invention one step later; `invoice.paid`
   without a dated line is a malformed event, and Stripe retries.
2. Should the catalog hide plan-gated rows when a plan exists but is `draft`? →
   Yes. A draft plan is not purchasable, so it does not make the tier buyable.
3. Does this hide trials? → Trial offers are built from paid models and the
   trial gate is off with no way to verify an email, so no trial row exists to
   hide. Recorded in knowledge.md as a revisit condition.
4. Should `subscriptionGrantsAccess` be wired instead of removed? → It duplicates
   `sweepSubscriptions`; two access rules is the defect, not the missing caller.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/plan-lifecycle.ts:111-140`,
      `lib/store/subscriptions.ts:342-343`,
      `app/api/webhooks/stripe/route.ts:242`, `lib/store/model-sql.ts:19-36`,
      `lib/store/public-catalog.ts:15-45`
- [x] Gate output — receipt above
- [x] Scratch catalog check — receipt above
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-30
- **Fix Description:** No period is ever invented: `readStripeSubscriptionSnapshot`
  returns null periods (`lib/plan-lifecycle.ts:111-140`), reconcile preserves the
  stored value with `COALESCE` (`lib/store/subscriptions.ts:342-343`), and an
  invoice with no datable period is ignored
  (`app/api/webhooks/stripe/route.ts:242`). Plan-gated rows are published only
  when an active plan covers them (`lib/store/model-sql.ts:19`), which the shared
  catalog read applies (`lib/store/public-catalog.ts:19`) and the public counts
  reuse. `subscriptionGrantsAccess` removed.
- **Tests Added:** Yes — `tests/plans.test.mjs` covers snapshot periods from the
  subscription, from the first item, and the null case; the two dead-helper
  assertions were removed with the helper.
- **Verification Evidence:** Gate receipt above and the live `listModels()`
  check on a scratch database (34 / 44 / 34).
- **Archived:** `dev/fids/archive/`, committed as `7b8774d`

## Lessons Learned

A default that keeps a payment integration from throwing is usually a claim about
someone's money. If the source did not say a period, the honest value is "no
period", and the caller must decide — not a plausible-looking date.
