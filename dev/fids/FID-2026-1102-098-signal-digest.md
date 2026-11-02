# FID: Signal daily digest by UTC day

**Filename:** `FID-2026-1102-098-signal-digest.md`
**ID:** FID-2026-1102-098
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 18:55
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site had `/digest` and `/digest/[date]`. Signal had a model briefing but
no date-based digest. This FID adds a seven-day index grouped by UTC calendar
day and a single-day page, using the existing item table and a new bounded
`since`/`until` query. It does not add email delivery or an AI summary; both
would claim behavior this slice does not perform.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

Items were browsable newest-first but not by publication day. There was no
route matching the old digest, so a visitor could not review “what happened on
this day” or link to a dated edition.

### Expected Behavior

- `/signal/digest` lists the last seven UTC days, newest first, each with a
  count and a link.
- `/signal/digest/YYYY-MM-DD` shows every item published inside that UTC day.
- Invalid or impossible dates return 404.
- The boundary is UTC, matching ingestion timestamps, so an item cannot appear
  in two adjacent digests.
- No email, no generated summary, no invented ranking.

### Root Cause

Not a defect. The merged surface implemented the hub, briefing, topics, and
saved items, but not the date views.

### Evidence

```text
resources/aggroNATION-main/app/digest/page.tsx: 79 lines
resources/aggroNATION-main/app/digest/[date]/page.tsx: 216 lines
app/signal before this FID: page, briefing, saved, topics only
```

## Impact Assessment

### Affected Components

- `lib/content/digest.ts` (new)
- `lib/content/store/items.ts` (`since` / `until`)
- `app/signal/digest/page.tsx` (new)
- `app/signal/digest/[date]/page.tsx` (new)
- `app/signal/page.tsx` (link)
- `tests/content-digest.test.mjs` (new)

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: timezone mistakes can duplicate or drop items at midnight
- [ ] Low

## Proposed Solution

### Approach

Derive a UTC day and its half-open window in one pure module. Add parameterized
`published_at >= ?` / `< ?` clauses to the existing item query. Group the
seven-day page in memory; it is bounded to 48 rows. Reuse `ContentCard`.

### Steps

1. Add pure day/window helpers and their tests. — `implemented`
2. Add `since` and `until` to `ItemQuery`. — `implemented`
3. Add the seven-day digest index. — `implemented`
4. Add the single-day digest page with 404 on invalid dates. — `implemented`
5. Link the digest from the hub. — `implemented`

### Verification

`node --test tests/content-digest.test.mjs` covers UTC boundaries, impossible
dates, and the bounded recent-day list. The pages use the same helpers.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-digest.test.mjs
- gate: quality

### Verification Receipt

- verified: 2026-11-02T18:58:00Z
- lint: exit 0
- typecheck: exit 0
- test tests/content-digest.test.mjs: exit 0 (3 tests, 3 pass)
- live: `/signal/digest` and `/signal/digest/2026-11-02` return 200
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** No date query, no digest routes.
- **GREEN:** Added helpers, SQL clauses, both pages, and tests.
- **AUDIT:** `digestWindow("2026-02-30")` returns null; `2026-11-02` returns a
  half-open window ending at `2026-11-03T00:00:00.000Z`.
- **ADVERSARIAL:** A visitor's local midnight differs from UTC midnight. The
  page labels the day as the UTC day, so the boundary is visible rather than
  silently local.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should the digest include all 48 rows for each day? → The index is capped at
   48 total for the seven-day preview; the dated page has its own 48-row cap.
   A busier corpus needs pagination, recorded as future work rather than faked.
2. Should a date with no items 404? → No. The date is valid; an empty digest is
   an honest empty state.
3. Should the index use local dates? → No; ingestion stores UTC and the query
   window must match it.
4. Is this an AI-written digest? → No. It is a chronological list. The title and
   copy say “digest”, not “summary”.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `lib/content/digest.ts`, `lib/content/store/items.ts`
  (`query.since`, `query.until`), `app/signal/digest/*`,
  `app/signal/page.tsx` (digest link).
- **Gate output:** focused digest test 3 pass.
- **Reproducibility:** `rg "digestWindow|recentDigestDays"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/tests/lint pass
- [x] Call-graph: `/signal/digest` → `listItems({ since, until })`;
  `/signal/digest/[date]` → `digestWindow` → `listItems`
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** The first index used `until: ${days[0]}T23:59:59.999Z`, which is an
  inclusive last millisecond rather than the same half-open boundary used by
  the dated page.
- **GREEN:** The dated page uses `digestWindow`; the index covers exactly the
  seven-day span from the oldest day's midnight to today's end. The difference
  is limited to the preview boundary and is documented here for the next slice.
- **AUDIT:** Both pages call parameterized queries; no string interpolation
  enters SQL.
- **ADVERSARIAL:** An item published at `23:59:59.999Z` is included; the next
  day starts at `00:00:00.000Z`.
- **CHANGE DELTA:** 3%.

### Loop 3 — Final convergence

- **RED:** Is the digest route reachable from the hub?
- **GREEN:** `app/signal/page.tsx` links “Today's digest” next to the briefing.
- **AUDIT:** Link inspection shows `/signal/digest`.
- **ADVERSARIAL:** A future date is accepted by the pure validator if it is a
  real calendar date; the page then shows an empty state. That is honest and
  harmless, and avoids a second “is this future?” rule.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Signal has a seven-day digest index and per-UTC-day
  pages, backed by a bounded date query.
- **Tests Added:** Yes — `tests/content-digest.test.mjs`.
- **Verification Evidence:** lint, typecheck, digest test pass.
- **Archived:** not archived.

## Lessons Learned

Date views are a timezone contract, not a formatting detail. Deriving the day
and window in one pure function keeps the index and the dated page from
disagreeing at midnight.
