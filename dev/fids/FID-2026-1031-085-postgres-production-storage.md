# FID: Move production storage from SQLite to managed Postgres

**Filename:** `FID-2026-1031-085-postgres-production-storage.md`
**ID:** FID-2026-1031-085
**Severity:** critical
**Status:** converged
**Created:** 2026-10-31
**Automation level:** 1
**YAGNI-Compliance:** Pending

> Scope of this record: the plan and the operator ruling. No application code
> changed while it was written, and `better-sqlite3` is still the only data
> layer. `converged` is therefore the honest status.

---

## Summary

The operator ruled on 2026-10-31 that this gateway will not run production
accounting on a single SQLite file on one machine. The objection is not
throughput — the 2026-10-31 load run measured 229.84 sustained admitted rps at
p95 137.53 ms on SQLite — it is availability and recoverability: one file on
one volume with no replica, no failover, no managed point-in-time restore, a
deploy that stops the only writer, and an RPO equal to whatever the operator's
own backup job last wrote.

This record supersedes the 2026-10-30 hosting decision (`docs/hosting-decision.md`)
for the production data layer, keeps its host (Fly), and replaces FID-2026-1030-066's
libSQL target with Postgres. It measures the port rather than estimating it,
records the infrastructure budget, and names the tests that must exist before
the money path moves.

## Environment

- **OS:** Windows 11 (Git Bash); production target Linux container
- **Language/Runtime:** TypeScript strict, Node >= 22.18.0 (local 24.21.0), npm 12.2.1
- **Tool Versions:** Next.js 16.4.3, `better-sqlite3` 13.0.3, 56 test files
- **Commit/State:** `224dfab` on `main`; untracked working-tree files only
  (`resources/`, `database.db*`, research notes) — no tracked modification

## Detailed Description

### Problem

Every balance, hold, ledger row, settlement, session and key hashes to one
SQLite file (`lib/db.ts`), opened synchronously at module scope with WAL. The
topology that makes this correct is exactly three constraints: one process, one
host, local disk. `docs/deployment-runbook.md` and the startup gate enforce all
three, and `docs/hosting-decision.md` records what they cost:

1. One machine is a single point of failure; the volume does not replicate.
2. A deploy stops the old process before starting the new one — seconds of
   downtime on every release.
3. No second instance, no autoscaling, no per-PR preview.
4. Recovery is the operator's own backup cadence, not a provider PITR.
5. The rate limiter is only correct because there is exactly one process.

For a product that holds customer money, items 1 and 4 are the disqualifying
ones. An unreplicated volume is a data-loss surface, not a performance one.

### Expected Behavior

Production accounting lives in a database that survives the application host,
supports more than one application instance, provides managed point-in-time
restore, and enforces the settlement transaction without a single-writer
assumption. Development and tests execute the same code path, so the shipped
path is the tested path.

### Root Cause

`better-sqlite3` is synchronous, and the data layer was designed around that:
`db.prepare(sql).get()` returns a row. Every network database client returns
promises, so this is an architectural coupling, not a connection-string swap.
FID-2026-1030-066 already measured the async cost; what it did not solve is that
libSQL is *also* single-writer, so it relieves the file but not the topology.

### Evidence

Measured on `224dfab` from `lib/`, `grep -ro`, not estimated:

| Fact | Measured |
| --- | --- |
| `.prepare(` call sites | **323** (634 tree-wide incl. tests/scripts) |
| `.transaction(` wrappers | 47 |
| `.immediate()` write locks | 37 |
| `.exec(` multi-statement scripts | 30 |
| `.pragma(` | 4 |
| Files importing `lib/db` | 44 |
| Exported functions in `lib/` | 532 |
| Route handlers | 54 |
| Tables created | 40 |
| Schema modules | 19 |
| `lib/store/*` lines | 6,141 |
| Money-path lines (gateway, ledgers, reconciliation) | 3,235 |
| Files where `better-sqlite3` appears | **2** — `lib/db.ts`, `lib/schema/columns.ts` |

SQLite-dialect constructs that do not exist in Postgres:

| Construct | Count | Postgres form |
| --- | ---: | --- |
| `datetime(` | 30 | `timestamptz` comparison, `now()`, `interval` |
| `ON CONFLICT` | 12 | same keywords, explicit conflict target |
| `INSERT OR IGNORE` | 11 | `ON CONFLICT (…) DO NOTHING` |
| `strftime(` | 2 | `to_char` / `date_trunc` |
| `julianday(` | 2 | `EXTRACT(EPOCH FROM …)` |
| `COLLATE NOCASE` | 2 | `lower(…)` comparison or `citext` |
| `MAX(1, …)` | 2 | unchanged |
| `CAST(ROUND(…) AS INTEGER)` | 2 | `round(…)::bigint` |
| `PRAGMA` | 1 | removed |

The seam is clean: the driver type leaks into only two files, so everything
else consumes a handle. That is what makes this a mechanical port rather than a
redesign.

### Budget (operator-stated, 2026-10-31)

The operator holds **$300**, and it is *provider working capital* — deposits
into the upstream accounts that keep inference available. It is inventory, not
burn: it converts to sold inference, so the only true operating cost is
infrastructure and payment fees. Consequently the database must be cheap in
absolute terms and must not require a prepaid commitment.

Published Neon rates (read from `neon.com/pricing` and
`neon.com/docs/introduction/plans` on 2026-10-31):

| Plan | Compute | Storage | PITR | Scheduled backups | Scale to zero |
| --- | --- | --- | --- | --- | --- |
| Free | 100 CU-h/project/mo, max 2 CU | 1 GB/project | **6 hours** | **none** | **forced after 5 min** |
| Launch | $0.106/CU-h, no minimum | $0.35/GB-mo | up to 7 days | yes (100 snapshots) | can be disabled |
| Scale | $0.222/CU-h | $0.35/GB-mo | up to 30 days | yes | configurable |

Always-on at the 0.25 CU floor: 730 h × 0.25 CU = 182.5 CU-h × $0.106 =
**$19.35**, plus ~$0.35 storage and ~$0.20 of change history ≈ **$19.90/mo**.
With the existing Fly machine at $3.84, total infrastructure ≈ **$23.74/mo**
(≈ $285/yr).

Two consequences recorded rather than glossed:

1. **The Free plan cannot host this.** 100 CU-h is ~400 h of compute at the
   0.25 CU floor against a ~730 h month, so compute is *suspended* around day
   17 until the next billing period; scale-to-zero cannot be disabled, so every
   idle period adds a cold start to the money path; PITR is 6 hours; there are
   no scheduled backups. Free is development and preview only.
2. **Break-even is low.** At the 20.2% blended gross margin the business-model
   report measures, $23.74/mo of infrastructure needs ~$118/mo of paid revenue.
   That is the number the price set has to clear, not a growth target.

## Impact Assessment

### Affected Components

- `lib/db.ts` — connection, pragmas, migration, singleton
- `lib/schema/columns.ts` and the 19 `lib/schema/*` modules — DDL and migration
- `lib/store/*` (34 modules, 6,141 lines) — every query and transaction
- `lib/settlement-ledger.ts`, `lib/trial-ledger.ts`, `lib/allocation-ledger.ts`,
  `lib/payment-events.ts`, `lib/reconciliation.ts` — handle-injected ledger core
- `lib/gateway*.ts`, `lib/stripe-subscriptions.ts`, `lib/providers/*` — money path
- `app/**` — 54 route handlers, admin pages, server components
- `lib/gateway-rate-limit.ts`, `lib/customer-rate-limit.ts`, `lib/token-bucket.ts`,
  `lib/provider-quota.ts` — process-local admission (see D5)
- `lib/production-config.ts` — the startup contract
- 56 test files, `scripts/http-suite/*`, `scripts/business-model.mjs`,
  `scripts/db-backup.mjs`, `scripts/db-restore.mjs`, `scripts/db-recovery-drill.mjs`

### Risk Level

- [x] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

Double-spend, lost settlement and silent cascade loss are all reachable through
this change. It is a money-path rewrite.

## Proposed Solution

### Approach

One asynchronous data layer over `pg`, used by development, tests and
production. `better-sqlite3` is removed rather than kept as a second
implementation, because two data layers mean the tests never exercise the
shipped path. The call-site shape is preserved — `prepare(sql).get/all/run` and
`transaction(fn)` survive, gaining only `await` — because 323 statements already
express the intended operations, and redesigning them into a new repository API
would add a second correctness risk on top of the port.

### Decisions

**D-1 — Postgres, not libSQL.** FID-066 chose libSQL to keep the dialect.
libSQL is still single-writer and, on a hosted engine, still one writer serving
one primary: it relieves the local file but not the single-process topology that
the operator objects to. Postgres pays ~63 dialect rewrites on top of the same
async port and buys managed multi-AZ storage, row locks, PITR, and multiple
application instances.

**D-2 — Neon, Launch plan.** Usage-based, no monthly minimum, scale-to-zero
disableable, 7-day PITR, scheduled snapshots, spending notifications. Free is
scoped to development and preview only (day-17 suspension, forced cold starts,
6-hour history). Scale only when native 30-day PITR becomes a requirement.

**D-3 — One implementation.** No dual driver, no runtime branch on
`NODE_ENV`. Tests create their own schema or database per file so they stay
isolated the way `:memory:` isolates them today.

**D-4 — Retire `.immediate()` as syntax, keep its meaning as a rule.** Every
transaction that writes money or a claim begins with a row lock
(`SELECT … FOR UPDATE`) or a conditional update
(`UPDATE … WHERE available >= $1 RETURNING`). A lint rule forbids
`db.transaction` in `lib/**` without a lock when the body touches a money table
grep-list; the concurrency test in Verification is the real gate.

**D-5 — Shared admission moves into the database.** On a single-process host the
token buckets are correct only because there is one process. On Postgres,
atomic counter updates give one limiter across instances, which closes the
shared-admission problem FID-048 left converged and unimplemented. This is the
main *gain* over the current plan and the reason not to stop at libSQL.

**D-6 — The 30-day retention claim is met deliberately.** Neon Launch caps PITR
at 7 days; `content/legal/` claims backups are kept up to 30 days. Default:
Launch plus scheduled snapshots and an off-site dump retained 30 days, with the
retention window asserted by a test. Moving to Scale (~$41/mo) is the
alternative if native 30-day PITR is preferred; this is recorded as an operator
option, not silently chosen.

**D-7 — No transaction spans a network call.** The provider call, the Stripe
call and the streamed response all happen outside any transaction. A remote
transaction holds a connection and a lock, so this is now enforced by review and
by the settlement tests rather than by a 5-second vendor window.

**D-8 — Connection handling.** One `pg` Pool per process, `max` sized below the
provider's connection cap, statement timeout set, `idle_in_transaction_session_timeout`
set so an abandoned transaction cannot hold the ledger.

**D-9 — Money stays integer micros.** `BIGINT` micros, no floats, no
`numeric`-as-string in application code. A test asserts a round-trip at
`Number.MAX_SAFE_INTEGER`.

**D-10 — Migration moves out of import time.** `createDb()` becomes a lazy
single-flight `ready` promise awaited by the first operation, keeping the `db`
export name so 44 importers do not change. Migration stays additive and
idempotent.

**D-11 — Host does not change.** Fly stays; Postgres removes the volume's role
as the source of truth. Vercel becomes possible afterward (multiple instances
are safe once D-5 lands), but moving hosts is not part of this FID.

**D-12 — Honest cost of the alternative.** Keeping SQLite with off-site WAL
replication (Litestream-style) would close the *data-loss* gap for a few dollars
a month but not the *availability* gap: the process still stops on deploy, still
cannot scale, and a host failure is still downtime. It is the correct choice
only if availability is not a launch requirement. The operator ruled it is.

### Steps

0. **Capability spike (no production code).** Against a Neon Launch database,
   prove: `BEGIN`/`COMMIT` with two connections, `SELECT … FOR UPDATE`
   serializes two settlements against one balance, a conditional
   `UPDATE … WHERE available >= $1 RETURNING` rejects the second, `ON CONFLICT`
   works with named targets, `timestamptz` comparisons order correctly across a
   UTC boundary, `BIGINT` micros round-trip exactly through `pg`, and a
   statement timeout aborts rather than hangs. Record output in this FID. If any
   item fails, stop before touching a call site.
1. **Adapter.** Async `DatabaseHandle`: `prepare/get/all/run/exec/transaction`,
   parameter renumbering (`?` → `$n`), lazy init, pool configuration, and the
   D-6 timeout settings.
2. **Migration runner.** Port the 19 schema modules and `ensureColumn`/`hasColumn`
   to `information_schema`; keep additive, idempotent behaviour.
3. **Ledger core.** Port the handle-injected modules and their test files,
   keeping every assertion.
4. **Store layer.** Port `lib/store/*` and make each exported function `async`.
5. **Callers.** Port `lib/gateway*`, `lib/stripe-subscriptions.ts`,
   `lib/providers/*`, the 54 route handlers, admin pages and server components.
6. **Admission (D-5).** Move the four buckets to database-backed counters with a
   single atomic statement per admission decision; document the latency added to
   admission.
7. **Startup contract.** `lib/production-config.ts` learns `DATABASE_URL`:
   `database_missing`, `database_url_invalid`, and `database_local_in_prod`.
   Update `tests/production-config.test.mjs` and `.env.example`.
8. **Harness and scripts.** Port `scripts/http-suite/*`, `scripts/business-model.mjs`,
   `scripts/db-backup.mjs`, `scripts/db-restore.mjs`, `scripts/db-recovery-drill.mjs`
   (backups become `pg_dump` plus the verifier), and remove `better-sqlite3`
   from `package.json` in the commit that proves the new path.
9. **Cloud acceptance.** Requires operator-supplied `DATABASE_URL`: settlement
   p50/p99 from the deploy region, restore at a chosen timestamp, and a
   reconciliation pass on the restored database before any production cutover.

### Verification

- `tests/db-adapter.test.mjs` — statement shapes, `undefined` for a missing row,
  `changes` from `rowCount`, rollback on throw, parameter renumbering, BIGINT
  fidelity, statement timeout.
- `tests/settlement-concurrency.test.mjs` — the double-spend proof: two
  connections, one balance, exactly one commit.
- `tests/settlement-recovery.test.mjs` — existing, ported: replay no-op,
  quarantine, audited release.
- `tests/schema-migration.test.mjs` — existing, ported: migration is idempotent,
  second run is a no-op.
- `tests/production-config.test.mjs` — extended with the new issue codes.
- `tests/credit-reconciliation.test.mjs`, `tests/payment-events.test.mjs`,
  `tests/allocation.test.mjs`, `tests/analytics.test.mjs`, `tests/promos.test.mjs`,
  `tests/operations.test.mjs` — existing, ported.
- `scripts/http-suite/*` — the full production HTTP matrix against the ported layer.
- `scripts/db-recovery-drill.mjs` — backup/restore drill against disposable databases.

## Implementation — step 1 (2026-10-31)

The adapter landed as an **additive** layer. No existing call site changed and
`better-sqlite3` remains the only data layer the application imports, so the
tree keeps shipping exactly what it shipped before while the port proceeds.

| Artifact | Purpose |
| --- | --- |
| `lib/storage/pg-adapter.ts` | async `prepare/get/all/run`, `exec`, `transaction` with savepoint reentrancy, lazy single-flight init, statement routing |
| `lib/storage/pg-pool.ts` | `buildPoolOptions` (pure) and `createPostgresPool`, session timeouts set on the connection |
| `tests/db-adapter.test.mjs` | 15 tests against an injected fake pool |

What the adapter guarantees, and what it deliberately does not:

1. **Placeholder rewriting is parser-aware.** `?` becomes `$n` while question
   marks inside single-quoted literals, double-quoted identifiers,
   dollar-quoted bodies, line comments and block comments are preserved. A
   blind replace would corrupt any statement containing a literal `?`.
2. **Statements inside a transaction reach the transaction's client.** The
   active transaction is carried in `AsyncLocalStorage`, so `prepare()` called
   anywhere inside the callback — including in a helper — cannot land on a
   different pooled connection. This is the routing bug that would otherwise
   produce a settlement split across two connections.
3. **Nesting uses savepoints.** A transaction opened inside an active one emits
   `SAVEPOINT` / `RELEASE` / `ROLLBACK TO SAVEPOINT` with only the inner work
   rolled back, which matches the `better-sqlite3` nesting semantics the
   settlement and quarantine paths were written against.
4. **`immediate()` no longer locks.** It keeps the call shape but takes no write
   lock, because Postgres has no `BEGIN IMMEDIATE`. The exclusion guarantee
   moves to the statement's own row lock (D-4). This is a real semantic
   difference, not a compatibility claim: the comment on the type says so, and
   the double-spend proof is the gate that has to pass before any caller moves.
5. **Initialization is lazy, single-flight and fail-closed.** Creating the
   handle touches no connection; concurrent first callers share one run; a
   rejected run stays cached rather than retrying into a half-migrated schema.
6. **Timeouts are server-side.** `statement_timeout` and
   `idle_in_transaction_session_timeout` are set on the connection, because a
   statement that outlives its budget and a transaction abandoned by a crashed
   request are both conditions the server must hold.

### Step accounting

| Step | Status | Evidence |
| --- | --- | --- |
| 0 — capability spike | `blocked` | needs an operator-supplied `DATABASE_URL`; a Neon Free project is enough and costs nothing |
| 1 — adapter | `implemented` | `lib/storage/pg-adapter.ts`, `lib/storage/pg-pool.ts`, 15/15 tests, gates below |
| 2 — schema modules and migration runner | `implemented` | `lib/storage/schema/*` (7 modules, 1,188 lines), 8/8 parity and invariant tests |
| 3 — ledger core | `implemented` | settlements, payments, trials, allocations and reconciliation ported; 36/36 tests against a real PostgreSQL engine. Not wired into the app |
| 4 — store layer | `partial` | credit reserve path ported and guard-wired: `lib/storage/store/credit.ts`, 7/7 tests. The other 39 store modules and 71 callers are one cutover (4 + 5) and are not started |
| 5–9 — callers, admission, config, scripts, cloud | `blocked` | blocked on the store flip: 71 files under `app/` and `components/` call the synchronous store |

### Verification Receipt (step 1)

Run on 2026-10-31 against the working tree, Node 24.21.0:

```text
install_pg=0 install_types=0
lint=0 typecheck=0 test=0 quality=0

✔ placeholders are renumbered to positional parameters
✔ question marks in literals, identifiers, comments and dollar quotes are kept
✔ get returns the first row and undefined when the result is empty
✔ all returns every row and an empty array for no rows
✔ run reports affected rows and falls back to zero
✔ exec sends a multi-statement script with no parameters
✔ a transaction runs on one leased client and commits there
✔ immediate keeps the write-transaction call shape
✔ a throwing transaction rolls back and still releases
✔ a nested transaction uses a savepoint and releases it
✔ a failed nested transaction rolls back to its savepoint only
✔ concurrent transactions lease separate clients
✔ initialization is lazy and single-flight
✔ a failed initialization fails closed for every later call
✔ pool options carry the session timeouts and connection cap

ℹ tests 15  ℹ pass 15  ℹ fail 0
quality: PASS (400-line ceiling, 371 files scanned)
```

**Not proved by this receipt:** anything that needs a server. Double-spend
isolation, `timestamptz` ordering across a UTC boundary, `BIGINT` micros
fidelity through the wire, named `ON CONFLICT` targets and real statement-timeout
aborts are step 0 and step 3, and the fake pool cannot answer them. The FID
status stays `converged`, not `fixed`.

## Implementation — step 2 (2026-10-31)

The 19 SQLite schema modules are ported to seven Postgres modules, with the
migration ordered so foreign keys resolve:

| Module | Lines | Contents |
| --- | ---: | --- |
| `lib/storage/schema/columns.ts` | 49 | async `hasColumn`, `ensureColumn`, identifier validation |
| `lib/storage/schema/core.ts` | 222 | users, api_keys, models, usage_events, admin_state, provider_status, settings, credit_holds, credit_ledger, balance_baselines + additive columns |
| `lib/storage/schema/customers.ts` | 157 | sessions, top-ups, free pool, account actions, activity, policy, support, trials |
| `lib/storage/schema/catalog.ts` | 219 | providers, model groups, benchmarks, provider/route/group columns |
| `lib/storage/schema/catalog-seeds.ts` | 206 | system groups, provider seeds, route/group/family/cost backfills |
| `lib/storage/schema/billing.ts` | 276 | settlements, plans, subscriptions, invoices, billing events, promos, incidents |
| `lib/storage/schema/index.ts` | 59 | `applySchema` and the `migrateDatabase` transaction wrapper |

### Decisions taken while porting

1. **D-13 — timestamps stay `TEXT` in ISO-8601 UTC.** For that format,
   lexicographic order is chronological, so every existing `ORDER BY`, range
   comparison and `expires_at > ?` check keeps its meaning and none of the 532
exported functions changes its return shape. The cost is explicit: the 30
   `datetime()` expressions need a `::timestamptz` cast when the store layer
   moves (step 4), and range indexes on a text column do not use a native time
   type. This is a real trade-off, not a claim that text is better.
2. **`BIGINT` for money and token counts.** SQLite `INTEGER` is 64-bit; int4
   would narrow a balance silently, which is the one class of error this schema
   must not permit.
3. **`COLLATE NOCASE UNIQUE` becomes a unique index on `lower(...)`**, because
   case-insensitive collation has no direct Postgres equivalent short of the
   `citext` extension.
4. **Single-row tables use `SMALLINT PRIMARY KEY CHECK (id = 1)`** rather than
   `INTEGER PRIMARY KEY`.
5. **`ensureColumn` uses `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`,**
   which is atomic. The SQLite version has to tolerate a duplicate-column error
   because its check-then-add is not atomic; that whole race disappears here.
6. **The developer account is not seeded in production.** The SQLite schema
   inserts `dev@local` on every boot, including a live database. It has no
   password hash, so nothing can authenticate as it, but it does not belong in a
   customer database. Gated on `NODE_ENV`, recorded as a deliberate divergence.
7. **`catalog.ts` was split.** The first draft reached 412 lines and failed the
   400-line ceiling, so seeds and backfills moved to `catalog-seeds.ts` rather
   than the ceiling being relaxed.

### What the tests do and do not do

`tests/schema-postgres.test.mjs` (8 tests) proves: every table the SQLite schema
creates is created here and the two table sets are identical; the generated DDL
contains no `INSERT OR IGNORE`, `PRAGMA`, `AUTOINCREMENT`, `datetime(`,
`strftime(`, `julianday(`, `COLLATE NOCASE`, `INTEGER PRIMARY KEY` or `REAL`;
money and token columns are `BIGINT`; the whole migration runs inside one
transaction on one leased client; a second run issues identical statements; the
three providers and three system groups are seeded once with
`ON CONFLICT DO NOTHING`; the developer account appears outside production and
not inside it; and `ensureColumn` rejects an identifier that tries to break out
of the DDL.

**The honest limit: no PostgreSQL server has parsed this DDL.** The gate
compares structure, not executability, and it compares *table names*, not
columns — a column that exists in one schema and not the other is not caught
until the migration runs against a real database. A syntax error in the ported
DDL would also still be latent. Step 0 and step 3 are what convert this from
"structurally correct" to "verified".

### Verification Receipt (step 2)

```text
lint=0 typecheck=0 schema=0 adapter=0 quality=0

✔ the Postgres schema creates every table the SQLite schema creates
✔ the generated DDL contains no SQLite-only syntax
✔ money and token columns are BIGINT, not int4
✔ the migration runs inside one transaction on one lease
✔ a second run issues the same statements, so the migration is idempotent
✔ providers and system groups are seeded once with ON CONFLICT DO NOTHING
✔ the developer account is seeded outside production and not inside it
✔ ensureColumn adds a column atomically and validates its identifiers

ℹ tests 8  ℹ pass 8  ℹ fail 0
quality: PASS (400-line ceiling, 378 files scanned)
```

## Implementation — step 3 (2026-10-31, partial)

### What moved

| Module | Exports | Notes |
| --- | ---: | --- |
| `lib/storage/ledger/settlements.ts` | 14 | admission → committed, quarantine, audited release, plus `debitCredit` and `creditBalance` |
| `lib/storage/ledger/payments.ts` | 8 | claim / complete / fail / quarantine, environment binding, operator list |

Still to port for step 3: `trial-ledger.ts` (3 exports), `allocation-ledger.ts`
(6) and `reconciliation.ts` (8). The SQLite originals remain the live code for
all five. They are deleted in the step-8 commit that removes `better-sqlite3`.

### The change that made this verifiable

`@electric-sql/pglite` was added as a **dev dependency**: the real PostgreSQL
engine compiled to WebAssembly. `tests/pglite-pool.mjs` adapts it to the
`PgPool` shape, so the ported migration and ledger execute against actual
PostgreSQL semantics rather than a stand-in that agrees with whatever the code
does. This closes the step-2 caveat in the only honest way available without a
server: the DDL is now parsed and run.

Two limits of that engine are stated in the adapter rather than hidden. It has
one connection, so it cannot prove a two-client race; and its `query()` uses the
extended protocol (one statement) while `exec()` uses the simple protocol (a
script), which is why the adapter routes on whether parameters were supplied.

### Two latent DDL bugs the engine found on the first run

1. **`models_catalog_idx` → `42703` (undefined column).** The index named
   `in_catalog` in the same script that created `models`, before `ensureColumn`
   added it. Fixed by moving both post-add columns' indexes after the column
   loop in `core.ts`.
2. **`billing_events_status_claimed_idx` → `42P01` (undefined table).** The
   index sat in `catalog.ts`, but `billing_events` is created in `billing.ts`,
   which runs later. Fixed by moving the index into `billing.ts` after the table
   and its added columns — which is also why the SQLite version had it in
   `performanceIndexSchema`, a fact the port had silently dropped.

Both would have failed the first production boot. The step-2 note that "no
PostgreSQL server has parsed this DDL" was not a formality.

### Port specifics worth recording

- `MAX(0, x - ?)` → `GREATEST(0, x - ?)`. Postgres `MAX` is an aggregate; the
  SQLite habit of using it as a scalar would change the query's shape, not just
  its arithmetic.
- `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`.
- `datetime(col)` → `col::timestamptz`, the first real application of D-13.
- **`debitCredit` is the double-spend guard as one statement:**
  `UPDATE users SET credit_micros = credit_micros - $1 WHERE id = $2 AND
  credit_micros >= $1 RETURNING credit_micros`. PostgreSQL re-evaluates the
  predicate against the row after taking the write lock, so there is no
  read-then-write window. The store layer must call this rather than
  open-coding a debit.
- `creditBalance` reports `availableMicros = max(0, credit − held)` and is
  asserted so a hold cannot be spent twice.

### What is proven, and what is not

**Proven (17/17, real engine):** the migration parses and executes (≥ 40 tables);
admission commits once and a replay cannot re-commit; quarantine keeps capacity
reserved until an audited release and releases once; subscription and free
capacity are released separately; quarantine is idempotent; a balance cannot be
debited twice past zero; a rolled-back debit leaves the balance untouched;
`Number.MAX_SAFE_INTEGER` micros round-trip exactly; and the full payment-event
state machine (in-flight, stale retry, processed terminal, failed retry, never
reclaim a quarantine, environment binding, undeclared mode, operator list).

**Not proven: the two-connection race.** PGlite has a single connection, so
`tests/settlement-concurrency.test.mjs` — two real `pg` pools racing one debit —
reports **skipped**, not passed, until `DATABASE_URL` is set. The suite total
below therefore shows one skipped test; that skip is the honest status of the
double-spend proof, not a green light.

### Verification Receipt (step 3)

```text
ledger: 17/17 pass, exit 0
✔ the migration parses and executes on a real PostgreSQL engine
✔ a settlement admits once and commits once
✔ an unknown settlement cannot be claimed
✔ quarantine keeps credit reserved until an audited release
✔ subscription and free quarantine hold their own capacity
✔ quarantine is idempotent for the same reservation
✔ a balance cannot be debited twice past zero
✔ a rolled-back debit leaves the balance untouched
✔ micro amounts round-trip through BIGINT without narrowing
✔ an event is claimed once and answered as in-flight while recent
✔ a stale claim can be retried after a crash
✔ a processed event is terminal
✔ a failed handler keeps evidence and is retried immediately
✔ a quarantined event is never reclaimed
✔ the configured environment binds accepted events
✔ an undeclared environment records the mode without enforcing it
✔ the operator view lists durable state

full suite: lint=0 typecheck=0 test=0 quality=0
ℹ tests 466  ℹ pass 465  ℹ fail 0  ℹ skipped 1
quality: PASS (400-line ceiling, 380 files scanned)
```

### Step 3 completed 2026-10-31

The remaining three modules are ported, so the ledger core is now entirely async:

| Module | Lines | Replaces |
| --- | ---: | --- |
| `lib/storage/ledger/trials.ts` | 168 | `lib/trial-ledger.ts` |
| `lib/storage/ledger/allocations.ts` | 264 | `lib/allocation-ledger.ts` |
| `lib/storage/ledger/reconciliation.ts` | 296 | `lib/reconciliation.ts` |
| `lib/storage/ledger/activity.ts` | 40 | the insert half of `lib/activity.ts` |

Port decisions worth recording:

1. **`EXISTS (...)` returns a real boolean.** The allocation eligibility flag is
   read as `boolean` rather than SQLite's `0 | 1`, which removes a whole class of
   truthiness bug at the port boundary.
2. **`BIGINT` columns arrive as strings.** `node-postgres` (and PGlite) return
   int8 as text to avoid precision loss, so every money and token read is wrapped
   in `Number()` at the boundary — never inside arithmetic.
3. **The activity allowlist is not re-implemented.** `insertActivity` imports
   `sanitizeActivityMetadata` from `lib/activity.ts`, so the credential refusal,
   the key allowlist and the size limit cannot drift between the two layers.
   Only the statement is new.
4. **The allocation rebalance keeps its per-row shape.** It reads usage and holds
   for each existing allocation, which is O(accounts) round trips inside the
   caller's transaction. That is bounded by the customer count rather than by
   traffic, and it preserves the exact rule that a newcomer's share is lowered to
   the fair share but never below what an account already used or holds.

Two test failures during this slice were **the test, not the code**, and both are
worth keeping on the record:

- The rebalance fixture allocated while the second account already existed, so
  the first account never held the full pool and the asserted floor was wrong.
  Restructured to allocate with one account first, then add the second.
- The reconciliation report includes the local `user_dev` account the migration
  seeds outside production, so asserting `accounts.length === 1` was wrong.
  It now asserts on the account the test created.

The second one is a real property of the design: the report covers every account
in the database, including the developer row in a non-production environment.

### Verification Receipt (step 3 completion)

```text
recon=0 suite=0 lint=0 typecheck=0 quality=0
ℹ tests 9  ℹ pass 9  ℹ fail 0          (reconciliation)
ℹ tests 10  ℹ pass 10  ℹ fail 0        (trials and allocations)
ℹ tests 492  ℹ pass 491  ℹ fail 0  ℹ skipped 1
quality: PASS (400-line ceiling, 385 files scanned)
```

Step 3 totals in the async layer: **36 tests** (17 settlements/payments, 10
trials/allocations, 9 reconciliation), all against a real PostgreSQL engine. The
one skipped test remains the two-connection race, which belongs to `DATABASE_URL`.

## Implementation — step 4 (2026-10-31, partial)

### The finding that changed the plan

Step 4 was written as "port `lib/store/*` and make each exported function
async". Measured on the current tree, that cannot ship as its own step:

| Fact | Measured |
| --- | ---: |
| Store modules | 40 |
| `lib/store/*` lines | 6,141 |
| Store modules importing another store module | 20 |
| Files under `app/` and `components/` importing the store | **71** |

Every one of those 71 callers is synchronous today. Flipping the store to async
without flipping them does not typecheck, so **steps 4 and 5 are one cutover,
not two separately shippable steps.** The alternative — a second async store
layer beside the synchronous one — would duplicate 6,141 lines of money logic,
which is exactly the two-truths failure D-2 rejected.

This record therefore marks step 4 `partial` and states the cutover plan rather
than pretending the remaining work is incremental.

### What landed

`lib/storage/store/credit.ts` — the target implementation of the reserve path
(`availableCredit`, `reserveCredit`, `releaseHold`, `quarantineExpiredHolds`,
the last three replacing `reserveCreditHold`, `releaseCreditHold` and
`quarantineExpiredHolds` in `lib/store/billing.ts`).

The change that mattered is the guard. The SQLite version reads the balance,
compares in JavaScript, then writes — safe only because there is one writer.
Here the comparison is the `WHERE` clause of the write:

```sql
UPDATE users SET held_micros = held_micros + $1
 WHERE id = $2 AND credit_micros - held_micros >= $1
RETURNING held_micros
```

PostgreSQL re-evaluates that predicate against the locked row, so two competing
reservations cannot both pass. The three legs now compose as: **reserve** at
admission (this module), **debit** on settlement (`debitCredit`), **release or
quarantine** on failure. A reservation never moves `credit_micros`; only
settlement does, which is why the ledger's debit and the store's hold are two
statements with the same shape rather than one statement doing both.

### Cutover plan for 4 + 5 (not started)

Ordered so each slice is one commit that keeps the gates green: module + every
caller converted together, money first.

1. `billing` → `overview` → the admin/public server components that await it.
2. `usage` + `free-pool` + `subscription-access` → gateway and settlement path.
3. `topups` + `account` + `customer` → account routes and pages.
4. `models` + `pricing` + `public-catalog` + `routes` → catalog and `/v1/models`.
5. `operations` + `analytics` + `reconciliation` + the remainder.

Server components can `await` directly; client components must reach the data
through a route, not through the store. Each slice re-runs the full suite, the
HTTP suite and the recovery drill before the next starts.

### What is proven, and what is not

**Proven (7/7, real engine):** a reservation inside the available balance records
a hold and does not move credit; a reservation beyond it is refused and writes
nothing; a balance cannot be reserved twice past its available amount; an
existing hold is excluded from availability; a release frees exactly the hold and
happens once; an expired hold quarantines and **keeps its capacity reserved**;
an unexpired hold is left alone.

**Not proven:** the live path. Nothing imports `lib/storage/store/credit.ts` yet —
`lib/store/billing.ts` is still what the gateway calls, so no behaviour changed in
production. Wiring it in is step 5, and it needs the 71 callers.

### Verification Receipt (step 4)

```text
lint=0 typecheck=0 reserve=0 suite=0 quality=0

✔ a reservation inside the available balance records a hold
✔ a reservation beyond the available balance is refused and writes nothing
✔ a balance cannot be reserved twice past its available amount
✔ available credit still excludes an existing hold
✔ a release frees exactly the hold and happens once
✔ an expired hold quarantines and keeps its capacity reserved
✔ a hold that has not expired is left alone

ℹ tests 7  ℹ pass 7  ℹ fail 0
ℹ tests 473  ℹ pass 472  ℹ fail 0  ℹ skipped 1
quality: PASS (400-line ceiling, 381 files scanned)
```

## Implementation — step 4 + 5 cutover, slice 1 (2026-10-31)

### The dialect finding

The cutover plan assumed the flip was "make the store async," with the same
statements running on either backend. It is not, and the difference decides the
shape of everything that follows:

- The store layer's statements are **SQLite dialect**: `datetime(col)` for
  ordering, scalar `MAX(0, x - ?)`, `INSERT OR IGNORE`.
- The ported ledger is **Postgres dialect**: `col::timestamptz`, `GREATEST`,
  `ON CONFLICT DO NOTHING`.

Neither set runs on the other engine. A module therefore cannot be agnostic
between backends, and the cutover cannot be staged one module at a time with
both databases live: a request that touched a flipped module and an unflipped
one would read two different databases. For a credit hold that is not an
inconsistency, it is a double spend.

Two consequences, recorded as decisions:

- **D-14 — one dialect, one engine.** PostgreSQL everywhere. SQLite leaves the
  request path entirely when the cutover completes; it survives only as a
  backup/recovery artifact until FID-058's scripts are re-pointed.
- **D-15 — the local engine is PGlite, not SQLite.** Local development, the
  HTTP suites and the unit tests run the same engine as production, so the
  statements that ship are the statements that were exercised. PGlite is the
  same engine the port's tests already use; it is a single-process database and
  is explicitly refused in production.

### What landed

- `lib/storage/database.ts` — the runtime handle factory. `resolveStorageMode`
  is pure and testable; `createLocalPool` adapts PGlite to the `PgPool` shape by
  reading the caller's intent from whether values were supplied (no values mean
  a script, values mean one parameterised statement — the same distinction the
  adapter already draws); `createStorageDatabase` builds the handle and runs the
  migration *after* `ready()`. It cannot run inside `createPostgresDatabase`'s
  `migrate` callback, because `migrateDatabase` awaits `ready()` and that
  callback is what produces the promise it would be awaiting.
- `lib/storage/runtime.ts` — the lazy single-flight server singleton, plus the
  production guard: with `NODE_ENV=production` and no `DATABASE_URL` it raises
  instead of serving money operations from an in-process database no second
  instance can see.
- `tests/storage-handle.test.mjs` — 8 tests against a real PostgreSQL engine.

### What the tests prove

- Mode selection never silently routes production onto the local engine.
- The handle serves only after the migration has run, and the whole schema is
  present, not just whichever module ran first.
- Re-running the migration changes no row (compared against the database's own
  counts, so the developer seed outside production is not mistaken for
  idempotency drift).
- A reservation round trip works through the runtime entry point: `held_micros`
  moves, `credit_micros` does not, an over-balance reservation is refused rather
  than clamped, and a released hold returns exactly the reserved amount.
- An expired hold quarantines with its capacity still reserved.
- An injected pool is the handle's only connection.

### What is not done, stated plainly

Nothing under `app/` imports `lib/storage/runtime.ts` yet. The application still
runs on SQLite, and the 39 store modules and 73 caller files are still the
synchronous SQLite implementation. This slice is the prerequisite — the handle
and its guard — not the flip. The remaining work lands as one coordinated flip
per dependency cluster (money core, read path, subscriptions, operator surface),
and the tree is only deployable at the end of that sequence, because a partially
flipped tree would run two engines against one ledger.

### Verification Receipt (cutover slice 1)

```text
lint=0 typecheck=0 quality=0 tests=0
lint: eslint . (zero errors, zero warnings)
typecheck: tsc --noEmit (zero errors)
quality: PASS (400-line ceiling, 387 files scanned)
npm test: 500 tests, 499 pass, 0 fail, 1 skipped
storage-handle: 8 tests, 8 pass
```

The single skip remains `tests/settlement-concurrency.test.mjs`, which needs two
real connections and therefore a networked `DATABASE_URL`.

### Slice 2 — the money-core store, ported (2026-10-31)

`lib/store/billing.ts`, `lib/store/reconciliation.ts` and `lib/store/activity.ts`
now have async targets under `lib/storage/store/`:

- **`store/billing.ts`** — account summary, ledger read and grant. Reserve,
  release and quarantine are *re-exported* from `store/credit.ts` rather than
  restated, so the guarded reservation has exactly one implementation and cannot
  drift from the path the gateway will call.
- **`store/activity.ts`** — record, best-effort record, and the filtered read.
- **`store/reconciliation.ts`** — the store-shaped surface over
  `ledger/reconciliation.ts`; it supplies the identifiers and the clock so the
  ledger version stays a pure function of its inputs.

Two behaviours carried over deliberately rather than improved:

1. A summary read quarantines elapsed holds before reading. That is a write on a
   read path, but it is what makes the balance the customer sees converge with
   the holds the gateway believes in.
2. A grant sets an absolute balance computed from a locked read. PostgreSQL
   supplies the lock with `FOR UPDATE` — the guarantee SQLite previously got for
   free by being single-writer, made explicit instead of assumed.

Still no caller flip: `lib/store/*` is untouched and the tree stays green. That
is the point of porting implementations before wiring them — the risky edit is
the one that changes every call site, and it should be a single deliberate step
rather than a side effect of a module port.

### Verification Receipt (cutover slice 2)

```text
lint=0 typecheck=0 quality=0 suite=0
lint: eslint . (0 errors, 0 warnings)
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 390 files scanned)
npm test: 511 tests, 510 pass, 0 fail, 1 skipped
```

Three lint warnings in the new files were fixed by hand, not by `--fix`
(AGENTS.md forbids scripted transforms); `--fix-dry-run` was used read-only to
identify the exact grouping the rule wanted.

### Slice 3 — settings, and the blocker the read path meets (2026-10-31)

`lib/storage/store/settings.ts` is ported. It was chosen first among the read
modules because it is the one statement whose spelling survives the dialect
change unchanged: SQLite's `ON CONFLICT(key) DO UPDATE SET value = excluded.value`
is also PostgreSQL's. Verifying it on the target engine means a later failure in
the read path is known not to originate in the handle, the migration or the
upsert.

**The blocker, found while starting the read path.** `lib/store/shared.ts` opens
with `import "server-only"`, and it owns every projection the read model needs —
`toModelSummary`, `toAdminModelSummary`, `toKeySummary`, `toUsageSummary`,
`toGatewayModel` and `accessFor`. The `server-only` package throws outside a
React server context, so a ported module that imports those functions cannot be
loaded by the Node test runner at all.

The tempting fix is to copy the mappers into `lib/storage/`. That is refused:
AGENTS.md forbids duplicated lookup and formatting helpers, and a second copy of
`accessFor` is a second opinion about which group bills a model — the exact
class of divergence that produces a wrong charge.

The fix that is being taken instead: extract the pure projections and their row
types into a module with no `server-only` import, and have `lib/store/shared.ts`
re-export them. One implementation, importable from both sides, with the server
boundary still enforced where it belongs — at `lib/store.ts` and `lib/db.ts`,
which are the modules a client component must never reach.

### Verification Receipt (cutover slice 3)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 391 files scanned)
npm test: 517 tests, 516 pass, 0 fail, 1 skipped
```

### Slice 4 — the read path opens (2026-10-31)

Two decompositions were required before a single read module could be ported,
and one root cause forced both: `import "server-only"` throws outside a React
server context, so any module carrying it cannot be loaded by the Node test
runner at all.

- **`lib/projections.ts`** now owns the row types and every projection
  (`accessFor`, `toGatewayModel`, `toModelSummary`, `toAdminModelSummary`,
  `toKeySummary`, `toUsageSummary`, `toAdminUsageSummary`).
- **`lib/api-key-crypto.ts`** now owns `generateApiKey` and `hashApiKey`.

`lib/store/shared.ts` and `lib/api-keys.ts` became thin `server-only
re-exports, so there is still exactly **one** implementation of each helper and
the server boundary stays where the application needs it. Copying the helpers
into `lib/storage/` was refused: a second `accessFor` is a second opinion about
which group bills a model.

Also fixed while porting: the new modules import with explicit `.ts`
extensions. Node's ESM resolver does not infer them, and Next.js only tolerates
the omission — the omission is why the first test run failed to load the file
rather than failing an assertion.

**Ported this slice:** `store/keys.ts` (list, create, revoke, authenticate) and
`store/pricing.ts` (`summarizePricing` kept pure, with the stored markup read
separately).

**A pre-existing defect the port surfaced.** `averageMarginBps([])` returns
`NaN`, so an operator catalog with nothing priced renders `NaN%` rather than a
placeholder. This is in the live path today, not introduced by the port. The
test asserts *parity* with the shared helper rather than inventing a number, and
the fix is left as a separate change: silently altering the arithmetic while
moving the storage engine would make the port's own verification meaningless.

### Verification Receipt (cutover slice 4)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 395 files scanned)
npm test: 526 tests, 525 pass, 0 fail, 1 skipped
```

### Slice 5 — the public catalog and its publication gate (2026-10-31)

`lib/storage/store/catalog.ts` and `store/model-sql.ts` are ported. This is the
highest-consequence predicate in the catalog — every row it admits is a row the
gateway must be able to price — so it is also the best-tested one.

The only genuinely semantic translation in the port so far:

```text
julianday(m.cost_observed_at) >= julianday('now', '-N days')
  → m.cost_observed_at::timestamptz >= now() - interval 'N days'
```

`N` is interpolated from a validated integer computed at module load, never from
a request, so the interval cannot be a parameter-smuggling path.

Two deliberately different design choices:

1. **The catalog cache is per handle**, held in a `WeakMap`, instead of one
   module-level cache. The live version can afford a single cache because there
   is one connection for the process lifetime. Here a handle is an argument, and
   a shared cache would let one database's rows answer another database's query —
   which in a test suite means a test passing on a previous test's catalog.
   There is a test for exactly that.
2. **The tests are withhold/publish pairs.** Each guard is shown refusing a row
   *and* admitting the same row once its condition is satisfied. A gate that
   simply hides everything would pass a one-sided test.

**Fixture finding.** The migration seeds the three system groups
(`free`, `paid`, `subscription`) with `ON CONFLICT DO NOTHING`. A fixture that
inserts them again fails with `model_groups_pkey`, not with a missing table, so
future catalog fixtures should rely on the seed.

### Verification Receipt (cutover slice 5)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 397 files scanned)
npm test: 536 tests, 535 pass, 0 fail, 1 skipped
```

### Slice 6 — admin models, routes and usage reads (2026-10-31)

Ported: `store/routes.ts`, `store/models.ts`, `store/model-sync.ts` and
`store/usage.ts` (reads only).

**A ceiling-driven split that landed on a real seam.** `models.ts` came out at
429 lines and the ceiling is 400, so the full-catalog upsert moved to
`model-sync.ts`. That is not just a mechanical cut: `models.ts` now owns reads
and single-row pricing edits, while `model-sync.ts` owns the one operation that
rewrites the catalog wholesale. Keeping them together had hidden how much
destructive power sat beside the admin reads.

**Reuse over restatement.** `routesByGroup` is re-exported from
`lib/route-reconcile.ts` rather than rewritten — it is a pure grouping over rows
the caller already read, with no handle involved, so the port had nothing to
change.

**Deliberate omission.** Only `listUsage` and `listAdminUsage` are ported.
`recordUsage` is the settlement write: it composes the credit debit, the hold
release, the free-pool settle and the subscription settle in one transaction. It
belongs with the gateway cutover. Porting half of it would leave a function that
looks complete and is not, which is exactly the placeholder the non-negotiables
forbid.

Three things the tests found, all worth keeping:

1. **`applyCatalogMarkup` depends on call order.** It reconciles at the end, and
   `reconcileRoutes` re-derives auto sell prices from the *stored* markup. So an
   apply that is not preceded by `saveMarkupBps` is silently undone by its own
   reconcile step. The live path has the same contract; the test now encodes it
   instead of assuming the number it computes survives.
2. **The published id is the plain upstream id.** The incumbent provider
   publishes `m1`, an additional provider publishes `commandcode/m1`. A fixture
   that namespaces *both* leaves the router with no stable candidate, so it
   publishes the winner's id — correct for that input, and the wrong input to
   assert against.
3. **`models_upstream_idx` is unique on `(upstream_slug, upstream_id)`.** Two
   fixture rows sharing both are refused by the index, not by missing columns.

### Verification Receipt (cutover slice 6)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 401 files scanned)
npm test: 547 tests, 546 pass, 0 fail, 1 skipped
```

### Slice 7 — groups and support (2026-10-31)

Ported: `store/groups.ts` and `store/support.ts`.

**A constraint the port had to match, not just translate.** Group labels are
unique by a PostgreSQL index on `lower(label)` (`model_groups_label_key`). The
live check compares labels exactly, so a case-only duplicate would pass the
application check and then fail inside the index with a raw driver error — a 500
to the operator instead of a 409. The ported check asks `lower(label) = lower(?)`,
the same question the constraint answers. The test covers it.

**Group edits move money, so three rules carried over intact:** a system group
keeps its billing mode, a group that a plan includes cannot be deleted, and
moving rows into a free group zeroes their sell prices inside the same
transaction that moves them. A group whose mode changed without its prices
changing would publish a price the gateway does not charge.

**Support ordering is a product rule.** The operator queue lists open requests
first, then by recency; a customer's own history is purely chronological. Both
now take an explicit `::timestamptz` cast, because the stored value is ISO-8601
text and text order only coincidentally matches time order.

### Verification Receipt (cutover slice 7)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 403 files scanned)
npm test: 562 tests, 561 pass, 0 fail, 1 skipped
```

### Slice 8 — plans (2026-10-31)

Ported: `store/plan-rows.ts` and `store/plans.ts`.

**A function that had to become pure.** `toPlanSummary` read subscriber counts
from inside itself, which works when the database handle is a module singleton
and is impossible when the handle is an argument and every read is a promise.
Counts are now passed in. That is not only a porting convenience: a plan summary
is now computable without a database, so its shape can be tested directly.

**Reused, not restated.** `decidePlanActivation`, `readPlanValues` and
expandEntitlementIds` are imported from `lib/plan-sales.ts` and `lib/plans.ts`.
The sales policy is a policy question, not a storage question, and a second copy
would be a second answer to "may this plan be sold".

**A validation rule the test fixture had to learn.** `readPlanValues` requires a
price that is a whole number of cents (`priceMicros % 10_000 === 0`), because
Stripe bills in cents and a sub-cent price would be rounded at checkout — the
customer would be charged something other than the published price. Eight tests
failed on this at once, all from one fixture using 1000 micros. The rule is a
product guarantee, not an inconvenience, so the fixture changed.

### Verification Receipt (cutover slice 8)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
typecheck: tsc --noEmit (0 errors)
quality: PASS (400-line ceiling, 405 files scanned)
npm test: 570 tests, 569 pass, 0 fail, 1 skipped
```

### Slice 9 — settlements and policy acceptance (2026-10-31)

Ported: `store/settlements.ts` and `store/policies.ts`.

Both are **evidence stores**: one records that a call was admitted before it was
dispatched, the other that a customer agreed to a version of the terms. In both
cases the timestamp is the value, so the tests are about preservation rather
than insertion:

- A settlement row is written before dispatch and throws if it cannot be
  stored. Admitting a call whose settlement row did not commit would be a charge
  with no audit trail, so the failure mode is a refused request, not a warning.
- A quarantined hold releases exactly once. The second release returns false, so
  an operator double-click cannot free the same reservation twice.
- A repeat policy acceptance returns the **first** row, keeping the time the
  customer agreed to the version they were shown rather than the time the form
  was resubmitted. `ON CONFLICT (user_id, version) DO NOTHING` is one of the
  statements whose spelling survives the dialect change unchanged.

The settlements store is deliberately thin: the ledger owns every statement, and
this module supplies the call id and the clock, so there is exactly one place a
`stl_` id can be minted.

### Verification Receipt (cutover slice 9)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
quality: PASS (400-line ceiling, 407 files scanned)
npm test: 575 tests, 574 pass, 0 fail, 1 skipped
```

### Slice 10 — the provider registry (2026-10-31)

Ported: `store/providers.ts`, `store/provider.ts`, `store/provider-rows.ts` and
`store/quota.ts`.

The registry decides where a call is sent, so the port had to keep the admission
rules intact rather than merely move the statements:

- A provider with no key configured reports `unconfigured` and **never**
  inherits a stale balance or quota.
- A stale quota observation hides the subscription numbers; a provider claiming
  subscription support without a current quota reports `error` instead of
  looking healthy.
- The default provider cannot be deleted. Deleting another removes its catalog
  rows and re-runs route reconciliation, so a group whose only provider vanished
  is republished or hidden rather than left answering a ghost.
- Usage history is never rewritten. A deleted provider must not erase the record
  of what was already sold.

**Two structural consequences of the port, both forced:**

1. `toStatus` had to become asynchronous, because it consults the quota ledger
   through `effectiveProviderRemaining`. Splitting the pure part out would have
   duplicated the admission logic in two places — the failure this port exists
   to prevent.
2. `providers.ts` crossed the 400-line ceiling, so the row mapping and status
   derivation moved to `provider-rows.ts`. The registry now owns list/read/
   create/update/enable/delete; the row module owns how a stored row becomes a
   record or a status.

**One deliberate partial port.** From `lib/quota-ledger.ts` only
`effectiveProviderRemaining` is ported. The runtime lease claim and completion
belong to the provider runtime, which is its own cutover; porting them now would
leave callers that cannot use them.

### Verification Receipt (cutover slice 10)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
quality: PASS (400-line ceiling, 411 files scanned)
npm test: 582 tests, 581 pass, 0 fail, 1 skipped
```

### Slice 11 — subscription read model and admission (2026-10-31)

Ported: `store/subscription-rows.ts` and `store/subscription-access.ts`.

Subscription admission is the second money path after credit, and the ordering
is the rule: **past-due blocks before free or credit routing**, so a failed
payment cannot keep serving. A model the subscription does not cover returns
`none` rather than a refusal, which lets the caller fall through to free or
credit billing.

Three mechanics carried over intact:

1. Admission takes a hold and increments `weighted_tokens_held` in one
   transaction; settlement moves that hold into `weighted_tokens_used`. The
   allowance therefore cannot be exceeded by requests admitted together.
2. An expired hold is **quarantined**, not silently returned — an elapsed window
   is not evidence that no upstream work happened — reusing
   `ledger/settlements.ts` rather than restating the insert.
3. The snapshot columns are the source of truth for price and allowance. Editing
   a plan changes future checkouts only, so a summary never joins `plans` for a
   price.

Dialect notes: `MAX(0, x - ?)` became `GREATEST(0, x - ?)` (PostgreSQL `MAX` is
an aggregate, so the scalar habit would change the statement's shape rather than
its arithmetic), and every `datetime(col)` ordering became an explicit
`::timestamptz` cast.

`toSubscriptionSummary` became asynchronous because it composes the open period,
the entitlement count and the recent invoices — the same structural consequence
as `toPlanSummary`, and for the same reason: the handle is an argument.

### Verification Receipt (cutover slice 11)

```text
lint=0 typecheck=0 quality=0 suite=0
lint warnings: 0
quality: PASS (400-line ceiling, 413 files scanned)
npm test: 592 tests, 591 pass, 0 fail, 1 skipped
```

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/db-adapter.test.mjs
- gate: test tests/settlement-concurrency.test.mjs
- gate: test tests/settlement-recovery.test.mjs
- gate: test tests/schema-migration.test.mjs
- gate: test tests/production-config.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- **not applicable yet** — status is `converged`; no application code was changed
  by this record. The receipt is written at closure against the commit that
  carries the port.

## Perfection Loop

### Loop 1 — RED

- **RED:** The ruling conflicts with a decision made the day before
  (`docs/hosting-decision.md`, 2026-10-30), so shipping this without superseding
  that record would leave two contradictory authorities. Measured: 323 statement
  calls, 47 transaction wrappers, 37 write locks, 44 importing files, 532
  exported functions, 54 handlers, 40 tables. Semantics — not syntax — change at
  three points: `.immediate()` has no Postgres equivalent; `datetime()` string
  comparison becomes `timestamptz`; and `INSERT OR IGNORE`/`ON CONFLICT` need
  explicit targets.
- **GREEN:** D-1…D-12 choose the robust default at each: Postgres over libSQL
  because the objection is topology; Launch over Free because Free suspends
  compute mid-month and cannot disable scale-to-zero; database-backed admission
  because a money gateway with two instances and a process-local limiter
  multiplies against its upstream account; a conditional update **and** a row
  lock because either alone leaves a path where a hold is admitted twice.
- **AUDIT:** Method 1 — `grep -ro` census on `224dfab`, reproduced in Evidence.
  Method 2 — re-read `lib/db.ts` (0-EOF), `lib/schema/columns.ts`,
  `docs/hosting-decision.md` (0-EOF), `docs/database-options.md` (0-EOF), and
  FID-2026-1030-066 (0-EOF). The vendor rates were read from the two Neon pages
  on 2026-10-31, not remembered.
- **ADVERSARIAL:** "You rejected this port yesterday for 103 files and 301 call
  sites." Answer: yesterday's reason was cost-avoidance on a host decision; the
  operator has now ruled the topology itself unacceptable, which removes the
  premise. The cost has not shrunk — it has grown to ~63 dialect rewrites — and
  this FID states that rather than implying the port is cheap.
- **CHANGE DELTA:** n/a — first pass.

### Missed Questions

1. *Is the objection performance?* No. The measured 229.84 rps / p95 137.53 ms
   stands; the objection is availability and recovery. Recorded so nobody later
   "solves" this with a faster file.
2. *Does Postgres fix the single-writer rate limiter?* Yes, and that is a gain
   over libSQL, which is why D-5 is in this FID rather than a later one.
3. *Can the app stay on Fly?* Yes. The host was never the constraint; the
   database topology was.
4. *Does the 30-day retention claim survive?* Not on Launch's native PITR (7
   days). D-6 meets it with retained snapshots plus off-site dumps, or Scale.
5. *What happens to the existing database file?* One read-only export during
   cutover: dump rows, import, reconcile balances against the ledger equation
   before switching. The file is retained as a sealed snapshot, never the live
   source after cutover.
6. *Do the 56 test files keep isolating?* They must create per-file schemas or
   databases; a shared database would make them order-dependent.
7. *What if the port stalls mid-way?* Steps 1–4 land behind the adapter with
   their tests before any caller changes, and `better-sqlite3` leaves only in
   step 8, so a partial port is not shippable and the revert is one commit.
8. *Is $300 enough?* It does not need to be. It is provider inventory, not
   infrastructure. Infrastructure is ~$23.74/mo, ~$118/mo of paid revenue at the
   measured 20.2% margin clears it.
9. *What about payment fees?* Stripe/NOWPayments fees are per-transaction and
   are already inside the margin discussion in `docs/business-model.md`; they are
   not part of the $23.74.

### Loop 2 — Independent audit and self-correction

- **RED:** (a) A partial port that compiles — some modules async, some not — is
  reachable because TypeScript does not force `await`. (b) Removing the only
  working driver leaves no rollback if the port stalls. (c) The admission
  change (D-5) adds a database round trip to every request, which erodes the
  measured rps envelope and must not be discovered after launch.
- **GREEN:** (a) `no-floating-promises` becomes a lint gate over `lib/**`, and
  the adapter's `run()` resolves to `{ changes }` so a forgotten `await` fails
  typecheck wherever the result is consumed. (b) Step 8 is the only commit that
  touches `package.json`; the adapter keeps the old call shape so the revert is
  cheap. (c) Step 6 measures admission latency and the load suite re-runs before
  the envelope is claimed again.
- **AUDIT:** Every step names the test that proves it, and every promised test
  path exists in `tests/*.test.mjs` or is created by step 8's commit.
- **ADVERSARIAL:** "You are trading a measured, working system for an unmeasured
  one days before launch." True, and it is the operator's ruled trade: a
  single-node money store is an unacceptable risk to them. The mitigation is the
  ordered port with receipts, not an argument that the risk does not exist.
- **CHANGE DELTA:** ~8% (added D-12, the break-even arithmetic and Loop 2).

### Loop 3 — Final convergence

- **RED:** Residual risks stated rather than hidden: Neon is a new operational
  dependency and a new outage surface; capacity is untested from the deploy
  region; the 0.25 CU floor may be too small for the settlement write rate; the
  provider's connection limits interact with the pool size; and the port is the
  largest single change in the repository's history.
- **GREEN:** Each has a named step that proves or refutes it (0, 6, 9), and the
  pre-port gate is the double-spend test, which is the one thing that must be
  right.
- **AUDIT:** No verification claim in this document lacks tool output; the status
  is `converged`, not `fixed`; every step has an owner (the implementing agent)
  and a proof.
- **ADVERSARIAL:** The strongest remaining objection is sequencing: the port
  competes with launch work for the same days. Recorded as the operator's
  decision, not resolved here.
- **CHANGE DELTA:** ~3%.

## Resolution

- **Status note (2026-10-31):** Operator ruling — production accounting will not
  run on a single SQLite file. `docs/hosting-decision.md` is superseded for the
  data layer while remaining the record of the current deployable topology until
  the port lands. Target: Neon Postgres, Launch plan, ~$23.74/mo total
  infrastructure with the existing Fly machine. Free plan is development only.
- **Closed Date:** —
- **Fix Description:** Steps 1–4 (partial) implemented 2026-10-31. Step 3
  complete: settlements, payments, trials, allocations and reconciliation all
  ported to the async handle under `lib/storage/ledger/` (36 tests on a real
  engine). Step 4: the
  credit reserve path ported to `lib/storage/store/credit.ts` with the
  reservation guard as a conditional `UPDATE`, composing with `debitCredit`;
  not wired, because the store flip and the 71 callers are one cutover.
  Step 1:
  `lib/storage/pg-adapter.ts` and `lib/storage/pg-pool.ts` (async
  statement/transaction layer, savepoint reentrancy, lazy single-flight init,
  server-side session timeouts). Step 2: the 19 SQLite schema modules ported to
  seven modules under `lib/storage/schema/` (1,188 lines) plus the ordered,
  transaction-wrapped migration. Step 3 (partial): `lib/storage/ledger/` with the
  settlement ledger and the payment-event state machine ported to the async
  handle, including the single-statement `debitCredit` guard. `pg`, `@types/pg`
  and `@electric-sql/pglite` (dev) added as dependencies. The ported DDL now
  parses and executes against a real PostgreSQL engine, which found and fixed
  two latent ordering bugs. No call site changed and nothing in `app/` imports
  the new  layer yet — the application still runs on SQLite. Trials, allocation
  and reconciliation remain, and the two-connection race has not run.
  Step 3 completed 2026-10-31 (trials, allocations, reconciliation). Cutover
  slice 1 landed: `lib/storage/database.ts` (runtime handle factory) and
  `lib/storage/runtime.ts` (lazy singleton with a production guard refusing the
  local engine), after establishing that the port is a dialect change and not a
  driver change (D-14, D-15). No app code imports it yet.
- **Tests Added:** `tests/db-adapter.test.mjs` (15, fake pool),
  `tests/schema-postgres.test.mjs` (8, parity and invariants),
  `tests/ledger-postgres.test.mjs` (17, real PostgreSQL via PGlite), and
  `tests/settlement-concurrency.test.mjs` (1, two real connections, **skipped**
  until `DATABASE_URL` exists), plus `tests/trials-allocation-postgres.test.mjs`
  (10), `tests/reconciliation-postgres.test.mjs` (9),
  `tests/credit-reserve-postgres.test.mjs` (7) and
  `tests/storage-handle.test.mjs` (8), all against a real PostgreSQL engine.
- **Verification Evidence:** `lint` 0, `typecheck` 0, `test` 0 with 500 tests /
  499 pass / 1 skipped, `quality` PASS (387 files), pasted in the step receipts
  above.
- **Archived:** —

## Lessons Learned

The previous decision was correct on its own terms and still produced the wrong
outcome, because it optimized for port cost against a topology the operator had
never agreed to. Cost-of-change is a legitimate input only after the requirement
is settled; used before, it decides the requirement by default. The second
lesson is accounting: provider deposits are inventory, not burn. A $300
"budget" that converts into sellable inference does not constrain infrastructure
at all — so the question was never "can we afford Postgres," it was "$23.74/mo
against ~$118/mo of break-even revenue," which is a different and much easier
conversation.
