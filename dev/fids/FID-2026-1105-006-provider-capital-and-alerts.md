# FID: Provider capital and actionable economics alerts

**Filename:** `FID-2026-1105-006-provider-capital-and-alerts.md`
**ID:** FID-2026-1105-006
**Severity:** high
**Status:** converged
**Created:** 2026-11-05 18:13 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Converged design for a provider purchasing and capital view plus actionable
economic alerts. It shows observed balances with capability and age, settled
recorded-cost trends, served-model dependencies and an explicitly estimated
runway, then routes threshold breaches through the existing operations incident
authority. No balance was fetched, funded or changed by this planning pass.

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

The operator must decide where provider working capital goes, but a balance can
be unavailable or stale, and recorded usage cost is not the same fact as cash
debited by the upstream. Existing operations incidents carry availability
context but not economics: low runway, margin erosion, abnormal customer spend
and stale cost or comparison data have no single, deduplicated alert path.

### Expected Behavior

For each provider the operator sees whether balance is supported, the last
observed balance and observation time, a current/stale/unavailable state,
settled recorded-cost trend and the models that depend on it. Runway is an
explicit estimate: current observed balance divided by an explicit trailing
daily burn rate, with the window, coverage and exclusions stated. No balance, a
stale balance or insufficient history yields unknown; zero burn never yields an
infinite guarantee. Historical cost stays attached to the provider that actually
served each call. Economic alerts are default-off, configurable, name their
threshold, observation time and coverage, deduplicate, recover and link to a safe
admin destination. Unknown is never rendered as healthy.

### Root Cause

Balance storage and refresh already respect capability and freshness, and the
operations monitor already owns incident state and delivery. What is missing is
one bounded projection that combines those facts with settled cost and
dependency data, plus economic threshold rules in the existing incident
evaluator instead of a second alert pipeline.

### Evidence

```text
lib/storage/schema/catalog.ts:24     supports_balance INTEGER NOT NULL DEFAULT 0,
lib/storage/schema/catalog.ts:31     balance_usd DOUBLE PRECISION,
lib/storage/schema/catalog.ts:139    ["balance_observed_at", "TEXT"],
lib/storage/providers/runtime.ts:29  * 2. **A stale observation is not evidence.** `ensureProviderObservation`
lib/storage/providers/runtime.ts:88  provider.capabilities.balance && deps.fetchBalance
lib/storage/store/provider-rows.ts:134 observationIsRecent(row.balance_observed_at, now);
lib/storage/store/provider-rows.ts:153 balanceUsd: balanceCurrent ? row.balance_usd : null,
lib/storage/store/operations.ts:56   export function getOperationsThresholds()
lib/storage/store/operations.ts:136  export async function runOperationsMonitor(
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/catalog.ts` — provider balance capability and observation columns.
- `lib/storage/providers/runtime.ts` — capability-gated observation and freshness.
- `lib/storage/store/provider-rows.ts` — current-balance projection.
- `lib/storage/store/operations.ts` — thresholds, incidents and monitor run.
- `components/admin/operations-panel.tsx` / `components/admin/operations-incidents.tsx`
  — existing operator state and delivery display.
- Tests: `tests/providers.test.mjs`, `tests/operations.test.mjs`,
  `tests/operations-postgres.test.mjs`; new `tests/provider-capital.test.mjs` at
  implementation time.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: an estimate could be mistaken for cash or trigger spending
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The design authorizes no balance mutation, provider funding, automatic price
change or external transfer.

## Proposed Solution

### Approach

Expose bounded provider observations and actual settled recorded cost with
source, age and coverage. A USD-only balance is never summed with an unconverted
currency. Runway uses a configurable recent window and a minimum observation
coverage; otherwise it is unknown. Customer credit obligations stay separate
from provider capital because they are opposite sides of the ledger. Extend the
existing operations thresholds with default-off rules for low runway, margin
floor, abnormal customer usage and stale cost or comparison data. Each incident
names its threshold, observation time, coverage and a safe admin destination,
and reuses existing deduplication, recovery and delivery state. A successful
monitor run is not evidence that delivery succeeded. No new scheduler or
notification transport is assumed.

### Steps

1. **Define projections (planned).** Specify provider balance, recorded spend
   and dependent-model projections with age and coverage rules.
2. **Operator view (planned).** Add the bounded view with assumptions, unknown
   states and safe links.
3. **Alert rules (planned).** Extend existing thresholds and incident evaluation
   with default-off economic rules.
4. **Failure behavior (planned).** Prove idempotence, deduplication, delivery
   failure visibility and recovery without any funded call.

### Verification

Mock providers with known, zero, unavailable and stale observations, no balance
capability, mismatched currency and zero or partial burn. Reconcile recorded
costs to settled provider usage. Check incident create/deduplicate/recover across
two PostgreSQL connections, no incident from unknown treated as healthy, safe
links, delivery failure, admin authorization and keyboard/mobile use. No funded
call or external transfer is part of the evidence.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test `tests/providers.test.mjs` — existing, must keep passing.
- gate: test `tests/operations.test.mjs` — existing, extend.
- gate: test `tests/operations-postgres.test.mjs` — existing, extend.
- gate: test `tests/provider-capital.test.mjs` — planned; must exist and run
  before closure.
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
  receipt pointer and five-field Resolution. It also left three financial
  definitions implicit: recorded usage cost versus upstream cash debit, a null
  balance versus zero, and incident creation versus delivered notification.
- **GREEN:** Re-authored the record to the template. Named recorded settled cost
  as an estimate, required an explicit window, coverage and exclusions for
  runway, made zero burn unknown rather than infinite, separated incident state
  from delivery state, and assigned economic rules to the existing operations
  evaluator with default-off configuration and safe links.
- **AUDIT:** PASS `lib/storage/providers/runtime.ts:29` — "A stale observation is
  not evidence." PASS `lib/storage/providers/runtime.ts:88` — the fetch runs only
  when `provider.capabilities.balance && deps.fetchBalance`. PASS
  `lib/storage/store/provider-rows.ts:134` — `observationIsRecent(...)` gates the
  projection. PASS `lib/storage/store/provider-rows.ts:153` — the balance is
  nulled unless current. PASS `lib/storage/schema/catalog.ts:139` — the
  observation timestamp column exists. PASS `lib/storage/store/operations.ts:56` —
  thresholds already have one authority. PASS `lib/storage/store/operations.ts:136` —
  the monitor run already exists.
- **ADVERSARIAL:** A provider that resets its balance is not a negative spend.
  Multiple routes to the same provider are not summed twice. Historical cost is
  attributed to the serving provider, not today's default. A rejected incident
  webhook must not read as delivered. Hostile threshold configuration is clamped
  or rejected. Concurrent monitor runs must not duplicate an incident.
- **CHANGE DELTA:** whole-document structural rewrite of the draft. It exceeds
  the 10% per-pass edit cap because the draft had no template sections to amend;
  the deviation and the measured character delta are recorded in the planning
  handoff rather than hidden.

### Missed Questions

1. Does runway authorize funding? No. It is an estimate for a human decision and
   the design performs no transfer.
2. Does recorded usage cost equal provider cash debit? No. It is a recorded
   estimate until reconciled against actual provider evidence.
3. Is a successful monitor run evidence of delivery? No. Delivery keeps its own
   state and failure is visible.
4. What if balance capability is absent? The provider shows unavailable, not
   zero and not healthy.
5. Can an unknown input create an incident? Only as an explicit unknown/stale
   alert if configured; it is never silently treated as a pass.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** none; the design is not implemented.
- [ ] **File:line ranges:** none; no application file was changed.
- [ ] **Gate output:** no implementation run exists.
- [ ] **Reproducibility:** the design cites existing code only.
- [ ] **Step statuses:** steps 1–4 are **blocked** pending operator
  authorization for a coding session; planning alone does not authorize code.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
  (`lib/storage/providers/runtime.ts`, `lib/storage/store/provider-rows.ts`,
  `lib/storage/store/operations.ts`, `components/admin/operations-panel.tsx`).
- [ ] Implementation matches the Proposed Solution — none exists.
- [ ] Typecheck/tests/lint pass for new behavior — none exists.
- [ ] Production call-graph evidence for new wiring — none exists.
- [x] FID status reflects the actual state: `converged`, not `fixed`.

### Loop 2 — Independent audit and self-correction

- **RED:** Independent re-read checked whether any path could convert an unknown
  observation into a healthy state or turn a recorded cost into a cash claim.
- **GREEN:** No text change was required; the capability gate, freshness rule and
  estimate label already cover those paths.
- **AUDIT:** PASS `lib/storage/schema/catalog.ts:24` — `supports_balance` is a
  stored capability, not an assumption. PASS `lib/storage/providers/runtime.ts:170` —
  `ensureProviderObservation` refreshes only through the existing observation
  path.
- **ADVERSARIAL:** A provider with a zero balance and zero burn must not show
  infinite runway. A stale comparison source must suppress a price alert rather
  than fire on old data. An acknowledged incident stays acknowledged until a
  real recovery.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 3 — Final convergence

- **RED:** Final risk review: the view could imply an ordering of providers by
  balance alone, and an incident link could target an unsafe destination.
- **GREEN:** No further text change; runway is the ranked estimate and links are
  restricted to authenticated admin routes.
- **AUDIT:** PASS `scripts/repository-contract-check.mjs:143` — active FIDs may
  only carry `converged` or `fixed`. Planning gates are recorded in the handoff.
- **ADVERSARIAL:** If no trustworthy balance exists, the correct output is
  unknown rather than a best guess. If delivery cannot be confirmed, the incident
  reports that state.
- **CHANGE DELTA:** 0% — no text changed in this pass.

## Resolution

- **Closed Date:** not set — the design is converged, not implemented.
- **Fix Description:** Planning convergence only. No provider balance, funding,
  code, schema or deployment was changed.
- **Tests Added:** No. `tests/provider-capital.test.mjs` is planned and must exist
  before any implementation closure.
- **Verification Evidence:** planning gates receipt in
  `dev/session-summaries/2026-11-05-admin-economics-planning-handoff.md`; no
  implementation evidence is claimed.
- **Archived:** not set — a converged design is not archived.

## Lessons Learned

Provider working capital and customer balances are distinct economic facts.
Recorded cost, observed balance and runway estimate must each carry their own
source and freshness, or an operator will read a guess as cash.
