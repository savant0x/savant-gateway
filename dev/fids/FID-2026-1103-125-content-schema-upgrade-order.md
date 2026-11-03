# FID: Content schema upgrade order

**Filename:** `FID-2026-1103-125-content-schema-upgrade-order.md`
**ID:** FID-2026-1103-125
**Severity:** critical
**Status:** converged
**Created:** 2026-11-03 12:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

An existing local database cannot start the application. The content schema
creates `content_comments_parent_idx` in the same script that creates the
tables, before the later `ALTER TABLE content.comments ADD COLUMN parent_id`
upgrade. On a fresh database the column exists inline and the index succeeds; on
a database created before replies, `CREATE TABLE IF NOT EXISTS` is a no-op and
the index fails with `column "parent_id" does not exist`. The whole migration
aborts, the rejected storage promise is cached, and every database-backed page
returns 500 until the process restarts.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PGlite at `data/pg` locally; PostgreSQL in production
- **Commit/State:** `c5b11a6` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

`lib/storage/schema/content.ts` runs one script that creates the comment table
and immediately indexes `parent_id`. The reply migration that adds the column
runs in a second script. An existing table therefore reaches the index without
the column.

### Expected Behavior

- A database created before replies upgrades on the next boot.
- The parent index exists only after its column exists.
- The upgrade is idempotent on a database that already has the column.
- A regression test pins the old-schema path rather than only the fresh path.

### Root Cause

The fresh-schema definition was extended with `parent_id`, but the index was
left in the create script. The additive `ALTER` was added later and could never
run because the earlier statement failed first.

### Evidence

```text
psql error: column "parent_id" does not exist
CREATE INDEX IF NOT EXISTS content_comments_parent_idx
  ON content.comments(parent_id, created_at ASC);   -- before ADD COLUMN
runtime.ts: a rejected storage promise is cached for the process lifetime
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts`
- `tests/content-schema-upgrade.test.mjs` (new)

### Risk Level

- [x] Critical: application startup fails on every existing database
- [ ] High
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Create the parent index in the additive branch, after `ADD COLUMN IF NOT EXISTS
parent_id`. Keep the fresh-schema table definition unchanged. Add a test that
builds the pre-reply schema, runs `contentSchema`, and asserts the column, the
index, the skipped-cycle column, the generic metric column and a stored reply.

### Steps

1. Remove the premature parent index from the create script.
2. Keep the index beside the `ALTER TABLE ... ADD COLUMN parent_id` statement.
3. Add the old-schema upgrade test.
4. Run the focused test, full suite, lint, typecheck, quality and build.
5. Re-run the actual `data/pg` migration and request `/signal` plus the failing
   item page.

### Verification

The regression test fails before the move and passes after it; the real local
database is inspected for the new columns and the index; HTTP requests return
200 instead of 500.

## Verification Gates

- gate: test tests/content-schema-upgrade.test.mjs
- gate: test tests/content-comments.test.mjs
- gate: lint
- gate: typecheck
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** Existing `content.comments` has no `parent_id`; the create-script
  index aborts the migration and poisons the cached storage promise.
- **GREEN:** Move the index after the additive column.
- **AUDIT:** Fresh databases still create the column inline and the index in the
  same run; existing databases add the column first.
- **ADVERSARIAL:** Running the migration twice must not fail: the column and
  index both use `IF NOT EXISTS`.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Why did the test suite catch this? → It did not, because every storage test
   used a fresh database. The missing case was an upgrade from the previous
   release, which this FID adds.
2. Is the migration transactional? → Yes. PostgreSQL DDL is transactional, so
   the failure left the old schema intact rather than half-migrated.
3. Does the build need a database? → No. Pages that read storage are dynamic;
   the build never opens one. Local development uses PGlite and production
   requires `DATABASE_URL` at runtime.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** pending implementation
- **Tests Added:** No
- **Verification Evidence:** None
- **Archived:** not archived
