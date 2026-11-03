# FID: Source catalog and fetch integrity

**Filename:** `FID-2026-1103-120-source-catalog-and-fetch-integrity.md`
**ID:** FID-2026-1103-120
**Severity:** high
**Status:** converged
**Created:** 2026-11-03 10:25
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The shipped preset list contains a dead YouTube handle (`@savant`, 404) and two
Reddit feeds that return 403/429 from a datacenter host. Reddit has no URL
normalization, so an operator who pastes a subreddit page gets HTML and a failed
source. Every failure, including a configuration mistake, counts toward the
five-failure auto-disable. Feeds are re-downloaded in full every hour even though
they change daily.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`
- **Storage:** PostgreSQL
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

- `lib/content/presets.ts` seeds `@savant` (probe: 404) and two Reddit rows
  (probe: 403/429).
- `lib/content/store/sources.ts` normalizes only Hacker News URLs.
- `recordSourceFailure` increments for every error, including invalid
  configuration that the operator has not fixed yet.
- `defaultFetchText` sends no validators, so an unchanged 1.8 MB arXiv feed is
  transferred every hour.

### Expected Behavior

- A `reddit` source kind accepts a subreddit URL, canonicalizes it to the
  official `hot.rss` feed, and labels it as Reddit.
- Presets contain only live, verified feeds; dead rows are removed.
- A configuration-class failure records an error but does not disable the
  source; only fetch-class failures advance the streak.
- Unchanged feeds return 304 and reuse the bounded in-process body cache.

### Root Cause

The source layer was built for feeds with stable canonical URLs and one failure
class; Reddit and operating experience arrived later.

### Evidence

```text
2026-11-03 probes:
@ savant -> 404; reddit AI_Agents -> 403; reddit singularity -> 429
lib/content/store/sources.ts: only normalizeHackerNewsUrl is applied
lib/content/store/sources.ts: recordSourceFailure always increments
lib/content/ingest-fetch.ts: no If-None-Match / If-Modified-Since
```

## Impact Assessment

### Affected Components

- `lib/content/types.ts`, `lib/storage/schema/content.ts` (`reddit` kind)
- `lib/content/reddit.ts` (new pure normalization)
- `lib/content/store/sources.ts`, `lib/content/admin-input.ts`
- `lib/content/ingest.ts`, `lib/content/ingest-fetch.ts`
- `components/admin/content-source-form.tsx`
- `lib/content/presets.ts`
- `tests/content-sources.test.mjs`, `tests/content-ingest.test.mjs`,
  `tests/content-fetch-all.test.mjs`, `tests/content-feeds.test.mjs`

### Risk Level

- [ ] Critical
- [x] High: a dead preset burns retries and a bad URL silently disables a source
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Add the Reddit kind at the same validation boundary as Hacker News, classify
errors at the throw site, and add a small conditional-fetch wrapper with a
bounded cache. Presets are data: replace the dead entries and add the six feeds
verified on 2026-11-03.

### Steps

1. Add `reddit` to `SOURCE_KINDS` and both schema check constraints; add the
   admin form option.
2. Add pure `extractSubreddit`/`normalizeRedditUrl`; call it from `cleanInput`
   and from the fetch path.
3. Introduce `SourceConfigError`; throw it for invalid HN/Reddit/YouTube
   configuration. `recordSourceFailure` takes a failure kind and only advances
   the streak for fetch failures.
4. Replace dead presets and add Lobsters, Simon Willison, Latent Space, Import AI,
   arXiv cs.LG and cs.CL with verified notes.
5. Add `createConditionalFetcher` (ETag/Last-Modified, 304 reuse, 64-entry
   bound) and use it for the default feed transport.
6. Test normalization, config-vs-fetch streaks, conditional 304 reuse and the
   preset set.

### Verification

Focused suites cover each branch; the full suite and build prove the schema and
admin surface still work.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-sources.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: test tests/content-fetch-all.test.mjs
- gate: test tests/content-feeds.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** Dead presets, unnormalized Reddit, one failure class, unconditional
  downloads.
- **GREEN:** Reddit kind, classification, conditional cache, verified presets.
- **AUDIT:** The cache is bounded and never serves a stale body for a changed
  feed; the failure split is enforced in SQL, not in the caller.
- **ADVERSARIAL:** A 304 without a cached body must fail rather than produce an
  empty success; a config error must remain visible in status without
  disabling.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should Reddit be its own kind? → Yes. It validates a subreddit and rewrites
   the transport URL; treating it as generic RSS leaves the operator trap.
2. Is a 403 a config error? → No. It is an upstream fetch failure and may
   disable the source; the operator sees the error and can remove it.
3. Does the conditional cache leak across sources? → Keys are the canonical feed
   URL; a source edit to a new URL is a new key.
4. What happens after a restart? → The cache is empty, no validators are sent,
   and the first fetch is a full 200. Correctness never depends on the cache.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** pending implementation
- **Tests Added:** No
- **Verification Evidence:** None
- **Archived:** not archived
