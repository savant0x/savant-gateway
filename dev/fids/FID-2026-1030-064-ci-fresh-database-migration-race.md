# FID: Fresh-database migration race on parallel boot

**Filename:** `FID-2026-1030-064-ci-fresh-database-migration-race.md`
**ID:** FID-2026-1030-064
**Parent:** FID-2026-1030-058
**Severity:** high
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-048, FID-2026-1030-050, FID-2026-1030-053
**YAGNI-Compliance:** Verified — only the boot-time schema gate changed; no
schema, query or billing semantics moved.

## Summary

A push failed CI after `next build` reported
`SqliteError: duplicate column name: family` while collecting page data. Three
build workers imported `lib/db.ts` at once against a fresh database, and each
ran the additive migrations. The `hasColumn` read is not atomic with the
`ALTER TABLE` that follows it, so two workers could both observe a missing
column and both try to add it; the loser crashed the worker.

Local builds hid this because `data/gateway.db` was already migrated, so the
check always returned early. The defect is not CI-specific: any cold start with
more than one process on an empty database (parallel build workers, several
instances starting together, a fresh deployment) can crash.

## Environment

- `lib/db.ts` — `createDb()` migration sequence.
- `lib/schema/columns.ts` — `hasColumn` / `ensureColumn`.
- CI: `.github/workflows/ci.yml`, fresh checkout, no `data/` directory.
- Local: Node 24, better-sqlite3, WAL mode, `busy_timeout = 5000`.

## Detailed Description

### Problem / expected behavior / root cause

Expected: every process booting against the same database either migrates it or
observes the completed migration, and no process fails on an already-satisfied
additive step.

Actual: `ensureColumn` checks `PRAGMA table_info` and then runs `ALTER TABLE`
with no locking around the pair. The migration sequence was likewise not a
transaction, so check-then-write windows were open for every additive column.

### Fix

1. `ensureColumn` treats `duplicate column name` from its own `ALTER` as the
   requested end state and returns; unrelated SQLite errors still propagate.
2. `createDb()` runs the whole additive migration plus seed inside one
   `BEGIN IMMEDIATE` transaction. A second process waits on the write lock
   (`busy_timeout`) and then reads the committed schema instead of racing it.
3. `busy_timeout` is now set before `journal_mode = WAL`, so a concurrent first
   open also waits instead of failing immediately.

### Evidence

- CI failure: run 41094595695, job `build`, `SqliteError: duplicate column
  name: family` at `lib/schema/providers.ts:61` via `ensureColumn`.
- Reproduced locally by building with a fresh `DB_PATH` (no migrated file).
- `tests/schema-migration.test.mjs` — three cases: idempotent add, lost race
  tolerated, unrelated failure still raised.

## Impact Assessment

- Risk: low. The change only affects boot-time schema preparation.
- Behavior change: a duplicate-column ALTER is no longer fatal.
- Data: none migrated, rewritten or deleted; no table or column changed.
- Billing, admission, settlement and payment paths are untouched.

## Verification

- `npm run build` with a fresh `DB_PATH`, twice: exit 0.
- `npm run verify`: exit 0 — lint clean, typecheck exit 0, 283 unit tests pass,
  quality PASS, production build clean, `http-suite` 262 checks PASS,
  `trial-http-suite` all checks PASS.

## Remaining Limits

- The cross-process race is proven by the CI failure and the unit-level race
  simulation; the committed test does not spawn concurrent processes (Node
  cannot import `lib/db.ts` directly because of extensionless TS imports).
- A migration that is not purely additive would still need explicit ordering;
  the transaction serializes writers but does not version the schema.
