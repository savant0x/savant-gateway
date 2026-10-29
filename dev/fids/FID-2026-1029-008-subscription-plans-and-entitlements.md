# FID: Customer subscription plans, entitlements, and recurring billing

**Filename:** `FID-2026-1029-008-subscription-plans-and-entitlements.md`
**ID:** FID-2026-1029-008
**Severity:** high
**Status:** verified
**Created:** 2026-10-29 10:42 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1029-007 (`model_groups`, `models.group_slug`)
**Related record:** FID-2026-1029-006 owns one-time credit top-ups; this FID
adds recurring plans without replacing the prepaid credit path.

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. `verified`
means the implementation, gates, and disposable-database receipt exist; closure
is pending the commit SHA. The repository gates are `lint`, `typecheck`, `test`,
`quality`, `build`, and `verify`.

## Summary

The word “subscription” currently describes a catalog bucket, not a customer
product. `accessFor` labels every `free/*` row that is not free-callable as
`subscription`; there is no plan table, no entitlement, no included allowance,
no recurring charge, no subscription record, and no controller for any of
those things. The Stripe integration sells one-time credit top-ups only.

This FID adds a real subscription service:

- an operator-managed plan catalog with price, interval, included model
  groups/models, included weighted-token allowance, and an explicit overage
  policy;
- a snapshot of the plan and its model entitlements when a customer subscribes;
- Stripe Checkout in subscription mode, recurring invoices, cancellation,
  payment failure, and webhook reconciliation;
- gateway enforcement that grants included usage without touching credit,
  blocks or charges overage according to the plan, and returns
  `subscription_required` when a plan-only model has no active entitlement;
- customer plan selection, usage, cancellation, and billing history;
- an admin Plans page and Subscriptions page with create/edit/archive,
  comp/grant, cancel, sync, entitlement refresh, and invoice visibility.

The existing prepaid credit path stays intact. A customer can have one active
subscription and can still top up credit for paid or overage usage.

## Environment

- **OS:** Windows 11, Git Bash.
- **Runtime:** Node `v24.21.0`, npm `12.2.1`.
- **Tool Versions:** Next.js `16.4.3`, React `19.3.0`, HeroUI `3.2.7`,
  Tailwind CSS `4.3.3`, better-sqlite3 `13.0.3`, Stripe SDK `23.0.1`,
  TypeScript `5.9.3`.
- **Commit/State:** FID-007 is closed at `161ddcc`. The FID-008 implementation
  is present and verified but uncommitted; no commit SHA exists yet. The
  working tree adds the plan/subscription schema, stores, Stripe lifecycle,
  gateway enforcement, customer/admin surfaces, tests, and records.

## Detailed Description

### Problem

A customer cannot buy a subscription and the operator cannot create one.

The catalog says `subscription`, but the gateway has no notion of a customer
plan. `ModelAccess` includes `"subscription"`, yet `accessFor` derives it from
an id prefix. The gateway’s free check ignores it, so a subscription-labeled
row goes down the paid path; because most such rows have no sell price, the
caller receives `503 model_unpriced`. There is no plan price, interval, token
allowance, included-model list, entitlement check, invoice, or cancellation.

The provider account has an upstream subscription quota. The admin provider
card displays that quota. It is the gateway owner’s upstream capacity, not a
customer’s plan, and it cannot be sold or controlled per customer.

The Stripe webhook handles `checkout.session.completed` and
`checkout.session.async_payment_succeeded` for one-time top-ups. It does not
handle `customer.subscription.*` or `invoice.*`. The admin navigation has no
Plans or Subscriptions page. The customer account page has a top-up card and
credit ledger, but no plan card, allowance meter, cancel action, or invoice
history.

### Expected Behavior

1. The operator can create draft, active, and archived plans. A plan has a
   name, slug, description, price, currency, month/year interval, included
   weighted-token allowance, overage policy, sort order, included model groups,
   and optional individual models.
2. An active plan is publicly listed on `/plans` and can be purchased by a
   signed-in customer through Stripe Checkout in subscription mode.
3. A customer can have at most one active or past-due subscription. Checkout
   is rejected with a clear conflict when one already exists.
4. Activation snapshots the plan name, price, interval, allowance, overage
   policy, and the exact model ids the customer is entitled to. Later plan
   edits do not silently rewrite an existing subscriber’s purchase.
5. Included usage is free of credit holds and credit debits until the
   period’s weighted-token allowance is exhausted. Usage is metered against
   the open subscription period.
6. When the allowance is exhausted, the plan’s `block` policy returns `402
   subscription_limit_reached`; the `credit` policy charges the model’s sell
   price plus the plan’s overage markup, using the normal credit hold and
   settlement path.
7. A model in a subscription group with no active entitlement returns `403
   subscription_required`, not a confusing unpriced error.
8. A failed payment moves the subscription to `past_due` and blocks new
   included calls. A successful invoice payment reactivates it and opens a
   fresh allowance period.
9. Cancellation at period end leaves access in place until the period ends.
   Immediate revocation closes access and the open period.
10. The operator can grant a manual comp, extend it for another period, cancel
    it, or move a customer to a different plan without inventing a Stripe
    payment.
11. The operator can see every subscription, period usage, invoice, and
    entitlement count, and can refresh entitlements from the current plan when
    that is deliberate.
12. Every customer mutation is account-scoped and same-origin checked. Every
    admin mutation is admin-session guarded and same-origin checked. Webhooks
    are signature-verified and idempotent.

### Root Cause

The product has no subscription entity. `subscription` was used as a display
label for catalog rows that the upstream provider restricts, not as a
purchasable plan. The billing model is exclusively prepaid credit: `topups`
fund `users.credit_micros`, and `usage_events` debit that balance. Adding a
plan requires a separate entitlement and allowance model, plus a recurring
payment lifecycle that the current checkout path does not have.

### Evidence

`lib/store/shared.ts:99-105` derives the label:

```ts
export function accessFor(
  row: Pick<ModelRow, "allow_free" | "token_weight" | "provider" | "id">,
): ModelAccess {
  if (row.allow_free === 1 && row.token_weight > 0) return "free";

  return row.id.startsWith("free/") ? "subscription" : "paid";
}
```

`lib/gateway.ts:63` decides free calls from the provider flag, not a plan:

```ts
function isFreeCall(model: GatewayModel) {
  return model.allowFree && model.tokenWeight > 0;
}
```

`lib/gateway.ts:183-190` sends every non-free call to the paid path; an
unpriced subscription-only row therefore returns 503:

```ts
if (!free) {
  if (model.sellInputMicros <= 0 && model.sellOutputMicros <= 0) {
    return jsonError(
      503,
      `Model ${model.id} is not currently available for purchase.`,
      "model_unpriced",
    );
  }
```

`lib/types.ts:1` has the access label and `lib/types.ts:8-15` has
provider-level subscription fields. `lib/store/provider.ts` persists those
fields, and `components/dashboard/provider-card.tsx:54-72` displays them as
the owner’s upstream quota. None of that is a customer plan.

`lib/db.ts:272-284` creates only one-time `topups`; there is no plan,
subscription, entitlement, period, or subscription-invoice table.
`app/api/account/topup/route.ts:66-92` creates a Stripe Checkout session with
`mode: "payment"`. `app/api/webhooks/stripe/route.ts:10-13` handles only
top-up checkout events.

`components/admin/admin-nav.tsx:7-13` has Overview, Customers, Catalog,
Pricing, and Analytics, but no Plans or Subscriptions. `app/account/page.tsx`
renders credit and top-up history, not a plan. `components/account/auth-screen.tsx:29`
still advertises “No subscription or minimum spend,” which is a promise the
current product cannot keep once plans exist.

## Impact Assessment

### Affected Components

- `lib/db.ts` — plan, entitlement, subscription, period, hold, invoice, and
  billing-event tables; `users.stripe_customer_id`; usage snapshot columns.
- New `lib/plans.ts` — pure plan validation, interval/price rules, inclusion
  rules, entitlement selection, allowance math, overage decisions.
- New `lib/store/plans.ts` — plan CRUD, inclusion expansion, counts.
- New `lib/store/subscriptions.ts` — subscribe, activate, renew, cancel,
  expire, grant, extend, refresh entitlements, list, periods, holds, invoices.
- New `lib/stripe-subscriptions.ts` — Stripe customer, checkout, portal,
  subscription fetch/cancel, event reconciliation helpers.
- `lib/gateway.ts` — entitlement resolution, free/plan/credit decision,
  subscription hold reservation, overage price, `subscription_required`.
- `lib/gateway-settle.ts`, `lib/store/usage.ts` — subscription context,
  weighted-token metering, period settlement, usage snapshots.
- `lib/store/shared.ts`, `lib/store/models.ts`, `lib/store/overview.ts`,
  `lib/gateway-settle.ts` — group joins and subscription counts.
- `app/api/webhooks/stripe/route.ts` — dispatch top-ups and subscription
  lifecycle events with billing-event idempotency.
- `app/api/account/subscription/route.ts`,
  `app/api/account/subscription/cancel/route.ts`,
  `app/api/account/subscription/resume/route.ts`,
  `app/api/account/subscription/portal/route.ts` — customer lifecycle.
- `app/api/plans/route.ts` — public active-plan listing.
- `app/api/admin/plans/route.ts`, `app/api/admin/subscriptions/route.ts` —
  operator controls.
- `app/api/models/route.ts`, `app/v1/models/route.ts`, `lib/types.ts` —
  additive `requiresSubscription`/`subscription_required` fields.
- New `app/plans/page.tsx`, `components/plans/*`,
  `components/account/subscription-card.tsx`.
- New `app/admin/(panel)/plans/page.tsx`,
  `app/admin/(panel)/subscriptions/page.tsx`,
  `components/admin/plans-*`, `components/admin/subscriptions-*`,
  `components/admin/admin-nav.tsx`.
- `components/dashboard/provider-card.tsx`, `app/models/page.tsx`,
  `components/account/auth-screen.tsx`, landing copy — distinguish upstream
  subscription capacity from customer plans.
- `tests/plans.test.mjs` — plan validation, entitlements, allowance, overage.
- `README.md`, `AGENTS.md`, `knowledge.md`, `docs`/API reference, `SCOPE.md`.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability.
- [x] High: Major product surface missing; recurring revenue cannot be sold.
- [ ] Medium: Feature degraded, workaround exists.
- [ ] Low: Minor issue, cosmetic, or edge case.

The current product is safe because subscription-labeled rows cannot be used
successfully: they are either unpriced (503) or priced and charged as credit.
The new feature changes billing semantics, so the highest risks are:

- **Entitlement over-grant:** a customer gets plan access without a paid
  invoice. Mitigation: activate only on signed `invoice.paid`; checkout
  completion alone does not activate; idempotent event processing.
- **Allowance races:** concurrent calls exceed the included allowance.
  Mitigation: reserve estimated weighted tokens in a subscription hold before
  dispatch and settle actual usage in the same transaction.
- **Plan drift:** plan edits silently change what existing customers bought.
  Mitigation: snapshot plan values and model ids at activation; refresh is an
  explicit admin action.
- **Double billing:** included usage charges credit. Mitigation: a single
  billing decision per call, one path only; usage records `billing_source`.
- **Webhook spoof/replay:** unsigned or replayed events grant access.
  Mitigation: signature verification and `billing_events` primary-key
  idempotency.
- **Economic loss:** a plan includes a model whose upstream cost exceeds the
  allowance value. The admin plan editor shows cost and allowance coverage;
  the operator owns the pricing decision.

## Proposed Solution

### Approach

Treat a subscription as a purchased plan snapshot, not a live pointer to an
editable plan. The plan is the authoring surface; the subscription stores what
the customer bought and which model ids were included when it activated. This
keeps the admin in control without silently changing existing purchases.

There are three billing sources:

- `free` — the FID-007 group is free; no charge, no plan required.
- `subscription` — the call is covered by the active plan’s included
  allowance; no credit hold, no credit debit.
- `credit` — the call is paid from prepaid credit, either because the model is
  paid-only or because the plan’s allowance is exhausted and its overage mode
  is `credit`.

A call uses exactly one source. The gateway records the source and the
subscription/period ids on the usage row.

### Data Model

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  price_micros INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  included_weighted_tokens INTEGER NOT NULL DEFAULT 0,
  overage_mode TEXT NOT NULL DEFAULT 'block'
    CHECK (overage_mode IN ('block', 'credit')),
  overage_markup_bps INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plan_groups (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  group_slug TEXT NOT NULL REFERENCES model_groups(slug) ON DELETE RESTRICT,
  PRIMARY KEY (plan_id, group_slug)
);

CREATE TABLE plan_models (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, model_id)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL
    CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'expired')),
  source TEXT NOT NULL DEFAULT 'stripe'
    CHECK (source IN ('stripe', 'manual')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan_name_snapshot TEXT NOT NULL,
  price_micros_snapshot INTEGER NOT NULL,
  currency_snapshot TEXT NOT NULL,
  interval_snapshot TEXT NOT NULL,
  included_weighted_tokens_snapshot INTEGER NOT NULL,
  overage_mode_snapshot TEXT NOT NULL,
  overage_markup_bps_snapshot INTEGER NOT NULL,
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX subscriptions_active_user_idx
  ON subscriptions(user_id)
  WHERE status IN ('active', 'past_due');

CREATE TABLE subscription_models (
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  PRIMARY KEY (subscription_id, model_id)
);

CREATE TABLE subscription_periods (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  included_weighted_tokens INTEGER NOT NULL,
  weighted_tokens_used INTEGER NOT NULL DEFAULT 0,
  weighted_tokens_held INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  UNIQUE (subscription_id, period_start)
);

CREATE UNIQUE INDEX subscription_periods_open_idx
  ON subscription_periods(subscription_id)
  WHERE status = 'open';

CREATE TABLE subscription_holds (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES subscription_periods(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  weighted_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE subscription_invoices (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  provider_invoice_id TEXT UNIQUE,
  amount_micros INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'open', 'void')),
  period_start TEXT,
  period_end TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
CREATE UNIQUE INDEX users_stripe_customer_idx
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
ALTER TABLE usage_events ADD COLUMN billing_source TEXT NOT NULL DEFAULT 'credit';
ALTER TABLE usage_events ADD COLUMN subscription_id TEXT;
ALTER TABLE usage_events ADD COLUMN subscription_period_id TEXT;
ALTER TABLE usage_events ADD COLUMN included_weighted_tokens INTEGER NOT NULL DEFAULT 0;
```

`subscription_models` intentionally has no foreign key to `models`: the
snapshot must survive a model being delisted or removed. `plan_groups` depends
on FID-007’s `model_groups`; `plan_models` references the catalog. A plan must
have at least one group or model before it can be activated, and the free
system group cannot be included (free models are already free).

### Plan Rules

- **Slug:** immutable, lowercase `^[a-z][a-z0-9-]{1,31}$`, unique, reserved
  values `free`, `paid`, `subscription`.
- **Name:** trimmed, 1–60 characters, case-insensitive unique.
- **Description:** optional, trimmed, maximum 300 characters.
- **Status:** `draft` is editable but not public; `active` is listed and
  purchasable; `archived` blocks new checkout but leaves existing subscriptions
  and their snapshots active.
- **Price:** a whole number of cents, minimum 50 cents for an active Stripe
  plan, maximum $10,000; stored in micros. A draft may have a zero price.
- **Interval:** `month` or `year`, passed to Stripe as the recurring interval.
- **Included allowance:** non-negative weighted tokens per period. Zero is
  allowed; it means every included call is overage, not that the plan has no
  value.
- **Overage:** `block` or `credit`. `credit` uses the model’s sell prices plus
  `overage_markup_bps`; a zero/zero model still returns 503. There is no
  automatic top-up.
- **Overage markup:** 0–100000 bps, integer, applied only to credit overage.
- **Sort order:** lower first, then name.
- **Inclusions:** at least one group or model required to activate, and the
  union must expand to at least one catalogued model. A plan may include
  multiple groups and individual models; the union is used. A model explicitly
  included is included even if another plan uses another group. The free system
  group and a model whose group is free cannot be included; those calls are
  already free. A group referenced by a plan cannot be deleted until the plan
  drops it or the unused plan is deleted; subscription snapshots store model
  ids, so active subscriptions survive a later group deletion.
- **Editing:** changes affect future checkouts and manual grants. Existing
  subscription snapshots are not changed. The admin UI states this and offers
  an explicit per-subscription refresh action.
- **Archiving:** new checkouts reject with `plan_archived`. Existing Stripe
  renewals continue; existing manual grants continue to their period end.
- **Deleting:** only draft or archived plans with no subscriptions. Otherwise
  return `409 plan_in_use`; archive instead.
- **One active subscription:** a customer may have one `active` or `past_due`
  subscription. `incomplete` checkout rows do not count as active and expire
  after 24 hours.
- **Manual grants:** source `manual`, no Stripe id, one period, no automatic
  renewal; the admin can extend or revoke. A manual grant copies the same
  entitlement snapshot and period rules.
- **Expiry sweep:** a read/gateway sweep marks `incomplete` subscriptions older
  than 24 hours as `expired`, and active subscriptions whose
  `current_period_end` has passed as `expired`, closing the open period. Stripe
  webhooks normally do this first; the sweep is the local safety net for a
  missed event and for manual grants.

### Entitlement Resolution

For an authenticated model call:

1. Resolve the model and its group (FID-007).
2. Load the customer’s `active` subscription whose `current_period_end` is in
   the future. If it is `past_due`, return `402 subscription_past_due` before
   considering free or credit paths.
3. If the subscription has expired by time, mark it `expired`, close its open
   period, and continue as if there were no subscription.
4. If a subscription exists and `subscription_models` contains the model id,
   the plan covers the model:
   - load the open period; if none, return `503 subscription_period_missing`
     and log an operator alert;
   - if `included - used - held` covers the estimated weighted tokens, reserve
     a subscription hold and use the `subscription` source;
   - otherwise apply `overage_mode_snapshot`: `block` returns `402
     subscription_limit_reached`; `credit` falls through to the credit path
     with the plan’s overage markup.
5. If there is no covering subscription, use the group billing mode:
   - `free`: free source, no hold;
   - `paid`: credit source, normal hold and settlement;
   - `subscription`: return `403 subscription_required`.
6. A model included by a plan is never charged credit while included usage is
   available, even if its group would otherwise be paid.

If multiple active subscriptions existed, the resolver orders by plan
`sort_order`, then subscription creation time. The unique active index makes
this a defensive rule rather than a normal state.

### Metering and Settlement

- Weighted tokens for a plan call are
  `(input_tokens + output_tokens) * max(1, token_weight)`. A zero weight is
  treated as 1 for subscription accounting; the provider weight remains the
  source of truth when positive.
- Before dispatch, reserve estimated
  `(prompt_tokens + output_budget) * max(1, token_weight)` against the open
  period. A reservation that does not fit follows the overage policy.
- On settlement, release the hold and add actual weighted tokens in the same
  transaction as the usage row. A post-call overrun is absorbed for that final
  call, matching the existing credit-overrun behavior; the next call is
  blocked or moves to overage.
- Included calls record `billing_source = 'subscription'`,
  `charged_micros = 0`, and the actual `included_weighted_tokens`. They still
  record upstream `cost_micros` for margin reporting.
- Credit-overage calls record `billing_source = 'credit'`, the subscription
  and period ids, and the normal charge. The credit hold is the admission
  control.
- A failed or cancelled call releases the subscription hold and records zero
  included tokens.
- Expired subscription holds are swept like credit holds; the open period’s
  `weighted_tokens_held` is decremented.
- Closing a period moves `weighted_tokens_used` into history. A new invoice
  opens a fresh period with the subscription’s included-token snapshot.

### Stripe Lifecycle

The existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are reused. No new
secret is required for subscriptions.

**Customer and checkout**

- `ensureStripeCustomer(user)` creates a Stripe customer once, stores
  `users.stripe_customer_id`, and reuses it. It passes `userId` in metadata.
- `POST /api/account/subscription` checks for an active/past-due subscription
  and an active plan, then creates a local `incomplete` subscription with the
  plan snapshot.
- Stripe Checkout uses `mode: "subscription"`, the Stripe customer, a dynamic
  recurring `price_data` line item, and metadata
  `{subscriptionId, planId, userId}` on both the session and
  `subscription_data`.
- `success_url` and `cancel_url` use `resolveAppOrigin`, never the request
  Host header.
- Checkout completion stores the Stripe subscription/customer ids but keeps
  the row `incomplete`; only a signed `invoice.paid` activates it.

**Webhook events**

- `checkout.session.completed` — top-up payment when `mode === "payment"`; the
  existing fulfillment path is unchanged. Subscription mode links the local
  subscription to the Stripe ids.
- `checkout.session.async_payment_succeeded` — top-up path as today.
- `customer.subscription.created` / `.updated` — reconcile status, period,
  `cancel_at_period_end`, and Stripe ids. Map `trialing` to `active`,
  `unpaid`/`incomplete` to `past_due` or `incomplete`, and
  `incomplete_expired` to `expired`.
- `invoice.paid` — record the invoice, activate the subscription, set the
  current period from the invoice lines, close any previous open period, open
  a new allowance period, and snapshot entitlements on first activation.
- `invoice.payment_failed` — record the failed invoice and set `past_due`.
- `customer.subscription.deleted` — set `canceled`, close the open period.
- Every event is recorded in `billing_events` by Stripe event id inside the
  transaction; replay returns the previous result without re-crediting or
  re-opening a period.
- A signed event with no matching local subscription is logged and ignored,
  not used to create an arbitrary plan. The local row is created at checkout.

**Cancellation and portal**

- Customer cancel calls Stripe with `cancel_at_period_end = true`; local
  `cancel_at_period_end` becomes 1. Access remains until period end.
- Resume clears the flag when Stripe still allows it.
- Immediate revocation is an admin action: cancel the Stripe subscription now,
  set `canceled`, close the open period.
- The Stripe Billing Portal session is returned for payment-method and invoice
  management when a Stripe customer exists; manual comps have no portal.

**Manual comps**

- Admin grant creates an active `manual` subscription with the plan snapshot,
  copies entitlements, and opens a period ending after one interval or a
  caller-supplied date.
- Extend opens a fresh period and moves the end date forward; it does not
  charge.
- Revoke sets `canceled` immediately and closes the period.
- Manual subscriptions never auto-renew.

### API Contract

**Public**

`GET /api/plans` returns active plans only:

```json
{
  "plans": [
    {
      "slug": "starter",
      "name": "Starter",
      "description": "Entry plan",
      "priceMicros": 5000000,
      "priceUsd": 5,
      "currency": "usd",
      "interval": "month",
      "includedWeightedTokens": 1000000,
      "overageMode": "block",
      "groups": [{ "slug": "starter", "label": "Starter" }],
      "modelCount": 8
    }
  ]
}
```

**Customer** (all require a customer session and same-origin mutations)

- `GET /api/account/subscription` — current or last subscription, plan
  snapshot, period usage, remaining allowance, entitlement count, cancel
  flag, and recent invoices.
- `POST /api/account/subscription` `{ "planSlug": "starter" }` — returns
  `{ "url": "https://checkout.stripe.com/..." }`; `409` when an active or
  past-due subscription exists; `409 plan_archived`; `503 stripe_unconfigured`.
- `POST /api/account/subscription/cancel` `{ "atPeriodEnd": true }` — default
  true; immediate cancellation is admin-only.
- `POST /api/account/subscription/resume` — clears a pending cancellation when
  Stripe permits it.
- `POST /api/account/subscription/portal` — returns a Billing Portal URL;
  `409 manual_subscription` when there is no Stripe customer.

**Admin** (admin session and same-origin)

- `GET /api/admin/plans` — all plans with inclusion counts and subscription
  counts.
- `POST /api/admin/plans` — create a draft or active plan with groups/models.
- `PATCH /api/admin/plans` — edit name, description, price, interval,
  allowance, overage policy, sort order, status, and inclusions.
- `DELETE /api/admin/plans` `{ "id": "plan_..." }` — only unused
  draft/archived plans; `409 plan_in_use` otherwise.
- `GET /api/admin/subscriptions` — customer, plan snapshot, source, status,
  period, usage, entitlement count, cancel flag, latest invoice.
- `POST /api/admin/subscriptions` — actions:
  - `{ "action": "grant", "userId": "...", "planId": "...", "periodEnd"?: "..." }`
  - `{ "action": "extend", "id": "...", "periodEnd"?: "..." }`
  - `{ "action": "revoke", "id": "..." }`
  - `{ "action": "sync", "id": "..." }` — fetch Stripe and reconcile.
  - `{ "action": "refresh_entitlements", "id": "..." }` — replace the
    snapshot from the current plan, explicitly.
- `GET /api/admin/subscription-invoices` — paged invoice list; or include the
  latest invoices in the subscriptions response and a count-only summary.

**External model API**

`/v1/models` keeps the existing `group` value and adds
`requires_subscription: boolean` (true for the `subscription` billing mode).
`/api/models` exposes the same additive boolean. Existing clients are not
broken.

### UI

- Public `/plans` page with active plan cards: price, interval, included
  groups, model count, allowance, overage policy, and a CTA. Signed-out CTA
  goes to login and returns to plans; signed-in CTA starts checkout. If no
  active plan exists, the page says plans are not available rather than
  showing an empty purchase flow.
- Account page adds a Subscription card: plan name, status, renewal date,
  allowance bar, overage policy, manage/cancel/resume, and invoice history.
  The top-up card remains for credit.
- Admin navigation adds **Plans** and **Subscriptions**.
- Admin Plans page lists draft/active/archived plans with price, allowance,
  model count, subscriber count, edit, archive, and delete actions. The editor
  selects groups from the FID-007 group list and optional individual models;
  it shows a warning when an included model has non-zero upstream cost and
  when an active plan has no inclusions.
- Admin Subscriptions page lists customer, plan, status, source, period,
  usage, entitlement count, cancel flag, and actions: grant, extend, revoke,
  sync, refresh entitlements. It shows invoices and a warning when a
  subscription has zero entitlements.
- Provider card labels its existing numbers **Upstream subscription** so they
  cannot be confused with a customer plan.
- `app/models/page.tsx` copy distinguishes “plan-only” models from free and
  paid models.
- `components/account/auth-screen.tsx` removes “No subscription or minimum
  spend” and states that prepaid credit and optional plans are available.
- The landing page shows plan cards only when active plans exist. It must not
  advertise a subscription product before one is configured.

### Migration and Rollback

The migration is additive and depends on FID-007’s `model_groups` table:

1. Add `users.stripe_customer_id`.
2. Add usage snapshot columns.
3. Create plans, plan inclusions, subscriptions, subscription snapshots,
   periods, holds, invoices, and billing events.
4. Add indexes and the one-open-period/one-active-subscription partial
   indexes.
5. Do not create plans automatically. The operator creates them.
6. Existing `subscription`-labeled rows keep their group. Until a plan covers
   them, a call returns `403 subscription_required` instead of the current
   `503 model_unpriced`. Existing paid and free calls are unchanged.
7. Historical usage rows default to `billing_source = 'credit'`; no ledger or
   usage row is rewritten.

Rollback is a code rollback. The new tables and columns are ignored by the
previous code. No subscription, invoice, credit, key, or usage row is deleted.
A production backup is required before the migration.

### Steps

1. Add the schema, indexes, and additive migration in `lib/db.ts`.
2. Add pure plan validation, inclusion, entitlement, allowance, and overage
   helpers in `lib/plans.ts`.
3. Add `lib/store/plans.ts` with CRUD, inclusion validation, counts, and
   active-plan listing.
4. Add `lib/store/subscriptions.ts` with local subscription snapshots,
   entitlement expansion, periods, holds, invoices, manual grants, extend,
   revoke, refresh, and expiry.
5. Add `lib/stripe-subscriptions.ts` with customer reuse, subscription
   checkout, portal, cancel, sync, and event reconciliation.
6. Refactor the Stripe webhook into top-up and subscription dispatchers with
   `billing_events` idempotency; preserve the existing top-up receipt.
7. Add entitlement resolution, subscription holds, and `requires_subscription`
   behavior to `lib/gateway.ts`.
8. Add subscription metering and settlement fields to
   `lib/gateway-settle.ts` and `lib/store/usage.ts`.
9. Add customer subscription routes and their same-origin/rate-limit guards.
10. Add admin plan and subscription routes with validation and transactional
    mutations.
11. Add public `/plans`, customer subscription card, and admin Plans and
    Subscriptions pages.
12. Add `requires_subscription` to model payloads and update copy that
    currently equates subscription with an unavailable label.
13. Add `tests/plans.test.mjs` for validation, entitlement selection, allowance
    math, overage policy, status transitions, and compatibility fields.
14. Update README, AGENTS vocabulary, knowledge, API docs, and SCOPE.
15. Run gates and a disposable-database HTTP receipt covering plan CRUD,
    checkout metadata, signed webhook activation, included usage, exhausted
    block, exhausted credit overage, no-plan 403, plan edit/snapshot
    stability, manual grant/cancel, and top-up regression.

### Verification

The pure test file is `tests/plans.test.mjs`. It covers:

- slug, name, price, interval, status, inclusion, and overage validation;
- free-group rejection and required-inclusion activation;
- entitlement selection by model id and plan order;
- allowance reservation, exhaustion, and overage decisions;
- `block` vs `credit` pricing with overage markup;
- `past_due`, `canceled`, `expired`, and cancel-at-period-end behavior;
- additive model fields preserving `access` and `group`.

The disposable-database HTTP receipt proves:

- admin CRUD of a plan with groups and individual models;
- public `/api/plans` excludes drafts and archived plans;
- a customer can start a subscription checkout and cannot start a second while
  active;
- a locally signed `invoice.paid` activates exactly once and replay is a no-op;
- included calls return 200 with no credit debit and increment the period;
- an exhausted `block` plan returns 402; an exhausted `credit` plan debits
  credit with the plan markup;
- a subscription-group model with no plan returns 403 `subscription_required`;
- plan edits do not change an existing snapshot; explicit refresh does;
- manual grant, extend, revoke, and expiry work without Stripe;
- a top-up webhook still credits exactly once and is unaffected by subscription
  events;
- admin/customer mutations reject foreign origins and unauthenticated calls.

Real Stripe Checkout, a Stripe-delivered recurring invoice, and a real paid
subscription are not part of the local receipt because no test credentials or
funded Stripe test account are present. That is registered as B4, not claimed
as verified.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/plans.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

`npm run verify` exits 0: **99/99 tests**, quality PASS over **186 files**,
**51-route** production build. Tests include `tests/plans.test.mjs` (10 cases:
validation, entitlement expansion, allowance/exhaustion, markup, snapshots,
month-end intervals, Stripe status mapping).

Disposable-database HTTP receipt, through the real Next routes and gateway with
a local OpenAI-protocol mock upstream:

- admin plan create for active plans A/B/C and a draft; `/api/plans` listed the
  three active plans and excluded the draft;
- manual grant produced included calls with `charged_micros=0`,
  `billing_source='subscription'`, the subscription/period ids, and 6 actual
  included weighted tokens;
- editing plan A (price $5→$6, paid group→subscription group) left the existing
  23-model snapshot and `price_micros_snapshot=5000000` unchanged; a call to the
  moved model returned `403 subscription_required`; explicit refresh replaced
  the snapshot with 24 current models and the call succeeded;
- a 1-token `block` plan returned `402 subscription_limit_reached`; a 1-token
  `credit` plan with 5000-bps markup charged **9 micros** with
  `billing_source='credit'` and recorded the subscription/period;
- duplicate checkout for an active subscriber returned `409`; foreign-Origin
  customer and admin mutations returned `403`; plan deletion with subscribers
  returned `409`, and an unused draft deleted successfully;
- manual extend and immediate revoke worked; a revoked subscription's
  subscription-group call returned `403`;
- a locally signed `invoice.paid` activated an incomplete subscription exactly
  once, opened one period, and a replay returned `{ replay: true }` without a
  second period; the activated customer's included call succeeded;
- a signed top-up checkout event credited exactly **$5.00** once;
- `/plans`, `/account`, `/admin/plans`, and `/admin/subscriptions` returned
  `200` with valid sessions.

Real Stripe Checkout, a Stripe-delivered recurring invoice, and a funded live
subscription are not verified (B4). The local receipt used test-signed events
and no Stripe network call. Live provider inference used only the local mock;
no paid upstream account was charged.

The paid-invoice guard is shared: `invoiceStatus` in
`lib/store/subscription-rows.ts` serves both `activateSubscription` and
`markSubscriptionPastDue`, so an activation replay and a failure replay cannot
diverge. Extracting it also kept `lib/store/subscriptions.ts` at 393 lines,
under the 400-line quality ceiling. The disposable receipt above was re-run
on a fresh snapshot after that extraction and returned identical results:
23 snapshot entitlements growing to 24 on refresh, 402 on the exhausted
`block` plan, 9 micros on the 5000-bps `credit` overage, one period after the
signed `invoice.paid` replay, and one $5.00 top-up credit.

## Perfection Loop

### Loop 1 — RED

- **RED:** “Subscription” is a derived catalog label. There is no plan,
  entitlement, allowance, recurring invoice, cancellation, admin plan page, or
  customer plan page. The gateway sends subscription rows to the paid path;
  the Stripe webhook handles top-ups only; the provider card’s subscription
  fields are upstream capacity, not customer plans.
- **GREEN:** Add plans, plan inclusions, subscription snapshots, entitlement
  expansion, periods, holds, invoices, Stripe recurring checkout and webhook
  reconciliation, gateway entitlement checks, customer and admin surfaces,
  and tests. Keep top-ups and free/paid behavior intact.
- **AUDIT:** Code evidence above: `lib/store/shared.ts:99-105`,
  `lib/gateway.ts:63`, `lib/gateway.ts:183-190`, `lib/db.ts:272-284`,
  `app/api/account/topup/route.ts:66-92`,
  `app/api/webhooks/stripe/route.ts:10-13`,
  `components/admin/admin-nav.tsx:7-13`. The baseline gates are green.
- **ADVERSARIAL:** Checkout completion is not payment; only `invoice.paid`
  activates. Replays must not extend periods. A plan edit must not silently
  change a subscriber. A failed webhook must not leave a paid customer
  unentitled; the admin sync action can reconcile. An in-flight allowance
  overrun must not double-charge. A signed event with an unknown local
  subscription must not create a plan.
- **CHANGE DELTA:** Baseline authoring; no prior version exists, so no
  percentage applies.

### Missed Questions

1. **Is a subscription a plan or a model group?** A plan is the purchasable
   product. A group is catalog metadata. A plan includes one or more groups
   and/or individual models; group membership alone does not grant access.
2. **What exactly does the customer buy?** A snapshot of the plan name, price,
   interval, included weighted-token allowance, overage policy, and exact model
   ids at activation. The plan can be edited later without changing that
   purchase.
3. **Can a customer have multiple plans?** No. One active or past-due
   subscription is allowed. This keeps entitlement resolution deterministic and
   avoids stacking allowances. A future multi-plan design would need explicit
   priority rules and is not part of this contract.
4. **What happens when the allowance runs out?** The plan chooses `block` or
   `credit`. `block` returns 402; `credit` uses the normal prepaid credit path
   with the plan’s overage markup. There is no automatic top-up.
5. **What happens to an in-flight call that crosses the allowance?** It
   settles; the overrun is absorbed for that call and the next call follows
   the overage policy. This matches the existing credit-overrun behavior and
   avoids retroactive billing.
6. **What happens if a payment fails?** The subscription becomes `past_due`
   and included calls are blocked with `402 subscription_past_due`. A paid
   invoice reactivates it and opens a new period.
7. **What happens on cancellation?** Customer cancellation is at period end;
   access remains until the period ends. Admin revocation is immediate and
   closes the period.
8. **What happens when a plan is archived or deleted?** Archive blocks new
   checkouts but leaves existing subscribers and renewals alone. Delete is
   allowed only for unused draft/archived plans; otherwise the operator must
   archive.
9. **Can the operator give a free subscription?** Yes, a manual grant. It is
   marked `manual`, has no Stripe id, lasts one period, does not auto-renew,
   and can be extended or revoked.
10. **Does a plan change the model’s published price?** No. The plan price is
    the subscription price; included usage costs zero; overage uses the model
    sell price plus the plan’s overage markup. The public model price remains
    the list price for credit customers.
11. **Does the provider’s upstream subscription quota become a customer
    plan?** No. It remains owner capacity. The admin UI labels it “Upstream
    subscription”; it does not create or limit customer plans.
12. **What about taxes, refunds, and dunning?** Stripe collects payment and
    handles its configured tax/dunning behavior. Local code records invoices
    and status; it does not compute tax or issue refunds. An admin can revoke
    access, but a refund remains a Stripe-dashboard operation.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** Pending; no commit exists for this FID yet.
- [x] **File:line ranges:**
  `lib/schema/subscriptions.ts:9` (additive tables/indexes);
  `lib/plans.ts` (validation, entitlements, allowance, markup);
  `lib/store/plans.ts:134` (plan CRUD);
  `lib/store/subscription-rows.ts` (`invoiceStatus` replay guard);
  `lib/store/subscriptions.ts:223` (invoice activation);
  `lib/store/subscription-access.ts:111` (gateway decision and holds);
  `lib/store/subscription-admin.ts:47` (manual grant);
  `lib/gateway.ts:211` (single-source routing);
  `app/api/webhooks/stripe/route.ts:278` (signed dispatch);
  `components/account/subscription-card.tsx:26` (customer control);
  `components/admin/plans-panel.tsx` and
  `components/admin/subscriptions-panel.tsx` (admin control).
- [x] **Gate output:** `npm run verify` exit 0; 99/99 tests; quality PASS over
  186 files; 51-route build. Full disposable receipt above.
- [x] **Reproducibility:** `tests/plans.test.mjs` runs without a database; the
  HTTP receipt used a disposable copy of the local database, a mock
  OpenAI-protocol upstream, and Stripe test-signed events with no real network
  payment.
- [x] **Step statuses:** All 15 steps are implemented and verified; only the
  commit SHA is outstanding.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist in the current tree.
- [x] Implementation matches the Proposed Solution.
- [x] `lint`, `typecheck`, `test`, `quality`, and `build` pass; `verify` exits 0.
- [x] Production call-graph evidence is present: route → guard/store →
  gateway → subscription access → period/hold → usage settlement.
- [x] FID status reflects the actual implementation state: `verified`; closure
  waits for the commit SHA.

### Loop 2 — Independent audit and self-correction

- **RED:** The first design pointed subscriptions at the live plan, so an
  operator edit would silently change what a customer bought. It also risked
  activating on checkout completion without a paid invoice, and it let a
  single allowance period serve multiple renewals.
- **GREEN:** The subscription snapshots its plan values and model ids; only a
  signed `invoice.paid` activates; each invoice opens a fresh period; manual
  grants are explicitly one-period; entitlement refresh is an explicit admin
  action.
- **AUDIT:** The design was checked against the current `accessFor`,
  `isFreeCall`, unpriced path, `topups` fulfillment, Stripe webhook, admin
  navigation, and account page. Each old behavior has a named replacement or a
  preserved compatibility path.
- **ADVERSARIAL:** The remaining hard cases are Stripe event ordering, webhook
  delivery failure, and an operator editing a plan while a checkout is in
  flight. The local snapshot at checkout and the signed `invoice.paid`
  activation close the first two; the local subscription row is created before
  the Stripe session, so the snapshot is fixed even if the plan changes before
  payment.
- **CHANGE DELTA:** Baseline reconciliation; no measured percentage is claimed
  for a record without a prior version.

### Loop 3 — Final convergence

- **RED:** Remaining pre-implementation risks: one-active-subscription
  enforcement under concurrent checkouts, allowance hold races, invoice replay,
  plan deletion with snapshots, and real Stripe verification.
- **GREEN:** The partial unique indexes, subscription holds, billing-event
  idempotency, `plan_in_use` guard, and explicit B4 limitation address them.
  The migration is additive and no historical row is rewritten.
- **AUDIT:** The plan names every write path, every gateway branch, every
  Stripe event, every admin/customer mutation, the snapshot boundary, the
  top-up compatibility path, and the tests that will prove them.
- **ADVERSARIAL:** The strongest remaining challenge is not code but economics:
  a plan can include a cost-bearing model with a small allowance and a low
  price. The admin editor surfaces cost, allowance coverage, and overage
  markup; the operator owns the decision.
- **CHANGE DELTA:** The record was authored in one pass; no prior draft exists
  to measure. Convergence is based on the resolved questions and the complete
  write-path audit, not a claimed percentage.

## Resolution

- **Closed Date:** none. Status is `verified`; closure awaits the commit SHA.
- **Fix Description:** Real customer subscription plans with operator-authored
  pricing, included groups/models, weighted-token allowances, entitlement
  snapshots, Stripe recurring billing, overage policy, admin grants and
  revocations, customer self-service, and gateway enforcement.
- **Tests Added:** `tests/plans.test.mjs` with 10 cases.
- **Verification Evidence:** `npm run verify` exit 0 (99/99 tests, quality PASS
  over 186 files, 51-route build) plus the disposable HTTP receipt above.
  Real Stripe checkout/recurring delivery and funded live inference are B4.
- **Archived:** not archived. A verified-but-uncommitted FID stays in
  `dev/fids/` until the commit exists.

## Lessons Learned

A catalog label is not an entitlement. A real subscription needs a purchasable
plan, a snapshot of what the customer bought, a metered allowance, a recurring
payment lifecycle, and a deterministic gateway decision. The purchase must be
immutable enough that an operator edit cannot silently change it, while the
operator still needs explicit controls to grant, extend, revoke, and refresh.
Payment confirmation belongs to the signed invoice, not the checkout redirect;
and plan-only catalog rows must fail with `subscription_required`, not an
unpriced 503 that looks like a catalog bug.
