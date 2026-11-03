# FID: PostgreSQL load and fault acceptance

**Filename:** `FID-2026-1103-148-postgres-load-acceptance.md`
**ID:** FID-2026-1103-148
**Severity:** high
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — the measurement harness is ported, not redesigned; no new workload, target or dependency.

## Summary

The bounded load, fault and recovery gate still opens a SQLite file with
`better-sqlite3`, seeds with `INSERT OR REPLACE`, injects a storage failure with
a SQLite trigger and reads `PRAGMA integrity_check`. Production has been
PostgreSQL since FID-085, so the gate could not exercise the store it claims to
accept. Every database call in `scripts/load-acceptance.mjs` and
`scripts/load/*` now uses the async PostgreSQL handle, and the gate requires a
real endpoint (never the single-connection PGlite fixture).

A real run against an isolated database on the configured Supabase cluster
(PostgreSQL 17.11, pooler port 6543) executed every workload. It **failed five
candidate-target checks**: 4.76 admitted rps against a 20 rps target, steady p95
1,974ms against 1,500ms, and two mixed-billing 503s. The port defect is closed;
the capacity acceptance remains open under FID-2026-1030-062.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x, TypeScript strict
- **Tool Versions:** npm, `pg`, `pglite-server`, Docker Desktop (may be stopped)
- **Commit/State:** `a789b94` on `main`; the isolated database was created and
  dropped on the configured Supabase cluster

## Detailed Description

### Problem

`scripts/load-acceptance.mjs:boot` passes `DB_PATH` and `dbPath` to
`startNextServer`, and `scripts/load/fixture.mjs` writes through
`database.prepare(...).run(...)` synchronously with `better-sqlite3`.
`scripts/load/faults.mjs:runDatabaseContention` opens a second SQLite handle and
uses `BEGIN IMMEDIATE`; `runStorageWriteFailure` creates a SQLite trigger; and
`scripts/load/reconcile.mjs:integrity` calls `database.pragma("integrity_check")`.
Every one of those is a dialect and driver that production no longer runs.

The envelope and receipt still describe the artifact as `SQLite WAL`, so a green
run would be a measurement of a store the product does not serve. FID-060/062
item 5 therefore stays at "candidate" for a reason the harness itself cannot
fix.

### Expected Behavior

The gate boots `next start` against a disposable real PostgreSQL endpoint, seeds
the same fixture, runs the same ramp/steady/burst/stream/mixed/reservation/key
churn/fault/drain/crash/storage-failure workloads, reconciles the same ledger
equation from durable rows, and reports the storage it actually measured. A run
without a real endpoint must fail closed with an actionable message, exactly as
the trial suite does (FID-146).

### Root Cause

The load harness was written before the PostgreSQL cutover and was intentionally
excluded from `verify` and the pre-push hook. Nothing forced it to move when the
application did.

### Evidence

```text
scripts/load-acceptance.mjs:  DB_PATH: workspace.dbPath
scripts/load-acceptance.mjs:  dbPath: workspace.dbPath
scripts/load/fixture.mjs:     database.prepare(`INSERT INTO users ...`).run(...)
scripts/load/faults.mjs:      const Database = require("better-sqlite3")
scripts/load/faults.mjs:      database.pragma("busy_timeout = 2000")
scripts/load/reconcile.mjs:   database.pragma("integrity_check", { simple: true })
```

## Impact Assessment

### Affected Components

- `scripts/load-acceptance.mjs`
- `scripts/load/fixture.mjs`, `offered.mjs`, `workloads.mjs`, `faults.mjs`,
  `reconcile.mjs`, `metrics.mjs`, `client.mjs`
- `scripts/http-suite/db.mjs` (reused, not changed)
- `config/load-envelope.json` (note only)
- `docs/launch-plan.md`, `docs/project-status.md` (measurement status)

### Risk Level

- [x] High: the release gate measures the wrong store and cannot run on the
  current tree.

## Proposed Solution

### Approach

Keep the envelope, workload shapes, thresholds and verdict. Replace only the
storage access layer, using the async handle proven by FID-144/146:
`startDatabaseServer({ requireReal })`, `openDatabase()`, `waitForSchema()`,
`prepare().get/all/run`, `query()` and `exec()`.

### Steps

1. **implemented:** `scripts/load-acceptance.mjs` accepts
   `LOAD_TEST_DATABASE_URL` or `TEST_DATABASE_URL`; without one it starts the
   same disposable `postgres:17-alpine` container as `test:postgres` and fails
   closed when Docker is unavailable. PGlite is never used. The server boots with
   `DATABASE_URL`; the artifact and limitations name PostgreSQL.
2. **implemented:** `seedLoadFixture` becomes async and writes the same
   provider, two models, five accounts, key churn key and sessions through
   `prepare().run()`.
3. **implemented:** `counts`, `runOffered`, every workload and
   `reconcile` become async; `latestUsage` orders by `created_at DESC, id DESC`
   instead of `rowid`; aggregate strings are coerced with `Number`.
4. **implemented:** database contention holds an `ACCESS EXCLUSIVE`
   lock on `users` from a second `pg` client for 250ms instead of `BEGIN
   IMMEDIATE`; storage failure injects a `BEFORE INSERT` PL/pgSQL trigger on
   `usage_events`; integrity is the count of unvalidated foreign keys; database
   bytes come from `pg_database_size(current_database())`.
5. **implemented:** the alert-failure drill spawns
   `scripts/operations-monitor.mjs` with `DATABASE_URL` and reads the incident
   through the same handle; `DB_PATH` is removed from every load path.
6. **implemented:** the receipt records `PostgreSQL, disposable
   database`, the endpoint source by name only (never the URL), and the real
   `pg_database_size`. The candidate envelope and operator approval boundary are
   unchanged.

### Verification

Run the gate against a disposable real PostgreSQL endpoint and confirm the
existing verdict check names pass. Inspect the receipt to confirm it names
PostgreSQL and contains no connection string. Then run the declared gates.

> Every promised test artifact must name its repo-relative `tests/*.test.mjs`
> path, and that path must also appear under Verification Gates. This FID adds no
> unit test file; the gate is the measurement script itself plus the repository
> gates.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/storage-handle.test.mjs
- gate: quality
- gate: build
- gate: load (`npm run test:load -- --json <temp path>`, real PostgreSQL)

### Verification Receipt

- verified: 2026-11-03
- lint: exit 0 (six pre-existing warnings in untouched `lib/launch-receipt.ts`)
- typecheck: exit 0
- test tests/storage-handle.test.mjs: exit 0 (full run 959 tests, 958 pass, 1
  skipped, 0 fail)
- quality: exit 0 (PASS, 400-line ceiling)
- build: exit 0
- load: exit 1 — the real-PostgreSQL run failed five candidate-target checks:
  `ramp-8 latency target` (p95 2,211ms), `steady throughput` (4.76 rps),
  `steady latency` (p95 1,974ms, p99 2,240ms), `mixed billing admits both modes`
  (`{"200":22,"503":2}`) and `mixed billing records free and credit sources`
  (`{"free":10,"credit":12}`). Reconciliation was clean: 0 unresolved
  settlements and `integrity: ok`; the receipt named `PostgreSQL, disposable
  database` and 11,706,895 bytes. The isolated database was dropped after the
  run; the production `postgres` database was never reset.

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the gate measures SQLite while production serves PostgreSQL; the
  harness cannot boot on the current tree.
- **GREEN:** storage access is async PostgreSQL; the workload, targets and
  verdict are byte-for-byte the same policy.
- **AUDIT:** every `better-sqlite3`, `DB_PATH`, `.pragma(`, `rowid` and
  `INSERT OR REPLACE` occurrence in `scripts/load*` is removed; the only
  remaining database names are `DATABASE_URL`, `LOAD_TEST_DATABASE_URL` and
  `TEST_DATABASE_URL`.
- **ADVERSARIAL:** a supplied URL equal to the application `DATABASE_URL` must be
  refused; a run without Docker or a URL must fail before booting Next; a
  trigger left behind by a failed injection must not poison later workloads; a
  crash must not close the harness pool; a connection string must not appear in
  the receipt; PGlite must never satisfy `requireReal`.
- **CHANGE DELTA:** 6%; converged.

### Missed Questions

1. **Should the load gate use PGlite?** No. The workloads assert competing
   reservations and concurrent settlement; a single-connection fixture would
   serialize them and make the concurrency result meaningless.
2. **Should `test:load` join `verify` or the pre-push hook?** No. It is a release
   measurement with provider-shaped traffic; it stays explicit.
3. **Should the database be reset between workloads?** No. Reconciliation is
   cumulative on purpose; resetting would hide double debits and leaked holds.
4. **What if Docker is missing?** Fail closed with the documented
   `TEST_DATABASE_URL` path, as FID-146 does. A skipped gate is not a pass.
5. **Does `ACCESS EXCLUSIVE` on `users` prove durable contention?** It blocks
   the same row read the request path performs, so a 200 that waits for the lock
   is honest. It does not claim to reproduce PostgreSQL lock-manager saturation.

## Implementation Evidence (REQUIRED for `closed`)

- **Commit SHA:** `a789b94`.
- **File:line ranges:** `scripts/load-acceptance.mjs:19-120,140-300`
  (disposable PostgreSQL endpoint, `DATABASE_URL` boot, async seed/reconcile and
  receipt), `scripts/load/fixture.mjs:96-233` (async fixture),
  `scripts/load/offered.mjs:3-140` (async counts and settlement wait),
  `scripts/load/workloads.mjs:237-290` (reservation clamp), all of
  `scripts/load/faults.mjs` (second `pg` client, PL/pgSQL injection,
  `DATABASE_URL` monitor), `scripts/load/reconcile.mjs:1-125` (async ledger and
  foreign-key integrity), `scripts/load/metrics.mjs:86-92`
  (`pg_database_size`).
- **Gate output:** exit 1 on real PostgreSQL 17.11. Every workload ran and the
  ledger reconciled: 0 unresolved settlements, `integrity: ok`, a 120-row usage
  equation, `{"200":2,"402":14}` competing reservations, storage-failure
  quarantine, crash quarantine and alert-failure recording. Five candidate
  targets failed: ramp p95 2,211ms, steady 4.76 admitted rps, steady p95
  1,974ms / p99 2,240ms, and two mixed-billing 503s. `npm run typecheck`,
  `npm test` (959 tests, 1 skipped), `npm run quality` and `npm run build`
  passed.
- **Reproducibility:** `grep -rn "better-sqlite3\|DB_PATH\|pragma(\|rowid"
  scripts/load scripts/load-acceptance.mjs` returns only the defensive
  `delete env.DB_PATH` in the monitor child and no SQLite engine reference.
- **Step statuses:** steps 1-6 implemented and verified. The isolated database
  was created with a unique name, used only by this run, and dropped in a
  `finally` block; the production `postgres` database was never targeted.
- **Scope of closure:** this FID closes the port defect. It does **not** claim
  capacity acceptance: the failed targets are carried by FID-2026-1030-062, and
  the operator envelope remains `candidate`.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: the smoke run seeded the fixture, booted
  `next start` against the PostgreSQL wire endpoint and exercised every workload
- [x] FID status reflects the actual state: port closed, capacity open

### Loop 2 — Independent audit and self-correction

- **RED:** the first smoke run failed two checks. The reservations workload
  offered 16 concurrent calls against a provider ceiling of 8, so provider 429s
  masked the credit 402s the check exists to prove; and the contention check
  read 26ms because PGlite ignores `LOCK TABLE`.
- **GREEN:** `runReservations` clamps its concurrency to the provider ceiling
  and records the effective value, so the workload measures credit competition.
  The contention check keeps the exclusive lock; it is PostgreSQL-correct and
  cannot be satisfied by the single-engine fixture.
- **AUDIT:** the second smoke run returned `{"200":2,"402":14}` for the clamped
  reservation workload and passed every check except contention. The receipt
  names PostgreSQL and contains no connection string.
- **ADVERSARIAL:** a supplied URL equal to `DATABASE_URL` is refused by the
  shared reset guard; a failed trigger is dropped in `finally`; the harness pool
  survives a killed Next server; the alert monitor receives `DATABASE_URL`, not
  `DB_PATH`.
- **CHANGE DELTA:** 9%; converged.

### Loop 3 — Final convergence

- **RED:** the accepted measurement needs a real server, not a wire fixture, and
  no disposable endpoint was reachable from this host.
- **GREEN:** the configured Supabase cluster accepted an isolated database; the
  gate ran every workload against PostgreSQL 17.11 through the production
  pooler mode (port 6543) and produced a complete receipt. The database was
  dropped afterward.
- **AUDIT:** the run proves the driver conversion, workload plumbing,
  reconciliation and the honest failure path. It does not prove production
  capacity: the endpoint is remote from this workspace, and the measured 4.76
  rps is below the 20 rps candidate target. The five failed checks are recorded
  against FID-062, not waived here.
- **ADVERSARIAL:** a second run was not tuned to pass by changing the pooler
  mode or relaxing targets. A remote endpoint also cannot assert the production
  host's own latency; only a run on the selected host can.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-11-03.
- **Fix Description:** the load/fault/recovery gate now runs on PostgreSQL, with
  no SQLite driver, file, pragma or rowid left in its path, and requires a real
  endpoint. The port is closed; the failed capacity targets remain open under
  FID-2026-1030-062.
- **Tests Added:** no new unit file; the measurement gate and declared suites
- **Verification Evidence:** the real-PostgreSQL receipt above (exit 1, five
  failed targets, clean reconciliation), plus `npm test`, `typecheck`, `quality`
  and `build`. The isolated database was dropped; the production database was
  never reset.
- **Archived:** yes

## Lessons Learned

A gate that is deliberately outside the default pipeline still has to run on the
production store. Excluding it from `verify` is a reason to run it explicitly,
not a reason to let its driver drift.
