# FID: Open Source Projects impressions

**Filename:** `FID-2026-1103-121-osp-impressions.md`
**ID:** FID-2026-1103-121
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03 10:30
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

`opensourceprojects.dev` reports a per-post "Impressions" count on pages that its
robots policy allows. The retired site scraped those pages to give its OSP rows a
real views metric. Our OSP feed items gain GitHub stars but no views, so they can
only compete on stars in momentum. This FID ports the bounded enrichment.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

The OSP RSS feed carries no engagement numbers. Items are `repo` rows enriched
by GitHub, so `views` stays zero/unreported and the source cannot contribute a
views ranking.

### Expected Behavior

- Only `https://www.opensourceprojects.dev/post/...` pages are fetched.
- A parseable "Impressions N" becomes `metrics.views`.
- At most 24 pages per cycle, four at a time, and any per-page failure is
  isolated.
- A source with no OSP items makes no extra requests.

### Root Cause

The RSS adapter was treated as sufficient; the page-level metric was never
ported.

### Evidence

```text
resources/aggroNATION-main/lib/fetchers/osp-impressions.ts
lib/content/presets.ts: opensourceprojects.dev/rss preset, no metrics
```

## Impact Assessment

### Affected Components

- `lib/content/osp-impressions.ts` (new)
- `lib/content/ingest.ts`
- `tests/content-osp.test.mjs` (new)

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: extra upstream requests are bounded but still external
- [ ] Low

## Proposed Solution

### Approach

A pure parser plus a bounded worker pool, injected through the existing
`fetchText` dependency so tests never touch the network. Enrichment runs after
feed parsing and only for items whose canonical URL is an OSP post.

### Steps

1. Add `isOspPostUrl`, `parseOspImpressions` and
   `enrichOspImpressions(items, fetchText, maxPages)`.
2. Call it after RSS parsing when any item is an OSP post.
3. Preserve any existing metrics and never invent a count when the marker is
   missing.
4. Test host filtering, parsing, the page cap and per-page isolation.

### Verification

`tests/content-osp.test.mjs` covers the parser and pool; ingestion tests prove
the integration with an injected fetch.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-osp.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** No OSP page fetch, no views.
- **GREEN:** Bounded parser and enrichment.
- **AUDIT:** Only the allowed host/path is fetched; the count is integer and
  non-negative.
- **ADVERSARIAL:** A page change removes the marker; that item stays unreported
  rather than becoming a zero. A slow page is isolated by the shared fetch
  timeout.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Do we scrape a disallowed listing? → No. Only post pages, never the
   client-rendered `?sort=views` listing or its API.
2. Does this run for every source? → Only when the parsed set contains OSP post
   URLs, and at most once per source cycle.
3. Does a page failure fail the source? → No. It is optional enrichment.

### Loop 2 — implementation

- **GREEN:** `lib/content/osp-impressions.ts` exports `isOspPostUrl`,
  `parseOspImpressions` and `enrichOspImpressions(items, fetchText, maxPages)`.
  `ingestSource` calls it only when the parsed set contains OSP post URLs.
- **AUDIT:** Only `https://www.opensourceprojects.dev/post/...` is eligible; the
  listing and its client API are never fetched. The marker parser requires a
  finite non-negative integer. Existing metrics are preserved and the page cap
  is 24 with four workers.
- **ADVERSARIAL:** A page that drops the marker leaves views unreported rather
  than zero. One failing page does not fail the cycle because enrichment is
  isolated per request and optional to the feed parse.
- **VERIFICATION:** `node --test tests/content-osp.test.mjs` 4/4 and
  `tests/content-ingest.test.mjs` 7/7. Full suite 902 (901 pass, 1 skipped);
  lint, typecheck, quality and build 0. Commit `d07e039`.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** bounded OSP post-page impression enrichment feeding the
  existing views metric
- **Tests Added:** Yes — `tests/content-osp.test.mjs` plus the ingestion case
- **Verification Evidence:** focused 11/11; `npm test` 902 (901 pass, 1 skipped);
  lint, typecheck, quality and build all exit 0; commit `d07e039`
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

Optional enrichment must not be able to turn a healthy feed into a failed cycle.
Keeping the parser pure and the worker pool bounded made both the no-network
test and the honest "unreported" state possible.
