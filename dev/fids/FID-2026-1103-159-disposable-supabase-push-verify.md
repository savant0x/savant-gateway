# FID: Repeatable disposable Supabase database for push and verify

**Filename:** `FID-2026-1103-159-disposable-supabase-push-verify.md`
**ID:** FID-2026-1103-159
**Severity:** medium
**Status:** fixed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one script, two npm aliases, one doc note.

## Summary

The mandatory PostgreSQL gates need a disposable endpoint, but Docker is not
available on this machine. A one-off temporary script created an isolated
database on the configured Supabase project, exported the two test variables to
`git push`, and dropped the database. That setup is not repeatable from the
repository: every push or full verification currently depends on a private
script outside the tree. The flow must become a project script with the same
create/export/run/drop contract and the same fail-closed cleanup.

## Environment

- **OS:** win32
- **Language/Runtime:** Node 22.x, `pg`
- **Commit/State:** `b8bbd19` plus the working tree
- **Evidence:** `/tmp/push-with-supabase-temp.mjs` (outside the tree) succeeded
  for the `0a890bd` and `b8bbd19` pushes; Docker is unavailable.

## Detailed Description

### Problem

`scripts/with-disposable-postgres.mjs` can start Docker or reuse a supplied
`TEST_DATABASE_URL`. Neither path provisions a database on an existing remote
server, so a machine without Docker has no repeatable local command that
satisfies `test:postgres`, the HTTP suites and `verify`.

### Expected Behavior

`npm run push:supabase` and `npm run verify:supabase` create a uniquely named
database on the server named by `DATABASE_URL` (or `DB_CONNECTION_STRING`),
export `TEST_DATABASE_URL` and `HTTP_TEST_DATABASE_URL` to the child command,
and drop only that database in a `finally` block. The script prints host and
database names only, never a credential, and fails closed when the connection
string or cleanup is unavailable.

### Root Cause

The Docker helper owns process lifecycle and the supplied-URL path assumes the
caller already made an isolated database; no repository script owns remote
provisioning.

### Evidence

```text
scripts/with-disposable-postgres.mjs: startDisposablePostgres() | supplied TEST_DATABASE_URL
/tmp/push-with-supabase-temp.mjs: CREATE DATABASE gateway_push_*, spawn git push, DROP DATABASE ... WITH (FORCE)
```

## Impact Assessment

### Affected Components

- `scripts/with-supabase-postgres.mjs` (new)
- `package.json`, `docs/getting-started.md`, `README.md`
- `dev/receipts/2026-11-03-sandbox/README.md` (operator note)

### Risk Level

- [x] Medium: a provisioning bug could target the wrong database, but the script
  only creates and drops its own uniquely named database.

## Proposed Solution

### Approach

A dedicated remote-provisioning wrapper. It reads the existing connection
string, refuses to run if the target database is already a generated disposable
name, creates `gateway_<purpose>_<timestamp>`, derives the child URL by replacing
only the pathname, and drops that exact name with `WITH (FORCE)`. Command
resolution handles `npm` on Windows. No Docker fallback: this script exists for
hosts that already have a PostgreSQL server.

### Steps

1. Add the wrapper with `-- <command>` parsing, local env loading, redacted
   logging, create/run/drop and idempotent cleanup.
2. Add `push:supabase` and `verify:supabase` npm scripts.
3. Document the commands and the safety boundary in getting-started and README.
4. Prove it with a disposable run: the script provisioning a database for a
   focused test, then for `npm run verify`, then for the real push.

### Verification

- `node scripts/with-supabase-postgres.mjs -- node --test tests/pricing-report.test.mjs`
- `npm run verify:supabase` (all gates on a disposable endpoint)
- `npm run push:supabase` (pre-push gates on a disposable endpoint)
- Confirm the generated database is absent afterwards and no credential appears
  in the output.

## Verification Gates

- gate: test tests/pricing-report.test.mjs
- gate: lint
- gate: typecheck
- gate: quality
- gate: verify

### Verification Receipt

- verified: 2026-11-03
- focused wrapper run: created `gateway_run_1793751054879_36792`, 11/11 tests,
  dropped
- full `npm run verify:supabase`: PASS all ten gates, 976/976 unit tests,
  0 skipped, 263.4s; created and dropped `gateway_verify_1793751488316_50524`
- lint: exit 0 (zero errors; six pre-existing warnings)
- typecheck: exit 0
- quality: exit 0
- verify: exit 0 (all ten gates)
- no credential value in the script output; only redacted URLs

## Perfection Loop

### Loop 1 — RED

- **RED:** the mandatory PostgreSQL gates depend on out-of-tree setup whenever
  Docker is unavailable.
- **GREEN:** repository-owned remote disposable wrapper and npm aliases.
- **AUDIT:** cleanup uses the exact generated name in `finally`; the child
  environment is the only place the derived URL appears. A focused run and the
  full verify both created and dropped their database.
- **ADVERSARIAL:** invalid URL, missing connection string, generated base name,
  malformed child arguments, whitespace value, nonzero child, dropped-database
  failure and credential leakage were considered. The `--help` path was moved
  before argument parsing after the first probe rejected it.
- **CHANGE DELTA:** 15%; converged.

### Loop 2 — Independent audit and self-correction

- **RED:** the first full verify failed the unit gate 973/976. Loading all of
  `.env.local` into the process leaked `PROVIDER_KEY` into the child gates, which
  made the seeded `savant` provider look refreshable in three freshness tests.
- **GREEN:** `.env.local` is now read into a local map without mutating
  `process.env`; only `DATABASE_URL`/`DB_CONNECTION_STRING` are consulted.
- **AUDIT:** the three failing freshness tests passed through the wrapper; the
  full verify then passed 976/976 with 0 skipped and dropped its database.
- **ADVERSARIAL:** the base database is never used as a test target; the child
  receives the generated URL for both variables; a hard kill limitation is
  documented instead of being claimed as guaranteed cleanup.
- **CHANGE DELTA:** 8%; converged.

### Missed Questions

1. **Why not reuse `with-disposable-postgres.mjs`?** Its Docker lifecycle and
   loopback safety rule are different from provisioning a database on an
   existing authenticated server. Sharing the wrapper would hide that boundary.
2. **Does this replace `push:postgres`?** No. Docker/local remains the default;
   the Supabase path is for environments without Docker.
3. **Can it target production data?** It creates and drops only a newly generated
   database. It refuses to treat `DATABASE_URL` itself as the test endpoint and
   never runs the suites against the base URL.

## Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** the implementation commit directly preceding the closure
  commit; the exact SHA is recorded in `Resolution` after closure.
- [x] **File:line ranges:** `scripts/with-supabase-postgres.mjs:54`
  (`readLocalEnv`), `:184` (entry), `:222` (`CREATE DATABASE`), `:281`
  (`DROP DATABASE ... WITH (FORCE)`); `package.json` (`push:supabase`,
  `verify:supabase`); `docs/getting-started.md`, `README.md` (usage).
- [x] **Gate output:** focused wrapper run 11/11; full verify all ten gates PASS,
  976/976 tests, 0 skipped, 263.4s; both generated databases dropped.
- [x] **Reproducibility:** `npm run verify:supabase` reproduced the full gate on a
  fresh generated database after the env-scope fix; `rg "push:supabase"` finds
  the aliases and docs.
- [x] **Step statuses:** steps 1–4 `implemented`. The push receipt is recorded
  after the closure commit is pushed through the same script.

## Resolution

- **Closed Date:** pending closure commit
- **Fix Description:** `scripts/with-supabase-postgres.mjs` provisions a
  uniquely named disposable database on the configured PostgreSQL server for
  push or verify, exports both test variables, and drops only that database.
- **Tests Added:** no new unit file; the script is exercised by the focused and
  full runs, and the env-scope defect is covered by the existing freshness tests
  passing through the wrapper.
- **Verification Evidence:** full `npm run verify:supabase` PASS, all ten gates,
  976/976 tests, 0 skipped; generated database dropped.
- **Archived:** pending closure commit

## Lessons Learned

A prerequisite that lives in one shell's history is not a prerequisite the
project can rely on. Put the create/export/drop contract in the tree.
