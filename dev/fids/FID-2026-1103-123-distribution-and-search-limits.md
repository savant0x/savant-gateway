# FID: Signal distribution, caching and search limits

**Filename:** `FID-2026-1103-123-distribution-and-search-limits.md`
**ID:** FID-2026-1103-123
**Severity:** medium
**Status:** converged
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

## Resolution

- **Closed Date:** not closed
- **Fix Description:** pending implementation
- **Tests Added:** No
- **Verification Evidence:** None
- **Archived:** not archived
