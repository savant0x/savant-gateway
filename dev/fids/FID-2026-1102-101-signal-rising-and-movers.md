# FID: Signal rising and top movers

**Filename:** `FID-2026-1102-101-signal-rising-and-movers.md`
**ID:** FID-2026-1102-101
**Severity:** medium
**Status:** converged
**Created:** 2026-11-02 19:05
**Automation level:** 2
**YAGNI-Compliance:** Pending

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

Not run. Status is `converged`; no code shipped.

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

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence is present
- [ ] FID status reflects the implementation state

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Planned; no code shipped under this FID.
- **Tests Added:** No.
- **Verification Evidence:** None.
- **Archived:** not archived.

## Lessons Learned

“Trending” is a claim about change over time. Without a stored prior value it is
only a sort by current popularity, and the label lies.
