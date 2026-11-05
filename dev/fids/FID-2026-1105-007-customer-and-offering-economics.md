# FID: Customer and offering economics

**Filename:** `FID-2026-1105-007-customer-and-offering-economics.md`
**ID:** FID-2026-1105-007
**Severity:** high
**Status:** converged
**Created:** 2026-11-05 18:13 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Converged design for customer profitability, free-tier conversion cohorts and a
plan profitability simulator. One shared economics vocabulary connects all three
to pricing and provider capital, while simulated results remain visibly separate
from measured ones. No customer, plan, ledger or entitlement was read, written or
changed by this planning pass.

## Environment

- **OS:** Windows (win32), Git Bash.
- **Language/Runtime:** Node 24.x; TypeScript 5.9.3 strict; Next.js 16.4.3 App Router.
- **Tool Versions:** npm with the committed lockfile; PostgreSQL
  17.11.0-beta.19 disposable cluster, PGlite for local development.
- **Commit/State:** baseline `b24594b` on `main`. Pre-existing website-copy
  edits and two untracked conversation exports are preserved; this pass changes
  planning records only.

## Detailed Description

### Problem

The operator cannot reliably compare customers, free usage cohorts and proposed
plans without explicit definitions of cost, attribution and time. Payment fees,
free opportunity cost and acquisition source may be absent, and plan invoice cash
has a different timing than per-call consumption. Without those definitions a
customer can look profitable because a top-up was counted as revenue, or a plan
can look profitable because free calls were treated as zero cost.

### Expected Behavior

The admin sees paginated customers with settled credit charges, recorded upstream
cost by billing source, observed plan cash, refunds and fees only when their
source and allocation are known, and a contribution subtotal with coverage. Free
cohorts show eligible signups, first free usage after signup and subsequent paid
top-up or paid usage over explicit cohort and observation windows. Missing event
history yields unknown, and no count implies causal acquisition attribution. The
plan simulator accepts a proposed snapshot of price, period, model mix, weighted
allowance and overage rules, uses operator-entered light/normal/heavy workloads,
and applies the shared cost and price math with per-model input, output and token
weight. It flags unknown or stale costs, cannot publish a plan, and never mutates
an existing subscription snapshot.

### Root Cause

The data exists in separate surfaces without one per-source contribution model.
`usage_events` is indexed by customer and time and records the billing source;
`free_pool_usage` is per customer and day; the activity store records a durable
first-completion marker; plan invoice cash is already summed from invoices; and
`lib/catalog-economics.ts` plus `lib/price-recommendation.ts` own the shared
micro-dollar math. The missing piece is the definition layer and the operator
projection, not a second ledger.

### Evidence

```text
lib/storage/schema/customers.ts:15  CREATE INDEX IF NOT EXISTS usage_events_user_idx
lib/storage/schema/customers.ts:43  CREATE TABLE IF NOT EXISTS free_pool_usage (
lib/storage/store/activity.ts:71    kind: "first_completion",
lib/storage/store/activity.ts:76    `first_completion_${input.userId}`,
lib/storage/store/analytics.ts:133  COALESCE(SUM(i.amount_micros), 0) AS plan_revenue_micros
app/admin/(panel)/analytics/page.tsx:66 top-ups are prepaid credit, not revenue at
lib/catalog-economics.ts:91         const scenario = input.scenario ?? DEFAULT_ECONOMICS_SCENARIO;
lib/price-recommendation.ts:68      export function sellForMargin(costMicros: number, marginBpsTarget: number) {
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/customers.ts` — usage, top-up and free-pool records.
- `lib/storage/store/activity.ts` — first-completion funnel marker.
- `lib/storage/store/analytics.ts` — customer, model and plan aggregates.
- `lib/catalog-economics.ts` and `lib/price-recommendation.ts` — shared math.
- `components/admin/activity-panel.tsx` — existing funnel display.
- `app/admin/(panel)/analytics/page.tsx` — plan cash versus credit separation.
- Tests: `tests/activity.test.mjs`, `tests/plans.test.mjs`,
  `tests/store-analytics-postgres.test.mjs`; new
  `tests/customer-offering-economics.test.mjs` at implementation time.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: privacy and financial misstatement across customer-level views
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

No balance, existing plan snapshot, entitlement or sales state may change as a
result of the simulator or the cohort views.

## Proposed Solution

### Approach

Use settled credit charges once and never count top-up principal as revenue. Keep
subscription cash by invoice period separate from service-period estimates and do
not double count plan overage that is charged through credit. Expose costs as
recorded estimates where upstream invoice reconciliation is absent, and show
coverage instead of filling gaps. Exclude deleted or anonymous identities from
customer attribution and report aggregate-only coverage. Fees and refunds stay
unavailable unless linked to actual transaction evidence; zero is never inferred.
Define a cohort as signup in a bounded UTC interval, first free event after
signup, and subsequent payment or paid settlement inside an explicit fixed
observation window; late data and partial history stay visible. Use de-identified
aggregates where possible, require admin authorization and bounded queries, and
never expose prompts or keys. The simulator is read-only, consumes plan snapshots
and shared pricing math, and labels every output as simulated.

### Steps

1. **Shared semantics (planned).** Define per-source contribution, coverage and
   unknown states in one module used by every panel.
2. **Customer view (planned).** Build the bounded, paginated contribution
   projection over settled records.
3. **Free cohorts (planned).** Project signup, first free use and later paid use
   with explicit windows and no causal claim.
4. **Plan simulator (planned).** Build the read-only snapshot simulation over
   shared math with operator-entered workloads.
5. **Alert handoff (planned).** Pass abnormal customer usage signals to the
   FID-006 incident authority rather than creating a second alert path.

### Verification

Seed customers with credit, free and plan calls, one plan invoice, overage,
promotional credit, unknown fee and cost, deletion and partial activity history;
reconcile to existing totals without double counting. Assert cohort denominators,
lag, cutoffs, duplicate and late events. Verify the simulator at allowance
boundaries, overage modes, different token mixes, stale and unknown costs and
rounding. Prove no plan, ledger or entitlement write occurs; test authorization,
privacy, pagination, mobile and keyboard controls. Each promised test path must
exist and run before closure.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test `tests/activity.test.mjs` — existing, extend.
- gate: test `tests/plans.test.mjs` — existing, extend.
- gate: test `tests/store-analytics-postgres.test.mjs` — existing, extend.
- gate: test `tests/customer-offering-economics.test.mjs` — planned; must exist
  and run before closure.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify` after implementation.

### Verification Receipt

Planning-only record: no implementation gate is claimed because no code exists.
The convergence-pass receipt (commands, exit codes, output) is recorded in
`dev/session-summaries/2026-11-05-admin-economics-planning-handoff.md`.

## Perfection Loop

### Loop 1 — RED

- **RED:** The draft used `analyzed`, which the repository contract refuses, and
  omitted the template's Environment fields, risk checklist, per-loop records,
  receipt pointer and five-field Resolution. It also left top-up principal, plan
  invoice cash, service-period value and free opportunity cost adjacent but not
  formally separated, and the cohort denominator and observation window were not
  testable.
- **GREEN:** Re-authored the record to the template. Declared top-up principal a
  liability, kept invoice cash and service-period estimates separate, forbade
  double counting plan overage, made unknown fee and cost states explicit,
  defined the cohort boundary and observation window, and made the simulator
  read-only over shared math.
- **AUDIT:** PASS `app/admin/(panel)/analytics/page.tsx:66` — "top-ups are prepaid
  credit, not revenue". PASS `lib/storage/store/analytics.ts:133` — plan revenue
  is `SUM(i.amount_micros)` from invoices, a distinct source. PASS
  `lib/storage/store/activity.ts:71` — the durable `first_completion` event
  exists. PASS `lib/storage/store/activity.ts:76` — its key is
  `first_completion_${input.userId}`, so it is once-only per customer. PASS
  `lib/storage/schema/customers.ts:15` — usage is indexed by customer and time.
  PASS `lib/storage/schema/customers.ts:43` — free-pool usage is stored per
  customer and day. PASS `lib/catalog-economics.ts:91` — one shared scenario
  default exists. PASS `lib/price-recommendation.ts:68` — `sellForMargin` is the
  shared margin function.
- **ADVERSARIAL:** Counting a top-up as revenue is rejected by the liability
  rule. Counting plan overage twice is rejected by the billing-source split.
  Treating missing fees as zero is rejected by the unknown state. A tiny cohort
  cannot be presented as a conversion rate without its denominator. Deleted
  users cannot reappear in per-customer attribution. A simulated workload cannot
  be shown as observed profit. Concurrent plan edits cannot change an existing
  subscription snapshot.
- **CHANGE DELTA:** whole-document structural rewrite of the draft. It exceeds
  the 10% per-pass edit cap because the draft had no template sections to amend;
  the deviation and the measured character delta are recorded in the planning
  handoff rather than hidden.

### Missed Questions

1. Is a top-up earned revenue? No. It is prepaid credit and a liability until
   consumption settles.
2. Does free usage necessarily cost dollars? No. Its opportunity cost is unknown
   unless an actual provider cost is recorded.
3. Does conversion prove acquisition causality? No. The design reports an
   observed sequence, not attribution.
4. Does a simulation sell a plan? No. It cannot publish or mutate a plan.
5. What happens to late activity events? They remain visible inside the stated
   observation window and may change a cohort retrospectively; the report says so.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** none; the design is not implemented.
- [ ] **File:line ranges:** none; no application file was changed.
- [ ] **Gate output:** no implementation run exists.
- [ ] **Reproducibility:** the design cites existing code only.
- [ ] **Step statuses:** steps 1–5 are **blocked** pending operator
  authorization for a coding session; planning alone does not authorize code.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
  (`lib/storage/schema/customers.ts`, `lib/storage/store/activity.ts`,
  `lib/storage/store/analytics.ts`, `components/admin/activity-panel.tsx`).
- [ ] Implementation matches the Proposed Solution — none exists.
- [ ] Typecheck/tests/lint pass for new behavior — none exists.
- [ ] Production call-graph evidence for new wiring — none exists.
- [x] FID status reflects the actual state: `converged`, not `fixed`.

### Loop 2 — Independent audit and self-correction

- **RED:** Independent re-read looked for a path where a customer total could
  include the same dollar twice or where a cohort could imply causation.
- **GREEN:** No text change was required; the billing-source split, liability rule
  and explicit non-causal statement already cover those paths.
- **AUDIT:** PASS `lib/storage/schema/customers.ts:40` — `topups_user_idx` exists
  for bounded per-customer top-up history. PASS `lib/storage/store/analytics.ts:337` —
  total revenue is `chargedMicros + planRevenueMicros`, so the customer view must
  reuse that split rather than invent another total.
- **ADVERSARIAL:** A refund after the observation window must not silently change
  a closed cohort; it is reported in the current period. A promotional credit is
  not revenue. A zero-price model is genuinely zero, not unknown.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 3 — Final convergence

- **RED:** Final risk review: customer-level data could leak identity or become
  an unbounded scan, and the simulator could drift from shared pricing math.
- **GREEN:** No further text change; authorization, de-identification, bounded
  queries and shared math are already requirements.
- **AUDIT:** PASS `scripts/repository-contract-check.mjs:143` — active FIDs may
  only carry `converged` or `fixed`. Planning gates are recorded in the handoff.
- **ADVERSARIAL:** If a cost cannot be reconciled, the customer total carries
  unknown coverage. If a plan changes, only future checkouts see it.
- **CHANGE DELTA:** 0% — no text changed in this pass.

## Resolution

- **Closed Date:** not set — the design is converged, not implemented.
- **Fix Description:** Planning convergence only. No customer, plan, ledger,
  entitlement or code was changed.
- **Tests Added:** No. `tests/customer-offering-economics.test.mjs` is planned and
  must exist before any implementation closure.
- **Verification Evidence:** planning gates receipt in
  `dev/session-summaries/2026-11-05-admin-economics-planning-handoff.md`; no
  implementation evidence is claimed.
- **Archived:** not set — a converged design is not archived.

## Lessons Learned

Observed cash, consumption, estimates and acquisition attribution are different
facts. A customer or plan view is honest only when each figure carries its source,
period and coverage, and when simulation is structurally unable to write.
