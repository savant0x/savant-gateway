# FID: Measured Signal search indexing

**Filename:** `FID-2026-1103-132-search-indexing.md`
**ID:** FID-2026-1103-132
**Severity:** medium
**Status:** converged
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

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
- **Archived:** no.
