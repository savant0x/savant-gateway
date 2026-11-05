# 2026-11-04 — Bounded transport and one gate contract

## Outcome

FID-2026-1104-006 is `closed` and archived at implementation commit `941c60f`.
FID-2026-1104-008 is `fixed` but deliberately not closed: its full-gate receipt
still depends on a disposable PostgreSQL endpoint.

## FID-2026-1104-006

- `lib/content/transport.ts` streams raw bytes, cancels at the cap and ignores
  `Content-Length`; redirects are manual and every hop is policy-validated.
- `lib/content/url.ts` normalizes decimal, octal, hex, shortened IPv4 and
  IPv4-mapped IPv6 literals before the private-address decision.
- `content.ingest_claims` plus `lib/content/store/claims.ts` give one expiring
  owner per source; `ingestDueSourcesBounded` enforces one total deadline and
  reports claimed, skipped and `deadlineReached`.
- `provider_sync_leases` plus `lib/storage/providers/lease.ts` coordinate
  catalog refresh across instances; the per-handle promise remains only an
  in-process coalescer.
- `app/api/cron/content/route.ts` stops starting sources at 45 seconds under a
  60-second route.
- Focused receipts: `tests/content-ingest.test.mjs` 18/18;
  `tests/provider-freshness-postgres.test.mjs` 8/8. Full suite 1,015/1,019 with
  four PostgreSQL-only skips, zero failures; build, check, quality (605 files),
  recovery, storage, config and repository checks pass.
- Limitations: `test:http` failed at `paid account limit holds across different
  keys` in the single-connection PGlite fixture; `test:postgres` refused because
  Docker and `TEST_DATABASE_URL` are unavailable; `verify:supabase` was not run.
  DNS resolution is not pinned, so DNS rebinding remains residual. These are
  tracked in `FID-2026-1104-006-LIVE`.

## FID-2026-1104-008

- Node 24 is pinned in `package.json` (`24.x`), `.nvmrc`, CI and `Dockerfile`.
- `VERIFY_GATES` is the single ordered contract. `scripts/verify.mjs` iterates
  it; CI and the pre-push hook call `npm run verify`. The new
  `repository:check` is the fifth gate.
- `scripts/repository-contract-check.mjs` checks active FID registration,
  uniqueness and status, promised test paths for implemented records, archived
  closure commits, root-document links, docs indexing and named current-doc
  claims.
- Corrections: two root links in `SCOPE.md`/`CHANGELOG.md` were outside `dev/`;
  two more in `CHANGELOG.md` pointed at `../docs/`; ten unindexed docs were
  added to `docs/README.md`; historical SQLite/Fly sections carry a dated
  banner.
- Receipt: `repository:check` PASS (Node 24, 11 gates, 10 active FIDs) before
  FID-006 archived. Full verify is not claimed because the PostgreSQL gate is
  unavailable and the HTTP gate is red in PGlite. A clean `npm ci` full run on
  Node 24 is still required before closure.

## Active queue

After closing 006 the active queue is nine records. 008 waits on the PostgreSQL
receipt; 009 needs a browser harness; 011 needs operator recipient approval;
013A waits on 009 and 013B needs a lawful fixture; the launch records need
operator or external acceptance.
