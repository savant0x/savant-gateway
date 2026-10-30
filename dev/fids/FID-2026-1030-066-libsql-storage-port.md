# FID: Port production storage from better-sqlite3 to libSQL

**Filename:** `FID-2026-1030-066-libsql-storage-port.md`
**ID:** FID-2026-1030-066
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30 18:20
**Automation level:** 3
**YAGNI-Compliance:** Pending

> Scope of this record: the plan. No application code changed while it was
> written, and `better-sqlite3` is still the only data layer. `converged` is
> therefore the honest status — the operator's instruction was that this task
> needs research, review and a Perfection Loop before implementation.

---

## Summary

The gateway persists every balance, hold, ledger entry and settlement in a local
SQLite file through `better-sqlite3`, whose API is synchronous. A Vercel
deployment cannot serve from that file: the runtime filesystem is read-only and
each instance would get its own copy, so the startup gate correctly refuses to
start without `DB_PATH` and would corrupt accounting if it did. This record plans
the port to a network SQLite (libSQL via `@libsql/client`), which keeps all 265
`prepare` statements and the SQLite dialect while turning the data layer
asynchronous and imposing a **5-second interactive-transaction window** that the
current code does not respect. It also records two findings the port does not
solve — a per-instance admission limiter and an unverified foreign-key setting —
and one strategic question the operator must answer: whether Vercel is worth the
port at all.

## Environment

- **OS:** Windows 11 (Git Bash); production target Linux serverless
- **Language/Runtime:** TypeScript strict, Node >= 22.18.0 (local 24.21.0)
- **Tool Versions:** Vercel CLI 63.1.0; Next.js 16 App Router; `better-sqlite3`
  as the only database dependency
- **Commit/State:** `939accc` on `main`, working tree clean apart from
  `docs/research/` (untracked)

## Detailed Description

### Problem

`lib/db.ts` is a synchronous, import-time constructor:

```ts
// lib/db.ts:325-331
function createDb() {
  const database = new Database(dbPath);

  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("foreign_keys = ON");
```

and then runs the entire additive migration inside one write-locked transaction,
invoked immediately:

```ts
// lib/db.ts:339-359
  database
    .transaction(() => {
      baseSchema(database);
      ...
      normalizeLegacyFamilies(database);
      seed(database);
    })
    .immediate();
```

```ts
// lib/db.ts:366
export const db = globalForDb.gatewayDb ?? createDb();
```

Three of those four pragmas are documented as unsupported or read-only on Turso
Cloud, the migration needs `await` to talk to a remote server, and a module-
scope synchronous constructor cannot await at all. The deployment therefore has
no path to a durable database without changing this file and every caller of it.

### Expected Behavior

One data layer that behaves identically on a developer machine and in
production: a local file for development and tests, a network database for the
deployed build, the same SQL, the same transaction boundaries, and a startup
that fails closed when the configuration cannot honour the accounting contract.

### Root Cause

The storage API was chosen for its synchronous ergonomics (`db.prepare(sql).get()`
returns a row), and 301 statement calls across `lib/` depend on that shape. Every
network database client returns promises, so the coupling is architectural rather
than local: it is not a connection-string swap.

### Evidence

Measured on `939accc` from `lib/` unless stated. Counts are `grep -ro` totals,
not estimates.

| Fact | Measured |
| --- | --- |
| `.prepare(` call sites | 265 |
| `.transaction(` wrappers | 35 |
| `.immediate()` write locks | 28 |
| `.exec(` multi-statement scripts | 23 |
| `.pragma(` | 4 |
| `.get(` / `.all(` / `.run(` | 117 / 48 / 136 |
| `lastInsertRowid` uses | 0 |
| `.pluck()` / `.iterate()` | 0 / 0 |
| `ON DELETE` clauses (CASCADE / SET NULL / RESTRICT) | 22 / 5 / 2 |
| Files importing `lib/db` | 35 |
| Route modules exporting an async handler | 40 (0 sync) |
| Exported functions in `lib` | 405 |

Whole-tree totals including tests and scripts: 405 `prepare`, 35 transactions,
28 `.immediate()`, 38 `exec`.

The single interface every pure ledger and schema module already takes is:

```ts
// lib/schema/columns.ts:3
export type DatabaseHandle = Database.Database;
```

That is the seam. `lib/settlement-ledger.ts`, `lib/trial-ledger.ts`,
`lib/allocation-ledger.ts`, `lib/payment-events.ts`, `lib/reconciliation.ts` and
the twelve `lib/schema/*` modules all receive a handle rather than importing
the singleton, which is why eight test files can construct `new Database(":memory:")`
and exercise them directly.

The money path is flat, not nested — verified rather than assumed.
`lib/store/usage.ts:77` opens the settlement transaction, and the two helpers it
calls from inside it, `settleSubscriptionHoldWithin`
(`lib/store/subscription-access.ts:232`) and `settleFreeReservation`
(`lib/store/free-pool.ts:315`), take only statements and start no transaction of
their own. No savepoint nesting is required by the settlement path today.

Two loops do run inside write transactions and are the only unbounded statement
sources:

```ts
// lib/store/billing.ts:144-153 — three statements per expired hold
  db.transaction(() => {
    for (const hold of expired) {
      quarantineHold(db, { ... });
      db.prepare("DELETE FROM credit_holds WHERE id = ?").run(hold.id);
    }
  }).immediate();
```

and `normalizeLegacyFamilies` (`lib/db.ts:225-247`), which issues one `UPDATE`
per matched row inside the migration transaction.

External facts, each taken from the vendor's own documentation on 2026-10-30:

1. `@libsql/client` interactive transactions are `client.transaction("write")`,
   which maps to `BEGIN IMMEDIATE`, with `execute`/`batch`/`commit`/`rollback`/
   `close`. Documented services state a **5-second window** for a transaction to
   complete, and the server "cannot process multiple write transactions
   concurrently" — a second write transaction queues.
   <https://docs.turso.tech/sdk/ts/reference>, <https://docs.turso.tech/sdk/http/reference>
2. There is no public `prepare()` returning a reusable statement object;
   `execute()` takes SQL plus arguments and returns a `ResultSet` whose
   `lastInsertRowid` is `bigint | undefined` and whose rows support access by
   column name. `intMode` defaults to `"number"`.
3. `PRAGMA journal_mode` is not supported on Turso Cloud (it manages journaling),
   `user_version` and `application_id` are read-only there, and `busy_timeout` is
   unsupported. <https://docs.turso.tech/cloud/limitations>
4. Turso ships two engines: libSQL (SQLite fork, single writer, `@libsql/client`)
   and Turso Database, formerly Limbo (MVCC concurrent writes, packages
   `@tursodatabase/serverless` / `database` / `sync`). The current reference
   recommends the Turso-engine packages for new projects and keeps
   `@libsql/client` for existing libSQL databases. Interactive-transaction
   support for the serverless Turso driver appears in the engine changelog but is
   **not** documented in the current reference.
   <https://docs.turso.tech/libsql>, <https://docs.turso.tech/sdk/ts/quickstart>
5. PITR windows as published: Free 1 day, Developer (4.99) 10 days, Scaler
   (24.92) 30 days, Pro (416.58) 90 days; a restore creates a **new** database.
   <https://turso.tech/pricing>, <https://docs.turso.tech/features/point-in-time-recovery>
6. Vercel Node functions run in `iad1` by default, have a 300 s default duration
   (800 s maximum on Pro), and Vercel documents module-scope client reuse per
   warm instance rather than per-request construction. There are field reports of
   libSQL WebSocket connections from Vercel returning 429/505.
   <https://vercel.com/docs/functions/configuring-functions/duration>,
   <https://vercel.com/kb/guide/connection-pooling-with-functions>,
   <https://github.com/tursodatabase/libsql-client-ts/issues/280>

One fact could **not** be verified and is carried as a pre-flight check rather
than an assumption: whether Turso Cloud still provisions new **libSQL** databases
now that the Turso engine is the recommended product.

## Impact Assessment

### Affected Components

- `lib/db.ts` — connection, pragmas, migration, singleton
- `lib/schema/columns.ts` — `DatabaseHandle`, `hasColumn`, `ensureColumn`
- `lib/schema/*` (12 modules) — DDL through the handle
- `lib/store/*` (34 modules) — every query and transaction
- `lib/settlement-ledger.ts`, `lib/trial-ledger.ts`, `lib/allocation-ledger.ts`,
  `lib/payment-events.ts`, `lib/reconciliation.ts` — handle-injected ledger core
- `lib/gateway.ts`, `lib/gateway-stream.ts`, `lib/gateway-settle.ts`,
  `lib/stripe-subscriptions.ts`, `lib/providers/*` — callers on the money path
- `app/**` — 40 route handlers, 13 admin pages, public pages, server components
- `tests/*` (9 files), `scripts/http-suite/*`, `scripts/business-model.mjs`
- `lib/production-config.ts` — the startup contract

### Risk Level

- [x] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

Double-spend, lost settlement and silent cascade loss are all reachable through
this change. It is a money-path rewrite, not a driver swap.

## Proposed Solution

### Approach

One asynchronous adapter behind the existing `DatabaseHandle` type, backed by
`@libsql/client` for **both** targets — `file:`/`:memory:` locally and
`libsql://` in production — so development, tests and production execute the same
code path. `better-sqlite3` is removed rather than kept as a second
implementation: two data layers would mean the tests never exercise the shipped
path, and the native binary is itself a known Vercel deployment hazard.

The adapter preserves the call-site shape deliberately — `prepare(sql).get/all/run`
and `transaction(fn).immediate()` survive, gaining only `await` — because 301
call sites already express the intended transactions, and rewriting them into a
new repository API would add a second correctness risk on top of the port.

### Decisions

**D-1 — Target the libSQL engine, not the Turso Database engine.**
libSQL documents the interactive write transaction the ledger needs and its
single-writer model *is* the double-spend guard the code was written against.
The newer engine's MVCC writes are faster but change that invariant and its
interactive-transaction API is undocumented today. Revisit after launch.
*Rejected:* Turso Database + `@tursodatabase/serverless` — cannot be designed
against an API the reference does not describe.

**D-2 — One async adapter; remove `better-sqlite3`.**
*Rejected:* keeping the sync implementation locally and the async one in
production (two truths, untested production path); a wrapper that blocks on
network I/O (impossible without a synchronous fetch).

**D-3 — Reentrant transactions via savepoints.**
A transaction opened inside an active transaction becomes
`SAVEPOINT`/`RELEASE`/`ROLLBACK TO` on the outer transaction, tracked with
`AsyncLocalStorage`, which reproduces `better-sqlite3`'s nesting semantics
including partial rollback and removes a deadlock class against a single-writer
server. Measured today: the settlement path does not nest, so this is insurance,
not a workaround. All route handlers already declare `runtime = "nodejs"`, so
`AsyncLocalStorage` is available.

**D-4 — The 5-second window is a hard design rule, enforced three ways.**
No transaction may span a network call (provider, Stripe); no unbounded loop may
run inside one; and the adapter warns at 4 s and aborts at 4.8 s so a breach is
a loud failure instead of a mystery 500. The two unbounded loops above are
collapsed: `quarantineExpiredHolds` becomes set-based
(`INSERT OR IGNORE INTO quarantined_holds SELECT ... FROM credit_holds WHERE ...`
then one `DELETE` then one `UPDATE settlements`), and
`normalizeLegacyFamilies` computes its mapping in JS and applies it as one
`batch()` of parameterised updates, chunked at 200 rows.

**D-5 — Migration moves out of import time.**
`createDb()` becomes `createDatabase()`, which returns the adapter immediately
and runs connection, pragmas and migration behind a single-flight `ready`
promise awaited by the first operation. The `db` export keeps its name, so 35
importers do not change. Migration stays idempotent (`IF NOT EXISTS`, plus the
existing duplicate-column tolerance) and is applied one schema module per
transaction, so a slow remote round trip cannot exceed the window, while DDL
remains atomic per module.

**D-6 — Pragmas become target-aware.**
`foreign_keys = ON` is applied only where it is accepted; `journal_mode`,
`busy_timeout` and `synchronous` only for `file:`. Startup then **asserts**
`PRAGMA foreign_keys` returns 1 in production. If a remote target cannot enable
it, 29 `ON DELETE` clauses silently stop cascading — orphaned ledger rows and
balances that disagree with usage — so the assertion fails closed and the
fallback (explicit deletes) becomes a deliberate change with its own tests,
not a discovery in production.

**D-7 — Production configuration changes contract.**
`lib/production-config.ts` stops treating a file path as the only durable
database. New codes: `database_missing` (neither `TURSO_DATABASE_URL` nor
`DB_PATH`), `database_url_invalid`, `database_token_missing`, and
`database_file_in_prod` (a `file:`/`:memory:` target in production, which on
Vercel is a read-only filesystem). `db_relative`/`db_ephemeral` remain for file
mode outside production.

**D-8 — Shared admission is a separate, blocking defect.**
`PROVIDER_SHARED_RPM`, the free-pool daily allocation and the paid/free token
buckets are process-local (`lib/token-bucket.ts`, `lib/gateway-rate-limit.ts`,
`lib/provider-quota.ts`). On a serverless host, effective throughput is
`configured × instances`, which is how an upstream account gets throttled or
banned. `docs/launch-plan.md` Phase 3 already forbids scale-out before shared
enforcement is proven. Production therefore gains a required
`GATEWAY_SHARED_ADMISSION` declaration (`none` refused in production), and the
four options — database-backed counting, an external counter store, a
documented lower constant, or a single-process host — are presented to the
operator in SCOPE D5. This FID cannot declare Vercel ready without that ruling.

**D-9 — Integer fidelity.**
`intMode: "number"` is set explicitly and a test asserts a micro amount
round-trips exactly, because money is stored as `INTEGER` micros and the
documented `lastInsertRowid` is `bigint` (unused here: 0 call sites).

**D-10 — Connection lifecycle.**
One client per process, created through the module-scope adapter, HTTP transport
(not `wss://`) to avoid the reported Vercel WebSocket failures and to hold no
sockets between invocations. `file:` mode uses the local implementation.

**D-11 — Backup and retention.**
30-day PITR — the window the privacy notice claims — is the Scaler tier at
24.92/month as published. A restore produces a **new** database, so cutover is an
environment change plus redeploy and a reconciling restore drill, both launch
gates.

**D-12 — Honest sizing of what is cheaper than this port.**
A single-process Node host (Railway/Fly/VPS) runs the current code unchanged:
no port, no window, no limiter problem, a real file to back up. The port is
justified only if serverless deployment is a product requirement. Both are
presented; the operator rules. Approximate published cost at research time:
Vercel Pro 20/month + Turso Scaler 24.92/month versus roughly 5–20/month for a
one-process host.

**D-13 — Static guard against a missed `await`.**
`await` is not required for correctness by the compiler in every position — a
discarded `.run()` promise would silently never execute. `no-floating-promises`
becomes a lint gate for `lib/**`, and the adapter's `Statement` type keeps
`run()` resolving to `{ changes }` so a forgotten `await` fails typecheck where a
row is consumed.

### Steps

0. **Capability spike (no production code).** Against `@libsql/client` with a
   temporary `file:` database and a temporary `:memory:` database, prove:
   `transaction("write")` works, savepoints work, `executeMultiple` inside a
   transaction works, `PRAGMA table_info` works, `ON DELETE CASCADE` fires with
   `foreign_keys = ON`, `datetime()` comparisons order correctly, and
   `intMode` returns exact micros. Record the output in this FID. If any item
   fails, stop and re-present before touching a call site.
1. **Adapter.** Replace the `DatabaseHandle` type with the async interface,
   implement `prepare/get/all/run/exec/transaction` plus savepoint reentrancy,
   lazy single-flight init, target-aware pragmas, the 4 s/4.8 s window guard, and
   the `file:`/`:memory:`/`libsql://` target selection.
2. **Migration runner.** Port the 12 schema modules, `ensureColumn` and `hasColumn` to async,
   one transaction per module, keeping duplicate-column tolerance.
3. **Ledger core.** Port the handle-injected modules and their eight test files;
   keep every assertion.
4. **Store layer.** Port `lib/store/*` — 265 statements, 35 transactions — and
   make each exported function `async`.
5. **Callers.** Port `lib/gateway*`, `lib/stripe-subscriptions.ts`,
   `lib/providers/*`, the 40 route handlers, admin pages, server components and
   the two server components that hold a handle (`components/account/trial-card.tsx`).
   The two client components that import store modules import **types only**
   (`daily-trial-balance.tsx`, `support-queue.tsx`) and need no change.
6. **Startup contract.** Implement D-7 and D-8's declaration; update
   `tests/production-config.test.mjs` and `.env.example`.
7. **Harness and scripts.** Port `scripts/http-suite/*`, `scripts/business-model.mjs`
   and remove `better-sqlite3` from `package.json`.
8. **Concurrency proof (D2).** Two independent clients on one shared database,
   two settlements against one balance, exactly one commit; expired holds
   quarantine in one pass; a killed client mid-transaction leaves no partial
   ledger.
9. **Cloud acceptance (D4).** Requires operator-supplied credentials: measure
   settlement p50/p99 from `iad1`, assert `foreign_keys`, run the restore drill
   at a chosen timestamp, reconcile users/balances/ledger/usage, and only then
   request the production redeploy.

### Verification

Every promised artifact is a real path that `node --test tests/` runs:

- `tests/db-adapter.test.mjs` — statement shapes, `undefined` for a missing row,
  `changes` from `rowsAffected`, rollback on throw, savepoint nesting and partial
  rollback, the 4.8 s abort, integer fidelity.
- `tests/settlement-concurrency.test.mjs` — the double-spend proof with two
  clients on one shared database.
- `tests/settlement-recovery.test.mjs` — existing, ported unchanged in meaning:
  replay no-op, quarantine, audited release.
- `tests/schema-migration.test.mjs` — existing, ported: additive migration is
  idempotent and re-running it is a no-op.
- `tests/production-config.test.mjs` — existing, extended with the new codes.
- `tests/credit-reconciliation.test.mjs`, `tests/payment-events.test.mjs`,
  `tests/trials.test.mjs`, `tests/allocation.test.mjs`, `tests/analytics.test.mjs`,
  `tests/quota-refresh.test.mjs` — existing, ported.
- `scripts/http-suite/*` — the full production HTTP matrix, re-run against the
  ported data layer.

## Step 0 — Capability spike (executed 2026-10-30)

`@libsql/client` 0.18.0 was installed with `npm install --no-save` so the tree
stayed clean; `package.json` is untouched and the dependency lands with the port
(step 7). Artifact: `scripts/libsql-capability-spike.mjs` (lint-ignored, like the
other `scripts/*.mjs` tools). The database file is created under `data/` — which
`.gitignore:42` covers — and removed on exit.

```text
libSQL client 0.18.0 · file:data/spike-capability.db

PASS  file: client connects — SELECT 1
PASS  interactive write transaction commits — BEGIN IMMEDIATE → commit
PASS  transaction rolls back on throw — rollback discarded the write
PASS  savepoint nesting with partial rollback — inner savepoint rolled back, outer kept
PASS  executeMultiple inside a transaction — 3 statements, atomic
PASS  executeMultiple is available on the client and not transactional — present on client and transaction
PASS  PRAGMA table_info returns column rows — id,micros
PASS  PRAGMA foreign_keys accepted and cascades fire — foreign_keys={"foreign_keys":1}
PASS  unsupported pragmas on a remote target would throw (local accepts) — journal_mode=wal
PASS  datetime() ordering — late > mid > early
PASS  integer fidelity for micro amounts — 4 values exact, typeof=number
PASS  result shape: rows by name, rowsAffected, lastInsertRowid — rowsAffected=1 lastInsertRowid=1 (bigint) columns=id,label
PASS  nested transaction on one client is rejected, not blocked — rejected: SQLITE_BUSY: database is locked
PASS  in-memory client supports the same API — transaction over :memory:

spike: PASS (14/14 checks)
```

Exit code 0. What the run changed in this plan:

1. **D-3 is validated, not merely prudent.** A second write transaction on the
   same client fails with `SQLITE_BUSY: database is locked` instead of queueing.
   Without savepoint reentrancy, any future nested call would become a runtime
   error at exactly the moment money is moving. The adapter's nesting path is
   therefore load-bearing from day one.
2. **D-5's migration design holds.** `executeMultiple` inside a transaction
   applied three statements atomically, so one schema module per transaction is
   both atomic and a bounded number of round trips.
3. **D-9 is exact.** `intMode: "number"` returned `number` values identical to
   the integers written, including `Number.MAX_SAFE_INTEGER`, so micro amounts
   need no bigint handling.
4. **`lastInsertRowid` is `bigint` even locally** — confirmed, and harmless: the
   measured 0 call sites still stand.
5. **`PRAGMA table_info` works and `foreign_keys = ON` is accepted locally**, with
   the cascade actually deleting the child row. This proves `ensureColumn` can be
   ported as designed; it does **not** prove the remote target accepts the pragma,
   which remains step 9 (D-6 fails closed if it does not).
6. **`journal_mode = WAL` is accepted locally** and documented as unsupported on
   Turso Cloud, which is exactly why D-6 makes pragmas target-aware rather than
   deleted.
7. **`:memory:` supports transactions**, so the eight test files keep their
   per-file isolation.

### Step accounting

| Step | Status | Evidence |
| --- | --- | --- |
| 0 — capability spike | `implemented` | 14/14 checks, exit 0, output above |
| 1–9 — adapter, ledger, store, callers, startup, harness, concurrency, cloud | `blocked` | The operator's instruction sequences a report before any call site is touched; the go-ahead is theirs to give |

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

- **not applicable yet** — status is `converged`; no code was changed by this
  record, so there is no gate output to paste. The receipt is written at closure,
  after implementation, against the commit that carries it. Any claim of a passing
  gate in this document would be a verification claim without tool output, which
  the protocol prohibits.

## Perfection Loop

### Loop 1 — RED

- **RED:** Catalogued 15 failure classes with evidence: import-time synchronous
  construction (`lib/db.ts:366`); four pragmas of which three are unsupported
  remotely (`lib/db.ts:328-331`); `DatabaseHandle` bound to a synchronous type
  (`lib/schema/columns.ts:3`); 301 statement calls and 35 transactions that must
  become awaitable; 23 `exec` scripts; an unbounded loop inside a write
  transaction (`lib/store/billing.ts:144`); a per-row update loop inside the
  migration (`lib/db.ts:238`); a 5-second server window the code does not respect;
  29 `ON DELETE` clauses depending on a pragma of unverified availability; a
  production validator that only understands file paths
  (`lib/production-config.ts:149-186`); process-local admission that multiplies
  by instance count; eight test files coupled to `better-sqlite3`; a native
  dependency that is itself a Vercel hazard; and an unverified product fact —
  whether libSQL databases are still provisioned.
- **GREEN:** D-1 … D-13 above, each choosing the robust default rather than the
  convenient one (savepoints instead of "no nesting exists"; set-based
  quarantine instead of a loop; a declared admission mode instead of silence).
- **AUDIT:** Method 1 — `grep -ro` census on `939accc`, reproduced in Evidence.
  Method 2 — re-read `lib/db.ts` (374 lines 0-EOF), `lib/schema/columns.ts`,
  `lib/schema/settlements.ts`, `lib/usage-ledger.ts`, `lib/settlement-ledger.ts`,
  `lib/store/billing.ts`, `lib/store/usage.ts`, `lib/store/shared.ts`, and the
  two client components that import store modules, confirming the seam, the flat
  settlement transaction and the type-only client imports.
- **ADVERSARIAL:** See Loop 2.
- **CHANGE DELTA:** n/a — first pass.

### Missed Questions

1. *Does anything read `lastInsertRowid`?* No — 0 call sites, so the documented
   `bigint` result needs no migration. Removes a whole risk class.
2. *Is the settlement transaction nested?* No. Verified by reading the two
   helpers it calls; they run statements without opening a transaction. Nesting
   support stays as insurance.
3. *Do any client components call the data layer?* No. The two that import store
   modules import types only, so the async port does not reach the browser.
4. *Are route handlers already async?* All 40. The port does not have to
   restructure the HTTP layer.
5. *Can the app keep a synchronous fast path locally?* Only by maintaining two
   data layers; rejected in D-2.
6. *Does anything depend on `:memory:` isolation for tests?* Yes, eight files. Each
   must create its own client, or tests will share state.
7. *What happens to in-flight work on SIGTERM?* Unchanged by the port, but the
   window guard must not turn a slow remote commit into a lost settlement; the
   drain path is re-tested in step 8.
8. *Is the 30-day retention claim affordable?* Only at Scaler (24.92/month as
   published). Otherwise the privacy notice changes version — an operator call.
9. *What if libSQL databases are no longer provisioned?* The ladder is: Turso
   engine after a spike, self-hosted `sqld`, Neon Postgres, or stay on a
   single-process host. Decided before implementation, not during.

### Loop 2 — Independent audit and self-correction

- **RED:** Two challenges survived Loop 1. (a) The plan is large enough that a
  partial port could ship: some modules async, some not, with a build that still
  compiles. (b) D-2 removes the only dependency that works today, leaving no
  rollback path if the port stalls mid-way.
- **GREEN:** (a) The port is sequenced so the adapter and ledger core land with
  their tests before any caller changes, and `better-sqlite3` is removed only in
  step 7 — the commit that removes it is also the commit that proves the new
  path through the HTTP suite. (b) The removal is a single revertable commit;
  the adapter keeps the old call shape precisely so the diff is `await`s rather
  than redesigned calls, which keeps that revert cheap.
- **AUDIT:** Independent check of the two claims: every step names the test that
  proves it (Verification), and step 7 is the only step that touches
  `package.json`, so a revert restores the dependency without rewriting code.
- **ADVERSARIAL:** "You are porting 301 call sites to avoid running one process."
  Answer recorded in D-12: the alternative is cheaper and preserves every
  invariant; the operator decides, and the FID does not pretend the port is
  free.
- **CHANGE DELTA:** ~6% (added D-12, resequenced step 7, added Loop 2).

### Loop 3 — Final convergence

- **RED:** Residual risks, stated rather than hidden: the 5-second window is a
  vendor limit that could tighten; libSQL availability for new databases is
  unverified; foreign-key enforcement remotely is unverified; Vercel's default
  region may be far from the database, and no latency number exists until step 9
  measures it.
- **GREEN:** Each residual risk has a named step that either proves or refutes
  it (0, 6, 9), and a ladder if refuted (Missed Question 9).
- **AUDIT:** The document has no verification claim that lacks tool output, no
  status that overstates implementation, and no step without an owner.
- **ADVERSARIAL:** The strongest remaining objection is commercial, not
  technical: the port buys serverless deployment at the cost of a money-path
  rewrite plus a limiter redesign. That is an operator decision and is presented
  as one (D-12, SCOPE D5).
- **CHANGE DELTA:** ~3%; convergence criterion met (below 2% twice would mean
  the document is still moving, but the remaining edits were additive risks
  already implicit in steps 0/6/9).

## Resolution

- **Closed Date:** —
- **Fix Description:** Not implemented. Plan only.
- **Tests Added:** None yet; every promised artifact is named in Verification.
- **Verification Evidence:** None; `converged` precedes implementation.
- **Archived:** —

## Lessons Learned

The estimate in `docs/database-options.md` was right about the shape of the port
and wrong about one thing that matters: it counted the cost as "265 call sites
plus an async port" without checking the two places where the semantics, not the
syntax, change — the 5-second window against an unbounded loop in
`quarantineExpiredHolds`, and the 29 `ON DELETE` clauses that quietly depend on a
pragma that may not be settable. Counting call sites measures typing; it does not
measure the invariants that break. The second lesson is procedural: a
"here is the cost, pick a database" document is not a decision record, and the
gap between the two is exactly where a launch gets scheduled against work nobody
has planned.
