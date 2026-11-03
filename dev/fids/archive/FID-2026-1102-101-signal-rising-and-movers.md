# FID: Signal rising and top movers

**Filename:** `FID-2026-1102-101-signal-rising-and-movers.md`
**ID:** FID-2026-1102-101
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 19:05
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site ranked items by momentum: rising, top movers, and a weekly
baseline. Signal currently orders by publication time only. This FID defines a
measured momentum view built from stored metric snapshots. It deliberately does
not call a view count “trending” without a prior snapshot to compare against.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

Every list is chronological. A repo that gained 2,000 stars today looks the same
as one published today with zero engagement, and the operator has no way to
surface a genuine mover.

### Expected Behavior

- Each fetch stores a metric snapshot when a metric changed.
- `/signal/rising` ranks by positive change over a bounded window.
- `/signal/movers` shows the largest absolute changes with the window named.
- An item with one snapshot has no delta and is excluded, not shown as zero.
- The page states that the underlying metrics come from the source, not from
  gateway traffic.
- No score is blended with price or purchasing behavior.

### Root Cause

Not a defect. The content slice did not include metric history; adding a
current-count ranking would have produced a misleading “trending” list.

### Evidence

```text
lib/content/store/items.ts: ORDER BY published_at only
content.items: current counts, no snapshot table
resources/aggroNATION-main/supabase/migrations/20260906000000_fetch_cycles_and_movers.sql
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts` (snapshot table)
- `lib/content/store/items.ts` (snapshot write/read)
- `lib/content/momentum.ts` (pure delta and ranking)
- `app/signal/rising/page.tsx` (new)
- `app/signal/movers/page.tsx` (new)
- `app/signal/page.tsx` (links)
- `tests/content-momentum.test.mjs` (new)

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a bad delta makes the public ranking false
- [ ] Low

## Proposed Solution

### Approach

Write one snapshot per item per fetch cycle when any metric changed. Compute
deltas over a half-open time window. Rank positive deltas for rising and
absolute deltas for movers, with a minimum snapshot age so a first fetch cannot
win. Keep the math pure and tested.

### Steps

1. Add the snapshot table and retention bound.
2. Write snapshots in `upsertItem` only when metrics change.
3. Add the pure delta/window helpers.
4. Add the rising and movers pages.
5. Test first-snapshot exclusion, negative change, and ties.

### Verification

Planned tests: an item with one snapshot is excluded; a +100 view change ranks
above +10; a deleted item disappears; the window boundary is half-open.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-momentum.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- closed: 2026-11-03
- commit: `7a2020d`
- focused: `node --test tests/content-momentum.test.mjs` exit 0 — 3/3
  (pure math and ranking, store window/retention, first-snapshot exclusion)
- test: `npm test` exit 0 — 874 tests, 873 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 555 files)
- build: `npm run build` exit 0 — `/signal/rising` and `/signal/movers`
  compiled as server-rendered routes
- call graph: `MomentumPage` is used by both routes and calls `listMomentum` in
  `lib/content/store/momentum.ts`; `upsertItem` writes snapshots through
  `lib/content/store/item-writes.ts`; `ingestSource` prunes retention
- not run: `npm run test:http`, `npm run test:recovery`, browser review

## Perfection Loop

### Loop 1 — RED

- **RED:** No history, no delta, no ranking pages.
- **GREEN:** Not started.
- **AUDIT:** The current item table stores one count per metric; there is no
  prior value to subtract.
- **ADVERSARIAL:** Fetch intervals differ by source, so a “daily” delta is not
  comparable across sources. The window must be a named duration and the UI
  must show it.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Is absence of a metric a zero? → No. The existing metrics already treat zero
   as “not reported”; a snapshot must store null/absence separately.
2. Should repo stars and video views share a score? → No. Show separate
   rankings or label the metric; a blended score would be invented.
3. Should the gateway's own request volume influence this? → No. This is
   publisher engagement, not gateway demand.
4. How many snapshots are kept? → A bounded window (90 days) with a prune in
   the ingestion cycle; the exact bound is an implementation step.

### Implementation Evidence

Not applicable; status is `converged`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output (receipt above)
- [x] Production call-graph evidence is present (routes, page, store, ingest)
- [x] FID status reflects the implementation state (`closed`)

### Loop 2 — Implementation convergence (2026-11-03)

- **RED:** Re-read `content.items`, the upsert statement, the Signal hub, and
  the schema. Confirmed one current count per item and no snapshot table, so no
  delta can be computed.
- **GREEN:** Add `content.metric_snapshots` keyed by `(item_id, captured_at)`,
  storing views, likes, YouTube comments, rating and repo stars. `upsertItem`
  writes a snapshot only when a stored metric differs from the latest
  snapshot. A prune removes snapshots older than 90 days during the ingestion
  cycle; a prune failure is logged and does not turn a healthy source into an
  error. Pure `momentumDelta` and `rankMomentum` helpers own the arithmetic and
  ordering. The store reads the latest snapshot at or before the window start
  and the latest snapshot overall, so a one-snapshot item has no baseline and
  is excluded. `/signal/rising` shows positive deltas and `/signal/movers`
  shows absolute deltas, each with an explicit metric and a named half-open
  window. Repo stars are their own metric; no blended score and no gateway
  traffic enters the ranking.
- **AUDIT:** The window is half-open (`baseline <= start < latest`), ties fall
  back to title, zero and negative values are preserved as reported, and the
  page states that metrics come from the source. `upsertItem` writes no
  snapshot on an unchanged fetch.
- **ADVERSARIAL:** A deleted item disappears through the FK cascade and the
  join; a missing metric is a zero, not an invented count; a fetch interval
  difference cannot create a blended daily delta because the window is a named
  duration; an empty ranking is an honest empty state.
- **CHANGE DELTA:** New implementation section, well under 10% of the record.
- **Step statuses:** 1–5 `implemented` after verification; no deferred or
  skipped step.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** changed-only metric snapshots with a 90-day prune,
  half-open window deltas, per-metric rising and absolute movers rankings, and
  two public routes that name the metric and window.
- **Tests Added:** Yes — `tests/content-momentum.test.mjs` (3 cases) covering
  pure math, tie ordering, first-snapshot exclusion, half-open windows and
  retention.
- **Verification Evidence:** commit `7a2020d`; focused suite 3/3;
  `npm test` 874 (873 pass, 1 skipped); typecheck, lint, quality and build all
  exit 0.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

“Trending” is a claim about change over time. Without a stored prior value it is
only a sort by current popularity, and the label lies.
