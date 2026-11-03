# FID: Development seed isolation

**Filename:** `FID-2026-1103-138-development-seed-isolation.md`
**ID:** FID-2026-1103-138
**Severity:** high
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The migration inserts `user_dev` / `dev@local` whenever `NODE_ENV` is not
`production`. Starting a development server against the networked production
database therefore writes a fake customer into operator data. The seed must be
tied to the embedded storage engine, not to the process's mode label.

## Impact Assessment

- **Affected components:** `lib/storage/schema/index.ts`,
  `lib/storage/database.ts`, `tests/storage-handle.test.mjs`.
- **Risk:** high: a real customer table receives a development row; the row is
  recreated on every local boot and appears in operator customer views.

## Proposed Solution

1. **implemented:** remove the seed from `applySchema`; schema application stays
   a pure DDL operation.
2. **implemented:** let `migrateDatabase` accept an explicit
   `seedDevelopmentUser` decision, defaulting to the historical behaviour for
   direct callers and tests.
3. **implemented:** have `createStorageDatabase` pass
   `seedDevelopmentUser: mode === "local"`, so PGlite seeds and any networked
   PostgreSQL URL does not, regardless of `NODE_ENV`.
4. **implemented:** add a regression test proving a networked-mode migration
   leaves no `user_dev` row.

## Verification Gates

- `node --test tests/storage-handle.test.mjs` — 9/9
- `npm run typecheck`
- `npm run lint`
- `npm run quality`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the real Supabase database gained `user_dev` when the dev server
  started against it. The guard checked `NODE_ENV`, which is `development` in a
  dev server even when the database is production.
- **GREEN:** the seed is now decided by the storage mode. `createStorageDatabase`
  is the only place that knows whether the pool is embedded or networked, and it
  passes that fact to the migration.
- **AUDIT:** traced every `migrateDatabase` and `applySchema` caller. Tests call
  `migrateDatabase(db)` directly and keep the existing seed; the runtime calls
  `createStorageDatabase`, which now suppresses it for PostgreSQL.
- **ADVERSARIAL:** running tests with `DATABASE_URL` exported cannot suppress
  the local fixture seed because the test passes its own PGlite pool; running a
  dev server against Supabase cannot create the row because the mode is
  `postgres`; a production boot remains guarded by both checks.
- **CHANGE DELTA:** 4%; converged.

### Missed Questions

1. **Should the seed be removed entirely?** No. Local PGlite development and the
   existing storage tests use the account; removing it would break that
   contract without fixing the production leak.
2. **Should the seed be controlled by an environment variable?** No. A new
   switch adds a way to get the wrong answer; the storage mode is already the
   fact that matters.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** complete. The production `user_dev` row was deleted and a
  fresh local boot against Supabase left zero matching rows.
- **Evidence:** focused storage tests 9/9; typecheck 0; `/signal` served 474
  items from the real database after the restart; `user_dev` count 0.
- **Archived:** no; awaiting a commit that closes the record.
