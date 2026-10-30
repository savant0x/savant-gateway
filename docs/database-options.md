# Production database options

**Status: research input, not a decision.** Written 2026-10-30 against the
requirements in `docs/launch-plan.md` Phase 3. No dependency, schema or code
changed. Prices and retention windows are as published on the dates below and
must be re-checked at purchase.

The operator's ruling is that SQLite is the local-development placeholder and a
production database will be chosen before launch, whatever the host. This
document compares candidates against what the code needs, not against feature
lists.

## What the code actually needs

Measured from `lib/` on 2026-10-30, not estimated:

| Fact | Count |
| --- | --- |
| `db.prepare(...)` call sites | 265 in 38 files |
| `db.transaction(fn)` wrappers | 35 |
| `.immediate()` write-locking transactions | 28 |
| `INSERT OR IGNORE` | 11 |
| `ON CONFLICT` upserts | 9 |
| `datetime()` expressions | 32 |
| `COLLATE NOCASE` | 2 |
| `PRAGMA` statements | 1 |
| `AUTOINCREMENT` / `rowid` dependence | 0 |

The money path is the constraint, not the volume. A settlement writes the hold
release, the ledger entry and the usage row together, and the write lock is what
stops two concurrent calls spending the same balance. Replay guards (webhook
events, top-up fulfilment, policy acceptance, key creation) depend on unique
constraints plus idempotent inserts. Reads must see their own writes because the
balance is re-read immediately after a hold.

## Verdicts

| Candidate | Verdict |
| --- | --- |
| **Turso (libSQL database, `@libsql/client`)** | **Primary recommendation.** Keeps the SQLite dialect, so 46 dialect constructs and all 265 statements stay as written; supplies the interactive write transaction the settlement code depends on; PITR windows reach 30 days on a mid tier. Weekly the only unavoidable work is the async port. |
| **Neon Postgres** | **Second recommendation**, if a conventional Postgres ecosystem matters more than port size. Same transactional guarantees, better tooling and branching, but every SQLite-dialect construct and every `datetime()` comparison is rewritten on top of the same async port. |
| **Supabase** | Postgres, but PITR is a paid add-on (roughly $100/month for 7 days, as published at research time) and the shared transaction-mode pooler does not support prepared statements. Not worth it unless its auth/storage features are wanted, which this app does not need. |
| **Cloudflare D1** | **Rejected.** Documented transaction model is `batch()` — sequential statements in an implicit transaction. There is no API to hold a transaction open across calls, so hold-then-settle would have to be redesigned into single batches, and adopting it also means moving the app onto Workers. |
| **Aurora / RDS Postgres** | Capable, but it is the same Postgres rewrite plus cluster operations. Not justified at this scale. |

## Requirement matrix

| Requirement | Turso libSQL | Neon Postgres | D1 |
| --- | --- | --- | --- |
| Interactive transaction across several statements | **Yes.** `client.transaction("write")` maps to `BEGIN IMMEDIATE`, with `commit`/`rollback`, holding the write lock until finished | **Yes.** Standard `BEGIN` plus `SELECT ... FOR UPDATE`; keep all statements on one checked-out client | **No** app-held transaction; `batch()` only |
| Prevent double-spend on a balance | Single-writer lock per database serializes writers | Row locks or a conditional `UPDATE ... WHERE available >= ? RETURNING` | Would need a redesign into batch statements |
| Unique constraints and idempotent upserts | SQLite syntax unchanged | `ON CONFLICT (col) DO NOTHING` — mostly mechanical, but conflict targets must be named | Supported |
| Read-your-writes | Writes go to the primary; the embedded-replica mode reflects them locally after a successful write | Primary reads; do not verify a settlement on a replica | Primary; replicas lag unless sessions are used |
| PITR / restore window | Free 24h · Developer 10d · Scaler 30d · Pro 90d; restore creates a **new** database | Free 6h · Launch 7d · Scale 30d; restore creates a branch | Time Travel 7d free / 30d paid, restores in place |
| Serverless connection model | Fetch-based client (`@tursodatabase/serverless`), or `@libsql/client` for the libSQL engine; no pooler needed | Pooled hostname (PgBouncer transaction mode); session state and some features unavailable through it | Worker binding |
| Async JavaScript client | Yes | Yes | Yes |

## The cost that is unavoidable either way

`better-sqlite3` is synchronous: `.get()`, `.all()` and `.run()` return values,
and `db.transaction(fn)` commits when the callback returns. Every network
database client returns promises, so the data layer becomes async and the 265
call sites plus their callers become `await`ed. No maintained synchronous client
exists for a remote database, and a wrapper cannot make network I/O return
synchronously without blocking.

Concretely, that means replacing 35 transaction wrappers with an explicit
begin/commit/rollback object, and re-checking anything that relied on a
synchronous return value. The transaction helper must never span a network call
(such as the streaming response or the Stripe API) because the transaction,
not just the statement, is now remote.

What differs between the candidates is everything on top of that port:

- **Turso:** the 46 dialect constructs and the 32 `datetime()` comparisons stay
  as they are, and `BEGIN IMMEDIATE` maps one-to-one onto the existing
  `.immediate()` intent. Two documented constraints to design around: one writer
  at a time on the libSQL engine, and a **5-second timeout** on an interactive
  write transaction. Both are fine for short ledger transactions and would be a
  problem if a transaction ever waited on an upstream API.
- **Neon:** rewrite every dialect construct; translate `BEGIN IMMEDIATE` intent
  into `SELECT ... FOR UPDATE` or a conditional update; enumerate conflict
  targets for the 9 `ON CONFLICT` and 11 `INSERT OR IGNORE` sites; keep the
  settlement sequence on one pooled client for the whole transaction.

## Recommendation

Adopt **Turso with a libSQL-engine database and `@libsql/client`** unless there is
a reason to want Postgres specifically. It preserves 265 statements and the
transaction semantics the money path was written against, and its 30-day PITR
tier matches the retention the privacy notice already claims (v1.1 says backups
are kept up to 30 days). Choosing Neon would require either Scale for the same
30 days or a policy text change, on top of the larger port.

Two things to decide at signup rather than assume: Turso Cloud now documents two
engines — libSQL (what `@libsql/client` talks to, single writer) and the newer
Turso engine (MVCC concurrent writes, different client). This recommendation is
for the **libSQL** engine; the newer one may be better later, but it is not what
the current 5-second interactive-transaction model and client docs describe.

## What must be proved before adopting

Research is not acceptance. None of this has been run against a real database:

1. **Double-spend test.** Two concurrent settlement flows against one balance;
   exactly one succeeds. This is the test the whole choice exists for.
2. **Replay and idempotency.** Re-delivered Stripe events, repeated top-up
   fulfilment, repeated policy acceptance and key creation each produce one row.
3. **Expired hold and crash recovery.** Reuse the existing settlement-recovery
   tests against the remote engine, including a process killed mid-transaction.
4. **Transaction scope.** Confirm no transaction spans a network call, and
   measure the worst-case duration against the 5-second interactive timeout.
5. **Write latency from the deploy runtime.** p50/p99 for the settlement write
   from the actual serverless region, not from a laptop.
6. **Restore drill.** Restore to a new database at a chosen timestamp, point the
   app at it, and reconcile balances, ledger and usage counts.
7. **Retention claim.** Match the plan's PITR window to the published "up to 30
   days" sentence, or change the sentence in a new policy version.

Sources read for the decisive claims: Turso transaction modes and interactive
transactions (`https://docs.turso.tech/sdk/ts/reference`), Turso PITR windows
(`https://docs.turso.tech/features/point-in-time-recovery`), Neon plan history
windows and pricing (`https://neon.com/docs/introduction/plans`), Neon pooling
limitations (`https://neon.com/docs/connect/connection-pooling`), Supabase
backups and transaction-mode pooling
(`https://supabase.com/docs/guides/platform/backups`,
`https://supabase.com/docs/guides/database/connecting-to-postgres`), D1 limits
and transaction API (`https://developers.cloudflare.com/d1/platform/limits/`,
`https://developers.cloudflare.com/d1/worker-api/d1-database/`), and the
`better-sqlite3` API for the synchronous behaviour being replaced
(`https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md`).
