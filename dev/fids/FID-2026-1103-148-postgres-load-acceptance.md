# FID: PostgreSQL load and fault acceptance

**Filename:** `FID-2026-1103-148-postgres-load-acceptance.md`
**ID:** FID-2026-1103-148
**Severity:** high
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — the measurement harness is ported, not redesigned; no new workload, target or dependency.

## Summary

The bounded load, fault and recovery gate still opens a SQLite file with
`better-sqlite3`, seeds with `INSERT OR REPLACE`, injects a storage failure with
a SQLite trigger and reads `PRAGMA integrity_check`. Production has been
PostgreSQL since FID-085, so the gate cannot exercise the store it claims to
accept. It also cannot boot at all on a host without the removed SQLite path.
Port every database call in `scripts/load-acceptance.mjs` and `scripts/load/*`
to the async PostgreSQL handle the HTTP suites already use, require a real
PostgreSQL endpoint (never the single-connection PGlite fixture), and keep every
existing workload, target and verdict check unchanged.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x, TypeScript strict
- **Tool Versions:** npm, `pg`, `pglite-server`, Docker Desktop (may be stopped)
- **Commit/State:** `416ee11` on `main`, clean before this FID

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

- verified: 2026-11-03 (port smoke on PGlite PostgreSQL wire, not the accepted
  measurement)
- lint: exit 0 (six pre-existing warnings in untouched `lib/launch-receipt.ts`)
- typecheck: exit 0
- test tests/storage-handle.test.mjs: exit 0 (full run 959 tests, 958 pass, 1
  skipped, 0 fail)
- quality: exit 0 (PASS, 400-line ceiling)
- build: exit 0
- load smoke: exit 1 — `database contention waits and settles: 200 in 28ms`.
  Every other check passed; the receipt names `PostgreSQL, disposable database`
  and 12,714,107 bytes. PGlite ignores `LOCK TABLE`, so this one check cannot
  run on the wire fixture. The real-PostgreSQL receipt is **blocked** by the
  host: Docker Desktop's Linux engine cannot start and WSL2 is unavailable.

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
- **Gate output:** the PGlite smoke run reached every workload and failed only
  the lock-based contention check (`200 in 28ms`). It reported 0 unresolved
  settlements, `integrity: ok`, `120`-row usage equation, 2 admitted / 14
  `402` competing reservations, storage-failure quarantine, crash quarantine
  and alert-failure recording. `npm run typecheck`, `npm test` (959 tests, 1
  skipped), `npm run quality` and `npm run build` passed.
- **Reproducibility:** `grep -rn "better-sqlite3\|DB_PATH\|pragma(\|rowid"
  scripts/load scripts/load-acceptance.mjs` returns only the defensive
  `delete env.DB_PATH` in the monitor child and no SQLite engine reference.
- **Step statuses:** steps 1-6 implemented. The bounded real-PostgreSQL
  measurement is **blocked**: Docker's Linux engine and WSL2 are unavailable on
  this host, and a remote application database must not be reset by this gate.
- **Not closed:** a gate that fails one check is not a pass, and the FID does not
  claim a measurement it did not run.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: the smoke run seeded the fixture, booted
  `next start` against the PostgreSQL wire endpoint and exercised every workload
- [x] FID status reflects the actual state: `converged`, measurement blocked

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

- **RED:** the accepted measurement still needs a real server, not a wire
  fixture.
- **GREEN:** the gate fails closed without a real endpoint and prints the
  documented variable names; it never falls back to PGlite.
- **AUDIT:** the smoke proves the driver conversion, workload plumbing and
  reconciliation; it does not prove lock contention or production capacity.
- **ADVERSARIAL:** running on a Docker-capable host with
  `TEST_DATABASE_URL=postgres://...` is the only remaining step; the operator
  envelope stays `candidate` until then.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed — measurement blocked on real PostgreSQL.
- **Fix Description:** the load/fault/recovery gate now runs on PostgreSQL, with
  no SQLite driver, file, pragma or rowid left in its path.
- **Tests Added:** no new unit file; the measurement gate and declared suites
- **Verification Evidence:** PGlite smoke receipt and repository gates above;
  the real-PostgreSQL receipt is outstanding.
- **Archived:** no

## Lessons Learned

A gate that is deliberately outside the default pipeline still has to run on the
production store. Excluding it from `verify` is a reason to run it explicitly,
not a reason to let its driver drift.
