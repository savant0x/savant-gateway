# FID: Subscription Revenue Analytics

**Filename:** `FID-2026-1029-011-subscription-revenue-analytics.md`
**ID:** FID-2026-1029-011
**Severity:** medium
**Status:** closed
**Created:** 2026-10-29 14:20
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The admin revenue surfaces count only `usage_events.charged_micros`, the credit
debited when a request settles. Subscription plan payments are written to
`subscription_invoices` with `status = 'paid'` and are never aggregated, so the
overview "30d revenue" card, the analytics "Revenue" card, the daily money
chart, and every margin figure omit plan revenue. Included subscription calls
record `charged_micros = 0` while still recording `cost_micros`, so the current
margin also understates the upstream cost of subscription usage. This FID adds
a separate, honestly labelled plan-revenue stream, a credit-versus-plan split,
active/past-due/canceling/manual subscriber counts, monthly recurring revenue
(MRR), a per-plan revenue table, and the chart and overview updates that consume
them. Billing behavior, gateway routing, invoice recording, and Stripe handling
do not change.

## Environment

- **OS:** Windows (win32)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`
- **Tool Versions:** Next.js 16.4.3, React 19.3.0, better-sqlite3 13.0.3
- **Commit/State:** `2f794c0` on `main`; clean working tree except untracked
  `.savant/`, `debug/`, and `dev/audit/`.

## Detailed Description

### Problem

Plan invoice payments are invisible in every admin revenue figure. The only
aggregation over `subscription_invoices` is the per-subscription invoice list
in `lib/store/subscription-rows.ts`; no query sums paid invoices for a range or
for a plan. The operator cannot answer "how much plan revenue did we collect
this month", "what is MRR", "how many subscribers are active", or "which plan
earns the most" from the product.

### Expected Behavior

- The analytics range shows credit revenue (settled usage) and plan revenue
  (paid invoices) separately, plus their total.
- The operator sees active, past-due, canceling, and manual subscriber counts.
- MRR is shown as a monthly-normalized run-rate with an explicit exclusion
  policy.
- A per-plan table shows paid invoice revenue in range, paid invoice count,
  current active/past-due subscribers, and MRR contribution.
- Every label states the basis: credit revenue is recognized at settlement;
  plan revenue is recognized at `paid_at`; top-ups are prepaid credit and are
  not revenue at purchase time.
- Existing credit-only views remain correct and are relabelled as credit-only.

### Root Cause

`getAnalyticsData` in `lib/store/analytics.ts` queries only `usage_events`.
`AnalyticsTotals` has no plan-revenue, subscriber, or MRR field, and no admin
component reads `subscription_invoices` in aggregate. The invoice table was
added by FID-008 for per-customer display and idempotency, not for reporting.

### Evidence

```text
lib/store/analytics.ts:74-88
  SELECT ... SUM(charged_micros) ... SUM(cost_micros)
  FROM usage_events WHERE datetime(created_at) >= datetime('now', ?)

lib/store/analytics.ts:137-152
  marginMicros: totalsRow.charged_micros - totalsRow.cost_micros

app/admin/(panel)/analytics/page.tsx:85-90
  <StatCard detail="charged to tenant credit" label="Revenue"
    value={formatMicros(totals.chargedMicros)} />

components/admin/admin-panel.tsx:101-105
  <StatCard label="30d revenue"
    value={formatMicros(analytics.totals.chargedMicros)} />

lib/schema/subscriptions.ts:141-156
  CREATE TABLE subscription_invoices (
    amount_micros INTEGER NOT NULL, status TEXT NOT NULL,
    paid_at TEXT, ...)
  CREATE INDEX subscription_invoices_sub_idx
    ON subscription_invoices(subscription_id, created_at)

lib/store/subscriptions.ts:192-221
  INSERT INTO subscription_invoices ... ON CONFLICT(provider_invoice_id)
```

A repo-wide search for an aggregate over `subscription_invoices` finds only
`subscription-rows.ts:100` (one subscription's invoices) and
`subscription-rows.ts:120` (idempotency status). There is no range sum.

## Impact Assessment

### Affected Components

- `lib/store/analytics.ts` — aggregation entry point.
- `lib/types.ts` — analytics shapes.
- `lib/schema/subscriptions.ts` — additive invoice index.
- `app/admin/(panel)/analytics/page.tsx` — cards, empty state, footnotes.
- `components/admin/analytics-chart.tsx` — daily series.
- `components/admin/analytics-models.tsx` — credit-revenue relabel.
- `components/admin/admin-panel.tsx` — overview revenue and money card.
- New `components/admin/analytics-plans.tsx` — per-plan table.
- New `lib/analytics.ts` and `lib/revenue.ts` — testable query and money math.
- `tests/analytics.test.mjs`, `tests/revenue.test.mjs` — coverage.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The risk is misleading operator money data, not a billing change. The mitigation
is to keep credit and plan revenue on separate fields, label both bases, and
test the aggregation against a real in-memory schema.

## Proposed Solution

### Approach

Move the analytics query layer out of the `server-only` store wrapper into
`lib/analytics.ts`, which accepts a `DatabaseHandle` and an injectable `now`.
This makes the SQL executable by Node tests without changing the production
call graph: `lib/store/analytics.ts` becomes a thin `server-only` wrapper over
the singleton `db`. Put the recurring-revenue math in `lib/revenue.ts` so the
year-to-month normalization is unit tested independently of SQL. Keep
`chargedMicros` as the credit accrual field and add `planRevenueMicros`,
`totalRevenueMicros`, `totalMarginMicros`, subscriber counts, and MRR. Never
merge plan cash into the existing `chargedMicros` field.

Revenue basis:

- **Credit revenue** = `SUM(usage_events.charged_micros)` in range, recognized
  at settlement. Includes subscription overage charged to credit. Included plan
  calls are zero and do not appear here.
- **Plan revenue** = `SUM(subscription_invoices.amount_micros)` where
  `status = 'paid'` and `currency = 'usd'`, dated by
  `COALESCE(paid_at, created_at)`.
- **Total recorded revenue** = credit + plan.
- **Cost** = `SUM(usage_events.cost_micros)` in range, including included plan
  usage.
- **Credit margin** = credit revenue − cost. It can be negative when included
  plan usage is a large share of cost; this is honest and is labelled.
- **Total margin** = total revenue − cost. A yearly plan paid in one month and
  consumed over twelve months makes a single range's total margin high; the UI
  states that plan revenue is cash-basis and cost is usage-basis.

MRR policy:

- Active = `subscriptions.status = 'active'`.
- Past due is counted separately and excluded from MRR.
- Manual grants are comps, produce no invoice, and are excluded from MRR; they
  are counted separately so the operator can see them.
- Active Stripe subscriptions with `cancel_at_period_end = 1` still pay through
  the current period but will not renew; they are excluded from the forward
  run-rate and counted separately.
- Monthly price is used as-is; yearly price is divided by 12 and rounded to the
  nearest micro-dollar.
- MRR is a current point-in-time figure, not range-scoped. The per-plan table
  labels invoice revenue as range-scoped and subscribers/MRR as current.

Per-plan aggregation:

- Group paid invoices by `subscriptions.plan_id` and
  `subscriptions.interval_snapshot`.
- Use the live `plans.name` when the plan row exists; fall back to
  `plan_name_snapshot` so an archived or manually repaired row still reports.
- Merge current active/past-due subscriptions on the same plan/interval key.
- Include plans that have only active manual subscribers; their revenue and
  invoice count are zero and their MRR is zero.

### Steps

1. Add `lib/revenue.ts` with `monthlyRecurringMicros(priceMicros, interval)`
   and `grossMarginBps(revenueMicros, costMicros)`; both pure and total.
2. Add `lib/analytics.ts` with `ANALYTICS_RANGES`,
   `normalizeAnalyticsRange`, `dayKeys`, and
   `readAnalyticsData(database, rangeDays, now = new Date())`. It owns the
   usage totals/points/models queries plus paid-invoice totals, paid-invoice
   daily points, and current subscription rows. It imports no `server-only`.
3. Replace the body of `lib/store/analytics.ts` with a `server-only` wrapper
   that re-exports the range helpers and calls `readAnalyticsData(db, range)`.
4. Extend `lib/types.ts`: add `planRevenueMicros` to `AnalyticsPoint`; add
   `planRevenueMicros`, `totalRevenueMicros`, `paidInvoiceCount`,
   `totalMarginMicros`, `activeSubscribers`, `pastDueSubscribers`,
   `cancelingSubscribers`, `manualSubscribers`, and `mrrMicros` to
   `AnalyticsTotals`; add `AnalyticsPlan`; add `byPlan` to `AnalyticsData`.
5. Add an additive
   `subscription_invoices_status_idx (status, paid_at)` index to
   `lib/schema/subscriptions.ts`.
6. Add `components/admin/analytics-plans.tsx` with the per-plan table and an
   explicit MRR exclusion note.
7. Update `app/admin/(panel)/analytics/page.tsx`: total revenue, credit
   revenue, plan revenue, upstream cost, gross profit, MRR, active subscribers,
   the error/request/token/latency cards, the plans table, an empty state that
   also considers plan revenue, and four footnotes covering revenue basis, plan
   revenue, cost, and estimates.
8. Update `components/admin/analytics-chart.tsx` to plot credit revenue, plan
   revenue, and cost as three grouped bars with a matching legend and tooltip.
9. Relabel `components/admin/analytics-models.tsx` to "Top models by credit
   revenue" and "Credit revenue", with a note that plan invoice cash is not
   attributable to a model.
10. Update `components/admin/admin-panel.tsx`: the "30d revenue" card becomes
    total revenue with a credit/plan split, and the "30-day money" card shows
    total revenue, plan revenue, cost, and gross margin.
11. Add `tests/revenue.test.mjs` for the pure math and
    `tests/analytics.test.mjs` for the in-memory SQL aggregation.
12. Run the gates; record a disposable-database `/admin/analytics` render
    receipt; close and archive this FID; update `CHANGELOG.md`, `knowledge.md`,
    and `SCOPE.md`.

### Verification

- `tests/revenue.test.mjs` proves monthly normalization, yearly division,
  zero/negative/non-finite clamping, and margin BPS behavior.
- `tests/analytics.test.mjs` creates an in-memory SQLite database with the real
  `subscriptionSchema`, seeds usage, plans, subscriptions, paid/failed/void/
  non-USD/out-of-range invoices, and asserts every new total, series point,
  per-plan row, and ordering.
- A disposable database is seeded, the app is booted, and `/admin/analytics` is
  fetched with an admin session; the rendered HTML must contain the seeded
  plan revenue, MRR, and subscriber counts.
- Call-graph grep confirms every new field is consumed by a production
  component or page.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/revenue.test.mjs
- gate: test tests/analytics.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-29, committed as `ba233c6`
- lint: `npm run lint` exit 0, zero errors, zero warnings
- typecheck: `npm run typecheck` exit 0
- test tests/revenue.test.mjs: 5 passed, 0 failed
- test tests/analytics.test.mjs: 3 passed, 0 failed
- test (full suite): `npm test` 107 passed, 0 failed, 0 skipped
- quality: PASS (400-line ceiling, 189 files scanned)
- build: `npm run build` exit 0, compiled successfully, 51 routes
- verify: `npm run verify` exit 0
- render receipt: disposable-database production build, 21 rendered-value
  checks plus the auth checks below, all PASS
- call graph: `readAnalyticsData` is called by `lib/store/analytics.ts:17`,
  which is reached from `app/admin/(panel)/analytics/page.tsx:43` and
  `app/admin/(panel)/page.tsx:15`; `totalRevenueMicros`, `planRevenueMicros`,
  `mrrMicros`, `activeSubscribers`, and `byPlan` are consumed by the analytics
  page, the overview panel, the chart, and `components/admin/analytics-plans.tsx`

## Perfection Loop

### Loop 1 — RED

- **RED:** Plan revenue is absent from every admin revenue figure; margin omits
  the fact that included subscription usage has cost and zero charge; there is
  no subscriber count or MRR; the per-model table conflates credit revenue with
  total revenue.
- **GREEN:** Separate credit and plan fields; add total revenue and total
  margin; add subscriber/MRR aggregates and a per-plan table; relabel existing
  credit-only views; document cash-versus-usage basis.
- **AUDIT:** Every claim cites the current file and line in the Evidence
  section. The new query layer is reachable from `getAnalyticsData`, which is
  called by `app/admin/(panel)/page.tsx:15` and
  `app/admin/(panel)/analytics/page.tsx:43`.
- **ADVERSARIAL:** Does counting paid invoices plus credit charges double count?
  No: included subscription calls record `charged_micros = 0`, overage calls
  record credit, and invoices are a separate cash row. Does the invoice upsert
  duplicate a replayed event? No: `provider_invoice_id` is unique and the
  insert uses `ON CONFLICT ... DO UPDATE`.
- **CHANGE DELTA:** 100% (new FID).

### Missed Questions

1. **Do top-ups count as revenue?** No. A top-up is prepaid credit, a liability
   until usage settles. Counting top-ups plus usage would double count. The
   analytics footnote states this.
2. **Do failed, open, or void invoices count?** No. Only `status = 'paid'`.
3. **Should a yearly plan be recognized monthly?** Plan revenue is cash at
   `paid_at`; MRR is a normalized run-rate and is reported separately. The UI
   states the difference.
4. **Do manual comps count in MRR?** No. They produce no invoice and do not
   renew. They are counted separately.
5. **Do canceling subscriptions count in MRR?** No. They still pay through the
   current period but will not renew. They are counted separately.
6. **Do past-due subscriptions count in MRR?** No. They are at risk and counted
   separately.
7. **What if `paid_at` is null on a paid row?** The range filter and day bucket
   use `COALESCE(paid_at, created_at)`. The webhook always supplies a paid date,
   but the fallback keeps legacy or manually seeded rows reportable.
8. **What about non-USD invoices?** Plans are USD-only today; the aggregate
   filters `currency = 'usd'` rather than summing incomparable currencies. A
   future multi-currency feature must add conversion, not silently sum.
9. **Should subscription-sourced usage cost be excluded from margin?** No. It is
   real upstream cost. Excluding it would hide the cost of included plans.
   Total margin includes it and the UI warns about the cash/usage mismatch.
10. **Should per-plan revenue use the current plan name or the purchase
    snapshot?** The live name when the plan exists, because the operator is
    looking at the current catalog; the snapshot is the fallback so an archived
    or repaired row still reports.
11. **What if two plans share a name?** The `plans.name` column is `UNIQUE
    COLLATE NOCASE`, so they cannot. Grouping is by `plan_id`, not name.
12. **What if a plan has changed interval?** Subscribers keep their snapshot, so
    the table can show a monthly and a yearly cohort for the same plan. This is
    honest and is grouped by `plan_id` plus `interval_snapshot`.
13. **Does this change any charge, invoice, or entitlement?** No. Every change is
    read-only aggregation or display.
14. **Will the chart scale with three series?** The bars are grouped, not
    stacked, and the maximum is taken across all three. The empty state checks
    all three.
15. **Does `lib/analytics.ts` create a client/server boundary problem?** No. It
    imports types, the pure `lib/revenue.ts` helper, and a type-only database
    handle; the `server-only` marker stays on `lib/store/analytics.ts`, which
    remains the only production entry point.

### Loop 2 — Independent audit and self-correction

- **RED:** Remaining issues after the first pass: the per-model table still says
  "Revenue" and could be read as total revenue; the admin overview "30-day
  money" card has no plan figure; the analytics empty state only checks
  requests; the types file is close to the 400-line ceiling.
- **GREEN:** Relabel the per-model table to credit revenue; add plan revenue to
  the overview money card; make the empty state check both requests and plan
  revenue; keep the type additions under roughly 25 lines by using terse field
  declarations and one new type.
- **AUDIT:** `wc -l` on `lib/types.ts` after the edit must remain under 400;
  `npm run quality` must pass. The chart and page must consume every new field.
- **ADVERSARIAL:** Could a refunded invoice remain counted? Yes. The schema has
  no refund or credit-note table, so a paid invoice stays in recorded cash after
  a refund. This is a documented limitation, not a silent claim of net revenue.
- **CHANGE DELTA:** 8% (corrections to labels, empty state, and notes).

### Loop 3 — Final convergence

- **RED:** Final risks: the in-memory test could drift from the production
  schema; the page could render a zero MRR when data exists; the SQL range
  boundary could exclude an invoice paid exactly at the cutoff.
- **GREEN:** The test calls the real `subscriptionSchema` rather than a
  hand-written invoice table; the page uses explicit `—` for a missing MRR
  only when there are no subscribers; the SQL uses the same `>=` boundary as
  the existing usage query.
- **AUDIT:** Fresh `npm run verify`; the in-memory assertions cover the exact
  totals; the disposable-database render contains the seeded values.
- **ADVERSARIAL:** A yearly plan paid on the range boundary can appear in one
  range and not the next; that is normal cash-basis behavior and the footnote
  says so.
- **CHANGE DELTA:** 3%.

### Loop 4 — Implementation, gates, and render receipt

- **GREEN:** Implemented the plan with these corrections:
  - The standalone `InvoiceTotalsRow` query was removed. `planRevenueMicros` and
    `paidInvoiceCount` are summed from the same per-plan rows the table renders,
    so the card and the table cannot disagree.
  - `readPlanRows` now returns the plan map plus the active, past-due, canceling,
    manual, and MRR counters from one subscription pass; total MRR is not
    recomputed from the rounded per-plan values.
  - `lib/schema/subscriptions.ts` imports `./columns.ts` with an explicit
    extension. The production schema is unchanged; the extension is what lets
    Node's type stripping import the real schema in `tests/analytics.test.mjs`.
  - `lib/analytics.ts` uses `Array.from(map.values())` because the project
    targets ES5; spreading a `MapIterator` fails `tsc`.
  - `dayKeys` stays private to `lib/analytics.ts`; only `readAnalyticsData`
    needs it.
- **AUDIT:** `npm run verify` exit 0: lint clean, typecheck clean, 107/107 tests
  pass, quality PASS over 189 files, build exit 0 with 51 routes. The focused
  suites pass 8/8 (`tests/revenue.test.mjs` 5, `tests/analytics.test.mjs` 3).
  The call-graph grep above shows production consumers for every new field.
- **RENDER RECEIPT:** A disposable database was created by the production app
  under `DB_PATH`, seeded through a second SQLite connection with 2 usage rows,
  3 plans, 5 subscriptions, 7 invoices, and 2 models, then fetched with an admin
  session. The rendered `/admin/analytics` contained `$163.00` total revenue,
  `$3.00` credit revenue, `$160.00` plan revenue, `$1.50` cost, `+$161.50` total
  margin, `$20.00` MRR, `1 canceling`, `1 past due`, `1 manual comps excluded`,
  and plan rows `Annual` `$120.00`, `Starter` `$40.00`, `Comp` `$0.00`. The
  rendered `/admin` contained `30d revenue`, `$163.00`, `$160.00`, and
  `+$161.50`. An anonymous `/admin/analytics` request returned `307` to
  `/admin/login`; a wrong password returned `401`; the correct password set
  `sg_admin` and the authenticated page returned `200`.
- **ADVERSARIAL:** The receipt excludes a 45-day-old invoice, a failed invoice,
  a void invoice, and a EUR invoice; the card still shows `$160.00`, proving the
  range, status, and currency filters. It seeds a manual comp and a canceling
  subscription; MRR is `$20.00`, not `$50.00` or `$70.00`, proving the exclusion
  policy. It seeds included usage with `$0` charge and `$0.50` cost, so credit
  margin and total margin stay distinct.
- **CHANGE DELTA:** 12% from the converged FID (query consolidation, schema
  import extension, ES5 iteration, and receipt evidence).

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Admin revenue now separates credit revenue from paid plan
  invoices, adds total revenue and total margin, exposes paid-invoice count,
  subscriber counts, MRR, and a per-plan table, plots credit/plan/cost as three
  chart series, and relabels the top-models table as credit-only. The query
  layer moved to `lib/analytics.ts` so the real SQL runs in Node tests; the pure
  run-rate and margin math lives in `lib/revenue.ts`. Billing, routing, invoice
  recording, and Stripe handling are unchanged.
- **Tests Added:** `tests/revenue.test.mjs` (5 tests) and
  `tests/analytics.test.mjs` (3 tests, seeded against the real subscription
  schema). Full suite 107/107.
- **Verification Evidence:** `npm run verify` exit 0; lint and typecheck clean;
  quality PASS over 189 files; 51-route build; disposable-database render
  receipt with 21 rendered-value checks and the auth checks recorded in Loop 4.
- **Archived:** `dev/fids/archive/FID-2026-1029-011-subscription-revenue-analytics.md`
- **Commit:** `ba233c6`

## Lessons Learned

Money has more than one clock. Credit revenue is recognized when usage settles;
plan revenue is recognized when an invoice is paid; a top-up is not revenue at
all. Any surface that shows a single "revenue" number must either state which
clock it uses or show the streams separately. Included subscription usage also
proves that zero charge does not mean zero cost: margin must keep upstream cost
in the calculation and explain why a yearly plan's cash and cost can land in
different ranges.
