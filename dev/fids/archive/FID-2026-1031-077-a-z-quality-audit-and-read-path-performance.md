# FID-2026-1031-077 — A–Z quality audit and read-path performance

- **Status:** closed
- **Severity:** medium
- **Created:** 2026-10-31
- **Closed:** 2026-10-31
- **Commit:** `7996124`
- **Automation:** 3
- **Depends on:** none
- **Related:** FID-2026-1030-060 (load acceptance), FID-2026-1030-059 (operations)

## 1. Summary

Run a project-wide A–Z quality audit and fix the concrete read-path defects it
finds. The known performance defect is that analytics predicates wrap indexed
`created_at` columns in `datetime(...)`, which prevents SQLite from using the
existing indexes. A payment-event claim scan also lacks its composite index. A
provider-scoped usage composite is evaluated explicitly; it is kept only if its
read benefit outweighs the per-settlement write cost.

The audit is a real review of the repository, not a checklist with assertions.
Every dimension records the file or command inspected, the finding, and the
disposition. A green build is not evidence for a dimension.

## 2. Environment

Windows 11, Git Bash, Node 24.21.0, npm 11.16.0, Next 16.4.3, TypeScript strict.
Baseline commit: `195ea51`.

## 3. Problem / expected behavior

**Observed.** `lib/analytics.ts` compares
`datetime(created_at) >= datetime(?)` and orders by `datetime(created_at)`.
SQLite cannot use `usage_events_created_idx` for either operation. The admin
analytics page therefore scans the full usage window as volume grows.

**Observed.** `billing_events` has no `(status, claimed_at)` index, so
stale-claim recovery scans the table. `usage_events` does have a
`created_at` index, which bounds a provider-scoped day window before the
provider filter.

**Expected.** Analytics range queries use the indexed `created_at` column
directly. The payment-claim index exists on a fresh database and is added
additively to an existing one. Query plans show index use. A provider composite
is measured rather than assumed. The load acceptance receipt is re-run after
the change and does not regress.

## 4. Root cause

ISO-8601 UTC strings are lexicographically ordered, so wrapping them in
`datetime()` is unnecessary for range comparisons and ordering. The wrapper
forces a per-row function call and defeats the index. The missing composite
indexes were never added when provider-scoped and claim-recovery queries were
introduced.

## 5. Impact

- **Affected:** admin analytics, provider-scoped usage reporting, stale payment
  event claim recovery, the load acceptance receipt.
- **Unaffected:** billing semantics, settlement, model routing, customer-facing
  authorization.
- A slow analytics page does not corrupt money; it delays operator visibility.

## 6. Proposed implementation

1. Add `dev/audits/2026-10-31-a-z-quality-audit.md` covering these dimensions:
   architecture, billing, catalog and providers, customer auth, data and
   migrations, dependency safety, documentation, error handling, financial
   reconciliation, gateway streaming, HTTP contracts, idempotency, key
   lifecycle, legal and policies, migrations, observability, performance,
   quality gates, rate limits, resilience, security, tests, tracking, UX and
   accessibility, validation, and webhooks.
2. Add `lib/schema/indexes.ts` with an additive
   `billing_events(status, claimed_at)` index. Measure a provider-scoped
   `usage_events` composite; keep it only if it does not cost settlement
   throughput.
3. Change analytics range predicates and ordering to direct ISO comparisons.
4. Add `tests/performance-indexes.test.mjs` that asserts the indexes exist and
   that the analytics plan searches an index rather than scanning.
5. Capture a query-plan receipt and a load measurement after the change.

## 7. Verification gates

```bash
node --test tests/performance-indexes.test.mjs tests/analytics.test.mjs
npm run lint
npm run typecheck
npm run quality
npm run build
npm run test:load
```

The load receipt must be from this change, not copied from FID-060. Any
regression is fixed, not explained away.

## 8. Perfection Loop

### RED

- Analytics query plan contains `SCAN usage_events` or a temporary B-tree sort.
- No composite provider usage index, no payment claim index.
- No A–Z audit with per-dimension evidence.

### GREEN

- Query plan uses `usage_events_created_idx` or the provider composite index.
- The payment-claim index exists after bootstrap and after an additive
  migration. The provider composite is either justified by measurement or
  deliberately absent.
- The audit exists and names evidence for every dimension.

### AUDIT

- Direct string comparison preserves the same UTC semantics; no local-time
  conversion is introduced.
- No index is added to a column that is not filtered or ordered.
- The audit does not claim a dimension is healthy without a file or command
  behind it.
- Load receipt is dated and reproducible.

### ADVERSARIAL

- **Existing database:** bootstrap adds indexes without dropping data.
- **Time zone:** all stored timestamps are UTC ISO strings; no behavior changes
  for non-UTC readers.
- **Duplicate indexes:** `IF NOT EXISTS` makes a second bootstrap a no-op.
- **Empty tables:** plan still valid; tests seed a row.
- **Regression:** load result compared with FID-060's 229.84 rps baseline.

### Missed questions

- Is the audit trying to prove quality with a build? No; each dimension names
  evidence or an open defect.
- Does the direct comparison change the 30-day boundary? No; `Date.toISOString`
  supplies the same UTC string previously passed to `datetime()`.
- Are index names stable for the query plan test? Yes, explicit names.

## 9. Non-goals

- No new analytics product or chart.
- No rewrite of every `datetime()` call in cold admin paths.
- No change to load-generation thresholds.
- No benchmark claim beyond the executed load receipt.

## 10. Implementation evidence

- `dev/audits/2026-10-31-a-z-quality-audit.md` covers 26 dimensions with a
  status, evidence and disposition per dimension.
- `lib/analytics.ts` now uses direct ISO comparisons for all usage and invoice
  range predicates; the query-plan test reports `usage_events_created_idx`.
  `tests/performance-indexes.test.mjs` (3 tests) also asserts the plan for a
  provider-scoped window and the payment-claim composite index.
- `lib/schema/indexes.ts` adds only
  `billing_events(status, claimed_at)` additively. The provider composite index
  was measured and rejected: it adds an index write to every settlement, while
  the existing `created_at` index already bounds the day window. Three runs with
  it measured 181.42 / 222.15 / 213.71 sustained rps; the controlled run without
  it measured 224.31 rps. The FID-060 baseline was 229.84 rps on this host.
- `lib/schema/indexes.ts` is wired after `paymentEventSchema` so the claim
  columns exist; a second bootstrap is a no-op.

Verification: `npm run typecheck` 0, `npm run lint` 0 warnings, `npm run
quality` PASS (355 files), `npm test` 394 pass, `npm run build` 0, `npm run
test:http` 750 checks + trial suite PASS, `npm run test:recovery` 34 checks
PASS, `npm run test:load` 123 checks PASS. `npm audit --omit=dev` reports 0
vulnerabilities. The load receipt remains candidate-only with no operator
approval.

## 11. Closure

Closed against `7996124` on 2026-10-31. The audit is
`dev/audits/2026-10-31-a-z-quality-audit.md`; the archive copy keeps the same
evidence. The open launch items are external dependencies, not implementation
gaps: no operator load approval, no real provider/hosted measurement, no
container build on Linux and no deployment.
