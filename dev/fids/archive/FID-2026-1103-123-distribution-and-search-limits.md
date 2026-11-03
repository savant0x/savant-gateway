# FID: Signal distribution, caching and search limits

**Filename:** `FID-2026-1103-123-distribution-and-search-limits.md`
**ID:** FID-2026-1103-123
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03 10:40
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Signal has no outbound feed, no per-item social card and no machine-readable
health badge, so its daily digest and discussion pages cannot be subscribed to
or shared well. Every public content page is `force-dynamic`, re-querying
Postgres on each request for content that changes hourly, and the public search
endpoint has no rate limit.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

- `/signal/digest` is HTML only; the retired site shipped an RSS briefing feed.
- `app/signal/[id]` has no `opengraph-image`, so every share uses the generic
  card while models and docs have their own.
- `/signal/status` has no compact badge projection.
- Nine Signal routes declare `force-dynamic`.
- `/api/content/search` is unauthenticated and unthrottled.

### Expected Behavior

- `/signal/digest/feed.xml` returns valid RSS 2.0 for the newest 14 digest days,
  honouring `?days=1–30`.
- A Signal item renders a 1200×630 card with its title, kind and source.
- `/api/content/status/badge.json` returns a shields.io endpoint payload derived
  from the same public status projection.
- Cache-safe public pages revalidate at 60 seconds; session pages stay dynamic.
- Search allows a bounded burst per client and returns 429 with `Retry-After`.

### Root Cause

Distribution and caching were not in the content slices; every page was made
dynamic to avoid stale reads before ingestion was reliable.

### Evidence

```text
app/signal/digest: HTML page only, no feed route
app/models/opengraph-image.tsx exists; app/signal/[id] has none
app/signal/*: export const dynamic = "force-dynamic" (9 routes)
app/api/content/search/route.ts: no limiter
```

## Impact Assessment

### Affected Components

- `app/signal/digest/feed.xml/route.ts` (new)
- `app/signal/[id]/opengraph-image.tsx` (new)
- `app/api/content/status/badge.json/route.ts` (new)
- `lib/content/distribution.ts` (new pure builders)
- `lib/content/search-limit.ts` (new) and the search route
- Signal page exports
- `tests/content-distribution.test.mjs` (new), `tests/content-search.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: caching can serve a stale page and a feed can emit invalid XML
- [ ] Low

## Proposed Solution

### Approach

Build the XML/badge/card inputs as pure functions so they are testable without
HTTP. Use the existing token-bucket primitive for a per-client search ceiling.
Add `revalidate = 60` only to pages that read no session.

### Steps

1. Add `buildDigestFeed(items, origin, days)` and the feed route.
2. Add the Signal item OG image using the existing social-card tokens.
3. Add `buildStatusBadge(sources, now)` and the badge route with CORS.
4. Add a bounded search limiter keyed by client identity; 429 + `Retry-After`.
5. Replace `force-dynamic` with `revalidate = 60` on hub, digest, digest day,
   topics, rising, movers and status; keep item/briefing/saved dynamic.
6. Test XML escaping/limits, badge states, and the limiter.

### Verification

Pure builders are tested directly; `next build` proves the route/OG wiring; the
HTTP suite remains the place to exercise headers.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-distribution.test.mjs
- gate: test tests/content-search.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** No outbound feed/card/badge, all pages dynamic, search unthrottled.
- **GREEN:** Pure builders, routes, 60-second revalidation, limiter.
- **AUDIT:** XML is escaped; the badge never names a private source; dynamic
  pages that read cookies are not cached.
- **ADVERSARIAL:** A stale hub is acceptable for 60 seconds; a stale item page
  would leak a session-derived save state, so it stays dynamic. A limiter must
  not store unbounded client identities.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should search results be indexable? → No. The feed is the distribution
   surface; search stays a navigation API.
2. Does the badge claim gateway uptime? → No. It reports Signal source health
   only, using the public projection.
3. Is `revalidate` compatible with the content switch? → Yes; the page reads the
   env at render and a disabled surface renders the 404/empty state.
4. What burst is allowed? → 30 requests per minute per client, matching a human
   palette and rejecting scripted hammering without blocking normal use.

### Loop 2 — implementation

- **GREEN:** `/signal/digest/feed.xml` builds RSS 2.0 from the same digest window
  as the HTML page, defaulting to 14 days and accepting `days=1..30`.
  `/signal/[id]/opengraph-image.tsx` renders a 1200×630 card from the item's
  public fields. `/api/content/status/badge.json` returns a shields.io payload
  with `Access-Control-Allow-Origin: *` from the public source projection.
  `/api/content/search` allows a 15-request burst and 30 requests/minute per
  client, returning 429 with `Retry-After`; the key map is capped at 5,000 and
  idle keys are evicted only when the map is full. Session-free reads are
  memoized for 60 seconds in `lib/content/public-cache.ts`.
- **AUDIT:** The feed escapes every publisher string, uses the Signal detail URL
  rather than the external publisher URL, and omits an unparseable date. The
  badge names counts, never a private error. The limiter reuses the existing
  token bucket and trusts the configured proxy header first.
- **ADVERSARIAL — ISR was rejected by the build gate.** `revalidate = 60` made
  Next prerender `/signal/digest` during `npm run build`, which failed because
  the build runs without `DATABASE_URL`. Keeping the pages dynamic and memoizing
  the read is the build-safe equivalent: no page pretends a database the build
  does not have, and repeated requests still stop re-querying Postgres. The
  trade-off is a process-local cache that restarts empty, which is acceptable
  for a one-process deployment.
- **VERIFICATION:** `node --test tests/content-distribution.test.mjs` 4/4,
  `tests/content-search.test.mjs` 4/4, `tests/content-public-cache.test.mjs`
  3/3. Full suite 902 (901 pass, 1 skipped); lint, typecheck, quality PASS (570
  files), `npm run build` 0 with the feed, badge and item-card routes listed.
  Commit `d07e039`.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** RSS digest feed, per-item social card, status badge,
  bounded search limiter and a 60-second public read memo (ISR rejected by the
  no-database build)
- **Tests Added:** Yes — `tests/content-distribution.test.mjs`,
  `tests/content-public-cache.test.mjs`, updated `tests/content-search.test.mjs`
- **Verification Evidence:** focused 11/11; `npm test` 902 (901 pass, 1 skipped);
  lint, typecheck, quality and build all exit 0; commit `d07e039`
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

A caching directive is not portable without knowing how the artifact is built.
The build gate's missing database is a real constraint, and a bounded read memo
satisfies the load goal without turning a green build into a broken one.
