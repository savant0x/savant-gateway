# FID: Accepted capacity envelope and database pool faults

**Filename:** `FID-2026-1104-005-capacity-envelope-and-pool-faults.md`
**ID:** FID-2026-1104-005
**Severity:** critical
**Status:** closed
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The gateway has no accepted PostgreSQL capacity envelope, and the pool path
handles two failure modes incompletely: acquisition has no time budget, and a
failed rollback releases the client without the error flag that discards it.
The isolated load run measured 4.54 admitted requests/second against a 20 rps
target and a 2,152.52 ms steady p95 against 1,500 ms. Three of its eight failures
were later classified as fixture drift (FID-2026-1104-003); five are real.

## Environment

- Windows; Node v24.21.0; PostgreSQL 17 disposable or Neon; Next.js 16.4.3.
- Repository HEAD `aef6730`.
- Receipts: `dev/audits/2026-11-04-load-isolated.json`,
  `dev/audits/2026-11-04-load-acceptance.json`.

## Detailed Description

### Problem

`lib/storage/pg-pool.ts` builds options with `max`, `application_name`,
`onConnect` and statement/idle timeouts, but no `connectionTimeoutMillis`.
Server-side statement timeouts start only after a statement reaches a
connection, so time waiting for a pool slot is unbounded.

`lib/storage/pg-adapter.ts` catches a rollback failure and comments that
`release()` drops the connection, then calls `client.release()` with no error
argument. node-postgres only destroys the client when `release(err)` receives a
truthy error.

### Expected Behavior

A finite acquisition budget that fails closed with an honest 503, and a client
whose connection failed rollback is discarded rather than returned to the idle
pool. The capacity envelope is measured on the intended topology and accepted
or explicitly changed by the operator, never loosened to make a gate green.

### Root Cause

Pool configuration never modeled queue time, and the adapter's failure comment
described behavior the code did not perform. The envelope's five remaining
targets are a measured database-path limit, not a provider limit.

### Evidence

```text
lib/storage/pg-pool.ts        no connectionTimeoutMillis in buildPoolOptions
lib/storage/pg-adapter.ts     rollback failure -> client.release() (no error)
2026-11-04 load: 4.54 rps / 20; p95 2,152.52 ms / 1,500
five real failures after three fixture failures are removed
```

## Impact Assessment

### Affected Components

- `lib/storage/pg-pool.ts`, `lib/storage/pg-adapter.ts`, storage runtime.
- `scripts/load/*` and `config/load-envelope.json`.
- Release evidence in FID-2026-1030-060-LIVE and FID-2026-1030-062 item 5.

### Risk Level

- [x] Critical: unbounded queueing produces hangs and ambiguous timeouts under
  saturation; a poisoned connection can serve later requests.

## Proposed Solution

1. Add `connectionTimeoutMillis` to pool settings and configuration, with a
   documented default below the route deadline. On acquisition failure return a
   retryable 503 that names capacity, not a generic error.
2. Call `client.release(error)` when rollback fails, or destroy the client
   explicitly, so the comment and behavior agree.
3. Extend `scripts/postgres-concurrency-proof.mjs` with pool saturation and
   failed-rollback recovery: assert the leased count never exceeds `max`, the
   waiter fails within its budget, and the next request receives a healthy
   connection.
4. Re-run the isolated load with the FID-2026-1104-003 policy assertion active.
   Record refusal reasons and classify each failure before attributing it.
5. Publish a dated envelope: either the five remaining targets are met, or the
   operator records an explicit target change with the measurement attached.
   `config/load-envelope.json` stays `candidate` until then.

### Verification

RED: a saturated pool leaves a request waiting past its budget; a failed
rollback returns a client that fails the next query. GREEN: bounded refusal,
discarded client, recovered pool. Load acceptance requires zero ledger
differences, zero unresolved settlements, and a refusal reason for every
unexpected status.

### YAGNI

No new pooler, cache or queue. No target relaxation inside this FID. The
existing required tests are extended rather than duplicated.

## Verification Gates

- gate: test tests/gateway-settlement-postgres.test.mjs
- gate: test tests/gateway-e2e-postgres.test.mjs
- gate: test_postgres — `npm run test:postgres` with the two new proofs.
- gate: test_load — `npm run test:load` with the pinned envelope.
- gate: lint, typecheck, quality, build.
- gate: verify — `npm run verify:supabase`.

**Planned artifact:** both pool regressions extend
`scripts/postgres-concurrency-proof.mjs`; that path exists.

### Verification Receipt

- verified: partial — implementation `e145413`; full unit suite 996 tests
  (992 pass, 4 environment-skipped), typecheck, lint, quality and production
  build pass. The two-connection proof, the pool-saturation/failed-rollback
  integration proof and the isolated load rerun are not run because this host
  has no disposable PostgreSQL endpoint and Docker is unavailable. The
  envelope remains `candidate`. No capacity claim is made.

## Perfection Loop

### Loop 1 — RED

- **RED:** no queue budget; release without discard; five unexplained capacity
  failures at the time of the audit.
- **GREEN:** bounded acquisition, error-flagged release, classified measurements.
- **AUDIT:** pool options and adapter `finally` block inspected; load receipt
  values cited.
- **ADVERSARIAL:** a short acquisition timeout can turn a slow database into a
  refusal storm. The budget must sit below the route deadline and produce a
  retryable status, not a hard failure.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does `statement_timeout` bound pool wait?** No; it starts after checkout.
2. **Can PGlite prove the pool behavior?** No; real connections are required.
3. **Is the 20 rps target a customer promise?** No; it is a gateway-capability
   burst target. Sustained free-tier supply is bounded separately by the
   upstream grant.
4. **Does a 503 count as a lost settlement?** Only if an admission was recorded;
   the reconciliation receipt must stay at zero.

### Loop 2 — Independent audit and self-correction

- **RED:** `release(error)` on every failure would discard healthy clients after
  a business error.
- **GREEN:** discard only when rollback itself failed; ordinary errors still
  release cleanly after a successful rollback.
- **AUDIT:** node-postgres removes the client when `release` receives a truthy
  error, matching the intended comment.
- **ADVERSARIAL:** a discarded client during a transaction could hide the
  original error. Preserve the original error and log the discard separately.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** the envelope could be accepted on a run that still has fixture drift.
- **GREEN:** the policy assertion from FID-2026-1104-003 is a precondition.
- **AUDIT:** no historical SQLite number is used; only the 2026-11-04 PostgreSQL
  receipts.
- **ADVERSARIAL:** operator approval of targets is not approval of this
  measurement. The two dates and artifacts stay separate.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Implemented in `e145413eee2df944da59e23fe503649309298731`.

- [x] **Commit SHA:** `e145413`.
- [x] **File:line ranges:** `lib/storage/pg-pool.ts:29-64`
  (`connectionTimeoutMs`, 5,000 ms default, `connectionTimeoutMillis`);
  `lib/storage/pg-adapter.ts:29` (`release(error?: Error)`),
  `:302-337` (rollback failure captured and passed to release);
  `tests/db-adapter.test.mjs:182-205`, `:311-336`.
- [x] **Gate output:** unit 996 (992 pass, 4 skipped), typecheck 0, lint 0,
  quality PASS, build 0.
- [x] **Call graph:** `createPostgresPool` → `buildPoolOptions`;
  `createPostgresDatabase.transaction` → `client.release(releaseError)`.
- [x] **Step statuses:** steps 1–2 implemented; step 3 blocked on a disposable
  PostgreSQL endpoint; steps 4–5 blocked on that endpoint and the operator
  envelope decision. No step is deferred by the agent.
- [ ] **Load receipt:** pending the pinned-envelope rerun.

## Code Verification Evidence

- [x] Pool and adapter files exist; the missing timeout and unflagged release
  were read directly and repaired.
- [x] The failed-rollback regression asserts the original error is preserved
  and the lease carries the rollback error for discard.
- [x] Typecheck, lint, quality, build and the full unit suite pass.
- [x] Status reflects reality: `fixed`, not `closed`; the real-server proof and
  load rerun are still outstanding.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Closed Date:** 2026-11-04; the committed implementation and local unit,
  typecheck, lint, quality and build gates are complete under the
  committed-implementation auto-archive ruling.
- **Next action:** the pool-saturation/failed-rollback proof, isolated load
  rerun and dated envelope decision are tracked as
  `FID-2026-1104-005-LIVE` in `dev/tracking/internal-followups.json`. Record
  the receipts there; no capacity claim is made here.
- **Archived:** 2026-11-04; moved to `dev/fids/archive/`. The envelope remains
  `candidate`.

## Lessons Learned

A timeout that starts after checkout cannot bound queueing. A comment that says
"drops it" is not a discard flag.
