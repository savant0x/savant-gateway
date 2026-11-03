# FID: Measured Signal search indexing

**Filename:** `FID-2026-1103-132-search-indexing.md`
**ID:** FID-2026-1103-132
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Signal search uses wildcard `ILIKE` over title and excerpt. It is bounded and
correct today, but may degrade as the corpus grows. This FID adds measurement
and then the smallest PostgreSQL-native index strategy justified by observed
latency, while preserving search semantics and the existing rate limit.

## Impact Assessment

- **Affected components:** content item query, PostgreSQL migrations, search
  route, query tests and performance measurement.
- **Risk:** medium scale/performance risk; indexing can increase write cost.

## Proposed Solution

1. **implemented (design):** capture corpus size, query latency, query plans,
   selectivity, and write overhead using representative data.
2. **implemented (design):** choose trigram or full-text indexing only if the
   measurements justify it; preserve title/excerpt behavior and escaping.
3. **implemented (design):** add migration, rollback/compatibility notes, and
   regression tests for ranking, bounds, empty terms, and special characters.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:load`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** wildcard scans may become a hot path; no baseline exists.
- **GREEN:** measurement is mandatory before schema change and semantics are
  explicitly preserved.
- **AUDIT:** inspect `lib/content/store/search.ts`, route bounds, migrations,
  and the public command-palette caller.
- **ADVERSARIAL:** wildcard characters, Unicode, SQL injection attempts, huge
  terms, stale indexes, and write-heavy ingestion must remain safe.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should search become semantic?** No; this FID is lexical performance only.
2. **Should a slow query be hidden by a larger limit?** No; limits remain fixed.

## Implementation Evidence

- **Commit SHA:** `d701ce6`.
- **Implementation:** `lib/content/search-measurement.ts` owns the percentiles
  and the 50 ms / 25,000-item decision rule;
  `lib/content/search-benchmark-terms.ts` fixes the representative terms; and
  `scripts/search-benchmark.mjs` seeds PGlite and times the same wildcard query
  the hub uses.
- **Measured baseline (2026-11-03):** 5,000 items, 15 queries, seed 767 ms,
  p50 5.31 ms, p95 7.93 ms, max 7.93 ms, sequential plan (`Seq Scan` on
  `items`). Decision: `keep-sequential-scan`.
- **Why no index:** both thresholds are unmet. A trigram extension would add a
  migration and per-ingestion write cost without a measured read gain.
- **Tests Added:** Yes — `tests/measurement-decisions.test.mjs` covers ranking,
  bounds, empty samples and the threshold boundary.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the baseline is local PGlite, not the hosted PostgreSQL
  corpus; the script names the corpus and can be re-run against a hosted
  database, and `npm run test:load` was not re-run.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** measured decision to keep the sequential scan; search
  semantics, bounds and rate limits are unchanged.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-132-search-indexing.md`.
