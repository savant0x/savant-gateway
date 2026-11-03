# FID: Source-native engagement metrics

**Filename:** `FID-2026-1103-119-source-engagement-metrics.md`
**ID:** FID-2026-1103-119
**Severity:** high
**Status:** converged
**Created:** 2026-11-03 10:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Hacker News scores and comment counts, and HuggingFace paper upvotes, are already
present in the upstream payloads but are discarded during parsing. Both sources
therefore have no metric snapshots and can never appear in `/signal/rising` or
`/signal/movers`, even though they are two of the most useful feeds. The snapshot
comment column is also named `youtube_comments`, which would become a false name
the moment another source reports comments.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL (PGlite locally)
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

`HackerNewsStory` has no `score` or `descendants`, and `HackerNewsStory` is
mapped to `ParsedItem` without `metrics`. HuggingFace reads `paper.upvotes` in
its documented shape but never maps it. `writeMetricSnapshot` stores only
`item.metrics?.views`, `likes`, `youtubeComments`, `stars` and `rating`, so both
sources write an all-zero snapshot and are excluded from momentum comparisons.

### Expected Behavior

- A Hacker News story stores its points as `likes` and its comment count as
  `comments`.
- A HuggingFace daily paper stores its upvotes as `likes`.
- The stored metric column and the item count column use generic `comments`
  names, with existing YouTube data preserved.
- Momentum can rank HN and HF rows by likes/comments.
- A source that does not report a metric still records no invented value.

### Root Cause

The original YouTube adapter defined the metric shape and column names. Later
sources were added without revisiting that shape, so their metrics were dropped.

### Evidence

```text
lib/content/hackernews.ts: type HackerNewsStory has no score/descendants
lib/content/hackernews.ts: mapped ParsedItem has no metrics
lib/content/huggingface.ts: upvotes read only in the doc comment
lib/storage/schema/content.ts: metric_snapshots.youtube_comments
lib/content/store/item-writes.ts: item.metrics?.youtubeComments
```

## Impact Assessment

### Affected Components

- `lib/content/types.ts` (`ContentMetrics.comments`)
- `lib/storage/schema/content.ts` (rename comment columns additively)
- `lib/content/store/item-rows.ts`, `item-writes.ts`, `momentum.ts`
- `lib/content/hackernews.ts`, `lib/content/huggingface.ts`
- `lib/content/ingest-fetch.ts` (YouTube mapping)
- `tests/content-metrics.test.mjs` (new), `tests/content-momentum.test.mjs`

### Risk Level

- [ ] Critical
- [x] High: a wrong metric writes a false public ranking
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Rename the two YouTube-specific comment columns to generic names with an
idempotent, data-preserving migration, then map each source's native counts.
Missing counts remain absent rather than being asserted as zero.

### Steps

1. Add `ContentMetrics.comments`; replace every `youtubeComments` use.
2. Migrate `content.metric_snapshots.youtube_comments` to `comments` and
   `content.items.youtube_comment_count` to `comment_count` when the old columns
   exist; keep the fresh-schema path on the new names.
3. Parse HN `score`/`descendants` and HF `upvotes` into `metrics`.
4. Read/write the new columns in the item row, snapshot writer and momentum
   query.
5. Test HN and HF metrics, the snapshot round trip, and a momentum ranking that
   includes a HN row.

### Verification

`tests/content-metrics.test.mjs` proves parsing and snapshot storage;
`tests/content-momentum.test.mjs` proves the ranking; the full suite and gates
prove nothing else regressed.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-metrics.test.mjs
- gate: test tests/content-momentum.test.mjs
- gate: test tests/content-store.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** HN has no score/descendants in its parsed story, HF drops upvotes,
  and both snapshot columns are YouTube-named.
- **GREEN:** Generic columns, native mapping, tests.
- **AUDIT:** The migration is idempotent and preserves existing comment counts.
- **ADVERSARIAL:** A story with no score must not become a zero observation that
  outranks a real zero; only reported numbers are stored.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Does HN always report both? → `score` and `descendants` are integers on every
   live story; non-finite values are omitted, not coerced.
2. Does HF upvotes mean likes? → It is the only community signal on the paper
   list and maps to the existing `likes` metric; views remain unreported.
3. Is renaming safe? → The migration only renames when the old column exists and
   the new one does not; a database with both keeps both and backfills.
4. Does momentum still treat absence as zero? → No. An unreported metric is not
   written, so the existing snapshot semantics are unchanged.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** pending implementation
- **Tests Added:** No
- **Verification Evidence:** None
- **Archived:** not archived
