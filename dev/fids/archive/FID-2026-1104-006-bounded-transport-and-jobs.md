# FID: Bounded transport and durable scheduled work

**Filename:** `FID-2026-1104-006-bounded-transport-and-jobs.md`
**ID:** FID-2026-1104-006
**Severity:** high
**Status:** closed
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Feed transport reads a whole response before checking its size and follows
redirects by default. Scheduled content ingestion processes up to ten sources
sequentially inside a 60-second route, each with a 15-second fetch budget before
enrichment. Catalog refresh is a detached promise coordinated per handle. Three
paths share one cause: work that is not bounded to a safe size, deadline and
lifecycle.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; PostgreSQL.
- Repository HEAD `aef6730`.
- Baseline: release audit findings 5, 7 and 8.

## Detailed Description

### Problem

`lib/content/ingest-fetch.ts:81` calls `response.text()` before the size check;
the check counts JavaScript characters, not network bytes. The URL policy
documents DNS rebinding as unresolved, and fetch follows redirects after initial
validation.

`app/api/cron/content/route.ts` declares `maxDuration = 60` and requests ten
sources; ingestion awaits them in sequence. Ten 15-second fetches exceed the
route before enrichment runs.

Catalog refresh is a detached promise. `lib/storage/providers/freshness.ts` is
awaitable for tests, but the production entry point returns immediately and
coordination is per handle, so a second instance can duplicate or miss work.

### Expected Behavior

Byte-bounded streaming reads with cancellation at the limit; every redirect and
resolved destination validated, including encoded IP forms; one total deadline
per scheduled run with durable per-source claims and checkpoints; catalog
refresh bound to a lifecycle or durable job that completes and retries safely.

### Root Cause

Limits were applied after buffering, deadlines were assumed from per-fetch
budgets rather than a total budget, and background work was detached without a
durable owner.

### Evidence

```text
lib/content/ingest-fetch.ts:81      response.text() before size check
app/api/cron/content/route.ts       maxDuration 60, ten sources sequentially
lib/storage/providers/freshness.ts  production entry returns immediately
```

## Impact Assessment

### Affected Components

- `lib/content/ingest-fetch.ts`, content ingestion and cron route.
- `lib/storage/providers/freshness.ts` and catalog sync.
- Source-status reporting and admin content surfaces.

### Risk Level

- [x] High: memory exhaustion from one hostile response, deadline overrun that
  starves remaining sources, and silently incomplete catalog refreshes.

## Proposed Solution

1. **One transport bound.** Stream the body with a byte counter, abort at the
   limit, and never trust `Content-Length`. Follow redirects manually and
   revalidate each hop: scheme, host, resolved private/link-local address, and
   encoded or decimal IP forms.
2. **Total deadline with durable claims.** Give the cron run one deadline,
   claim each source with an expiring owner, checkpoint after each stage, and
   resume unclaimed or expired work on the next tick. Prove every source
   eventually runs and that two concurrent ticks do not duplicate a cycle.
3. **Bound catalog refresh.** Replace the detached promise with a durable job or
   a supported request lifecycle that completes after the response; coordinate
   through the database, not a per-handle map.
4. **Regressions.** Dishonest `Content-Length`, chunked oversize, redirect to a
   private address, encoded IP, slow drip, deadline overrun, and concurrent tick
   duplication.

### Verification

RED: an oversized chunked body is buffered fully; a redirect to loopback is
followed; a ten-source run exceeds the deadline with later sources unrun; two
ticks duplicate a source. GREEN: abort at the byte cap, refuse the redirect,
resume the remaining sources, one owner per source. Server status remains
honest and no partial item is published as complete.

### YAGNI

No queue service, no new scheduler vendor, no new dependency. Durable claims use
the existing PostgreSQL handle. Existing per-source fetch budgets remain as
inner bounds under the total deadline.

## Verification Gates

- gate: test tests/content-ingest.test.mjs
- gate: test tests/content-feeds.test.mjs
- gate: test tests/content-fetch-all.test.mjs
- gate: test tests/content-fetch-conditional.test.mjs
- gate: test tests/provider-catalog.test.mjs
- gate: test tests/store-catalog-postgres.test.mjs
- gate: lint, typecheck, quality, build.
- gate: test_http — `npm run test:http` for the route-level behavior.
- gate: verify — `npm run verify:supabase`.

**Planned artifact:** cases extend the named content and catalog files; every
path above exists. No new test file is promised at convergence.

### Verification Receipt

- verified: 2026-11-04 against `941c60f`.
- focused: `tests/content-ingest.test.mjs` 18/18 PASS, including dishonest
  `Content-Length`, chunked oversize, public/private redirect, decimal and
  mapped IPv4 literals, zero deadline, live-claim skip and expired-claim
  reclaim.
- focused: `tests/provider-freshness-postgres.test.mjs` 8/8 PASS, including a
  live provider lease blocking another owner and an externally held provider
  being skipped.
- full: `npm test` 1,019 tests, 1,015 pass, 4 PostgreSQL-only skips, 0 fail.
- gates: `npm run check` PASS; `npm run quality` PASS (605 files); `npm run build`
  PASS (23 static pages); `npm run repository:check` PASS; `npm run storage:check`
  PASS; `npm run config:check` PASS (non-production); `npm run test:recovery`
  14/14 PASS.
- HTTP: `npm run test:http` exited 1 at `paid account limit holds across
  different keys` in the single-connection PGlite fixture. This is the known
  fixture limitation, not a claim that the route passed. The two-connection
  PostgreSQL receipt remains live acceptance.
- PostgreSQL: `npm run test:postgres` refused because Docker and `TEST_DATABASE_URL`
  are unavailable. `npm run verify:supabase` was not run. No full `verify`
  receipt is claimed.
- residual: redirects are manually followed and each literal host is
  revalidated, but DNS resolution is not pinned, so DNS rebinding remains a
  documented residual rather than a closed claim.

## Perfection Loop

### Loop 1 — RED

- **RED:** buffer-then-check, redirect following, sequential unbounded cron,
  detached refresh.
- **GREEN:** streaming cap, manual redirect validation, total deadline plus
  durable claims, durable refresh ownership.
- **AUDIT:** the three files named above were read; the route declares 60
  seconds and requests ten sources.
- **ADVERSARIAL:** a byte cap that counts decoded characters is not a byte cap.
  Count raw bytes from the stream, before decoding.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Can one slow source consume the whole run?** Yes, unless the total deadline
   is enforced and the source is checkpointed.
2. **Does a redirect check at the original URL suffice?** No; each hop needs
   validation, including the final resolved address.
3. **Is DNS rebinding solved by this FID?** Not fully. Pin the resolved address
   for the actual connection or document the residual limitation; do not claim
   it closed.
4. **Does catalog refresh need to finish before the response?** No; it needs a
   durable owner and a completion receipt, not a blocking request.

### Loop 2 — Independent audit and self-correction

- **RED:** durable claims can leak if a process dies mid-source.
- **GREEN:** claims expire and are reclaimable; checkpoints are idempotent.
- **AUDIT:** the existing schema already stores source status and fetch metadata;
  extend it rather than adding a parallel table.
- **ADVERSARIAL:** concurrent ticks could both see an expired claim. Reclaim must
  be a conditional update with an owner token, not a read-then-write.
- **CHANGE DELTA:** 6%.

### Loop 3 — Final convergence

- **RED:** redirect validation could block legitimate CDN hops.
- **GREEN:** validate scheme, host and resolved address; allow only public
  destinations and record the final URL.
- **AUDIT:** no new allowlist of external hosts is introduced.
- **ADVERSARIAL:** aborting a stream must still drain or destroy the socket so
  the connection is not reused mid-body.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Implemented in commit `941c60f`.

- `lib/content/transport.ts` streams raw bytes, cancels at the cap, ignores
  `Content-Length`, follows redirects manually and revalidates every hop.
- `lib/content/url.ts` normalizes decimal, octal, hex and shortened IPv4 plus
  IPv4-mapped IPv6 literals before the private-address decision.
- `lib/content/store/claims.ts` adds atomic expiring source claims and stage
  checkpoints; `content.ingest_claims` is in the content schema.
- `lib/content/ingest.ts` adds `ingestDueSourcesBounded` with a total deadline,
  owner token, skipped/deadline reporting and a compatibility wrapper.
- `app/api/cron/content/route.ts` stops starting sources at 45 seconds and
  reports claimed, skipped and `deadlineReached`.
- `lib/storage/providers/lease.ts` and `provider_sync_leases` add a durable
  provider-sync owner; `lib/storage/providers/freshness.ts` claims and releases
  it, retaining the per-handle promise only as an in-process coalescer.
- Focused cases extended `tests/content-ingest.test.mjs`,
  `tests/content-fetch-conditional.test.mjs` and
  `tests/provider-freshness-postgres.test.mjs`.

## Code Verification Evidence

- [x] Files and tests were read 0-EOF before editing.
- [x] Streaming counts bytes, not decoded characters, and cancels at the cap.
- [x] Redirects are revalidated before the next request; private literals are
  refused before any request.
- [x] Claims use conditional SQL, not read-then-write, and expired claims are
  reclaimable.
- [x] Status reflects the evidence: `closed` for local implementation; the
  PostgreSQL/HTTP acceptance gap remains in `FID-2026-1104-006-LIVE`.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Commit:** `941c60f`
- **Next action:** none for implementation. Live acceptance is owned by
  `FID-2026-1104-006-LIVE`: run `npm run test:http` and
  `npm run verify:supabase` against a disposable PostgreSQL endpoint, then
  record the receipts. DNS rebinding remains a documented residual.
- **Archived:** yes.

## Lessons Learned

A per-call timeout is not a total deadline. A detached promise is not a job.
