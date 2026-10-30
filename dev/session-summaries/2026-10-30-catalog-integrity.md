# Session summary — provider and catalog integrity (FID-2026-1030-055)

**Date:** 2026-10-30
**FID:** FID-2026-1030-055
**Status:** implemented, verified, archived

## Request

Continue the launch sequence with 055: provider, catalog and benchmark
integrity.

## Measured defect

`fetchUpstreamModels` read `payload.data` and returned `[]` whenever it was not
an array — an error object, an HTML page, `null` or a renamed field all became
"this provider has no models". `syncProvider` then called
`replaceModels([], …)`, which marks every row for that provider out of catalog.
One bad 200 response would silently remove a working catalog from `/models` and
`/v1/models`; the row and its sync timestamp would still look delivered.

Benchmark storage was already conservative (stale instead of delete, sanity
gate, writer lease), but no receipt exercised pagination, collapse, provenance
or quota end to end.

## Change

- `lib/providers/model-list.ts` — pure `/models` envelope reader: requires an
  object with a `data` array, drops entries without usable ids, refuses a
  non-empty page with no usable ids, and reports `has_more`/`last_id`. An
  explicit `data: []` stays a verified empty catalog.
- `lib/providers/sync.ts` — follows pagination with `after_id` up to ten pages;
  refuses a page that claims more without a cursor, an unparseable body, or an
  exceeded page cap; no write happens until the whole catalog is read.
- `tests/catalog-integrity.test.mjs` — payload shapes, verified empty, junk
  entries, all-unusable refusal, pagination metadata, duplicate deduplication.
- HTTP fixture — a controllable provider catalog (`unavailable`, `malformed`,
  `html`, `ok`) and a benchmark source with pagination, collapse, renamed and
  quota states.

Unchanged on purpose: soft delisting, manual price/group/disable preservation,
benchmark stale-row retention and the sync lease.

## Verification (actually run)

```text
npm run verify: exit 0
  lint: zero warnings          typecheck: exit 0
  tests 297 / pass 297         quality: PASS (400-line ceiling, 267 files)
  production build: clean      http-suite: 320 checks PASS
  trial-http-suite: all checks PASS
```

New HTTP evidence: malformed 200 → `502`, row still published, timestamp
unchanged; HTML 200 → `502`, row still published; valid sync imports and only
soft-delists absent rows; paginated benchmark sync reads page two; collapsed
payload fails and rows stay fresh; a dropped model keeps its `index_version` and
`measured_at` with `stale = 1`; a spent daily window refuses without another
upstream request.

## Not claimed

- No live provider `/models` read and no live Artificial Analysis window; the
  fixture is local and spends no third-party quota.
- A provider whose pagination cursor is not `after_id` would surface as a
  refused partial import, not a truncation.
- A changed public model id still collides with the
  `(upstream_slug, upstream_id)` unique constraint during sync. The fixture
  surfaced this; reconciling an id-scheme change is not implemented.
- Real source permission/rate observations belong to 044/062.
