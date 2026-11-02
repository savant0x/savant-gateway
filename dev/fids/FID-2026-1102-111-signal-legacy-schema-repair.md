# FID: Signal legacy content-schema repair

**Filename:** `FID-2026-1102-111-signal-legacy-schema-repair.md`
**ID:** FID-2026-1102-111
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 17:53
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The public Signal page currently reports `column i.external_url does not exist`.
The Hacker News integration added `external_url` to the content read/write path,
and `lib/storage/schema/content.ts` already contains an additive migration for
existing PostgreSQL databases. The failure reproduces in the currently running
development process because its globally cached storage handle was initialized
before the migration-bearing code was loaded. A fresh process runs the idempotent
migration and repairs the existing database; a regression test must preserve that
contract.

## Environment

- **OS:** Windows host
- **Language/Runtime:** TypeScript strict, Node.js v24.21.0 host; project target Node `22.x`; Next.js 16.4.3
- **Tool Versions:** npm 12.2.1; PostgreSQL with PGlite local development
- **Commit/State:** `b26da9ff3f3adeaea81c4a9d2ff1fbc17bd55a35` plus uncommitted Speed Insights edits

---

## Detailed Description

### Problem

`/signal` returns HTTP 200 with an error panel instead of content:

```text
Content storage is unavailable: column i.external_url does not exist
```

The production content read path is:

```text
app/signal/page.tsx
  → getDatabase()
  → lib/storage/runtime.ts global cached database handle
  → lib/storage/database.ts migration on first initialization
  → lib/content/store/items.ts listItems()
  → lib/content/store/item-rows.ts ITEM_COLUMNS
  → content.items.external_url
```

The current dev server was already running before the Hacker News code was
loaded. Its `globalThis.__savantStorageDatabase` promise therefore retained the
older handle and schema. The route's error boundary correctly exposed the SQL
failure rather than hiding it.

### Expected Behavior

- An existing database created before `external_url` was introduced is upgraded
  additively when a new application process initializes storage.
- A restart does not delete content or change unrelated rows.
- `/signal` returns its normal empty or populated state without a schema error.
- Re-running the migration remains safe and idempotent.

### Root Cause

The schema change and the content query were introduced together, but the local
Next development process retained a globally cached database handle across the
code reload. The migration is executed by `createStorageDatabase` only during
handle creation, so the old handle does not revisit `contentSchema` after the
source changes. The existing PostgreSQL migration is the correct repair boundary;
the missing evidence was a test against an already-created legacy table and a
fresh-process route smoke check.

### Evidence

```text
HTTP GET http://127.0.0.1:3000/signal → 200
Rendered error: Content storage is unavailable: column i.external_url does not exist

Local reproduction against a real PGlite PostgreSQL engine:
BEFORE=column i.external_url does not exist
AFTER=1
LIST=ok

Relevant code:
lib/content/store/item-rows.ts:103-112 selects i.external_url
lib/storage/schema/content.ts:145-152 adds external_url when absent
lib/storage/runtime.ts:31-64 caches the handle on globalThis
app/signal/page.tsx:83-99 calls listItems and renders the observed error
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts` — existing additive migration contract.
- `lib/storage/runtime.ts` — process-lifetime cache that explains the dev-only
  stale handle after reload.
- `lib/content/store/item-rows.ts` and `lib/content/store/items.ts` — Signal
  list/detail reads that require the column.
- `app/signal/page.tsx` — public user-visible failure surface.
- `tests/content-sources.test.mjs` — regression coverage for a legacy content
  table upgraded by the real migration.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: Public content discovery is unavailable until the process restarts
  and the additive migration runs.
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Keep the existing additive PostgreSQL migration as the single schema authority.
Add a focused integration regression to `tests/content-sources.test.mjs` that
drops `external_url` from a migrated fixture, proves the content read fails in
the legacy state, reruns `contentSchema`, proves the column exists, and proves
`listItems` works. Restart the local Next process so its cached handle is
recreated and the same migration runs in the user's actual path. Do not add a
per-request migration or a second schema implementation.

### Steps

1. **implemented** — Reproduce the reported `/signal` error and isolate it to
   the cached storage handle plus the missing legacy column.
2. **implemented** — Add the existing-database migration regression to
   `tests/content-sources.test.mjs`.
3. **implemented** — Restart the local app process and verify the public Signal
   route and the migration-backed column.
4. **implemented** — Run the declared repository gates and record their actual
   output without claiming a check that did not run.

### Verification

- The new regression must fail if the migration stops adding `external_url` and
  pass when an existing content table is upgraded.
- A fresh local server must return HTTP 200 for `/signal` with no
  `Content storage is unavailable` or `external_url does not exist` text.
- Static verification must show `contentSchema` is called from
  `migrateDatabase`, which is called from `createStorageDatabase`, which is the
  production caller behind `getDatabase`.
- `npm run check`, `npm run storage:check`, `npm run config:check`,
  `npm test`, `npm run quality`, `npm run build`, `npm run test:http`,
  `npm run test:recovery`, and `npm run verify` must be run as applicable.

## Verification Gates

- `- gate: check` — `npm run check`
- `- gate: storage:check` — `npm run storage:check`
- `- gate: config:check` — `npm run config:check`
- `- gate: test tests/content-sources.test.mjs` — `npm test -- tests/content-sources.test.mjs`
- `- gate: test` — `npm test`
- `- gate: quality` — `npm run quality`
- `- gate: build` — `npm run build`
- `- gate: test:http` — `npm run test:http`
- `- gate: test:recovery` — `npm run test:recovery`
- `- gate: verify` — `npm run verify`

### Verification Receipt

- verified: 2026-11-02T18:00:00-05:00
- focused command `npm test -- tests/content-sources.test.mjs`: exit 0; the
  command runs the repository's configured test glob and reported 842 tests,
  841 pass, 1 skipped, 0 fail; the new test
  `the content migration repairs an existing table before Signal reads it`
  passed.
- `npm run check`: exit 0; lint and typecheck completed without output errors.
- `npm run storage:check`: exit 0; `PASS — one storage engine, resolved at
  lib/storage/runtime.ts`.
- `npm run config:check`: exit 0; `config-check: PASS (non-production)`.
- `npm run quality`: exit 0; `quality: PASS (400-line ceiling, 533 files scanned)`.
- `npm run build`: exit 0; Next.js compiled, TypeScript finished, and all 23
  static pages generated.
- `npm run verify`: exit 0; trial HTTP suite, recovery drill, and the full
  repository verification completed successfully. Existing intentional
  disconnect probes emitted `ECONNRESET` diagnostics but did not fail the gate.
- fresh local server smoke: `GET http://127.0.0.1:3000/signal` returned
  `Status=200`, `HasError=False`, `HasColumnError=False`, and
  `HasSignal=True` after the process restart.
- production call graph grep: `contentSchema` is called by `applySchema`,
  `migrateDatabase` is called by `createStorageDatabase`, and the runtime calls
  `createStorageDatabase`; Signal calls `listItems` from `app/signal/page.tsx`.

## Perfection Loop

### Loop 1 — RED

- **RED:** Signal selects a column absent from the running content table. The
  current process can keep a pre-migration handle through `globalThis` caching.
- **GREEN:** Reuse the existing additive migration, add a legacy-schema test, and
  restart the process; reject per-request migration and duplicate schema logic.
- **AUDIT:** The direct PGlite experiment produced `BEFORE=column i.external_url
  does not exist`, then `AFTER=1` and `LIST=ok` after `contentSchema`.
- **ADVERSARIAL:** A test that only creates a fresh schema would miss the exact
  upgrade failure. The regression deliberately removes the column from an
  existing table before invoking the migration.
- **CHANGE DELTA:** Initial FID authoring.

### Loop 2 — Independent audit and self-correction

- **RED:** Restarting only the browser would leave the cached process unchanged;
  a route-only smoke test could also pass against a fresh empty database while
  missing the upgrade path.
- **GREEN:** The repair requires a process restart, a schema-upgrade test, and a
  real `/signal` request against the existing local data directory.
- **AUDIT:** The call graph is concrete: `getDatabase` → `createStorageDatabase`
  → `migrateDatabase` → `applySchema` → `contentSchema`; `listItems` consumes the
  repaired column through `ITEM_COLUMNS`.
- **ADVERSARIAL:** The migration must remain additive and transactional; no
  content rows may be dropped or rewritten. The test checks the column and read
  path, while the route smoke check proves the user-facing result.
- **CHANGE DELTA:** Documentary correction only.

### Loop 3 — Final convergence

- **RED:** The source tree already contains the intended migration, so changing
  schema SQL would risk duplicating or weakening a correct repair.
- **GREEN:** Limit code changes to regression evidence and operationally restart
  the stale development process. Keep the existing migration as the one truth.
- **AUDIT:** The exact user error reproduces, the direct migration experiment
  repairs it, and the planned test covers the legacy-table boundary. Production
  reachability is assigned to the existing storage call graph and route smoke
  check.
- **ADVERSARIAL:** A newly added column could be selected but still fail on the
  insert path; `upsertItem` already writes `external_url` and the existing HN
  suite exercises that path on a migrated database. No fallback query is added
  that would silently discard publisher URLs.
- **CHANGE DELTA:** 0% after final audit; record converged for implementation.

## Implementation Evidence

- [ ] **Commit SHA:** pending implementation commit
- [x] **File:line ranges:** `tests/content-sources.test.mjs:202-226` covers the
  legacy-column failure, additive migration, information-schema assertion, and
  successful Signal read.
- [x] **Gate output:** receipt above records the actual focused/full test,
  check, storage, config, quality, build, verify, and route smoke results.
- [x] **Reproducibility:** the exact error, direct migration probe, and production
  call graph are recorded above
- [x] **Step statuses:** all proposed steps are accounted for

## Resolution

- **Closed Date:** pending commit and archive
- **Fix Description:** Added legacy-schema migration coverage and restarted the
  stale local process so the existing additive migration repairs `external_url`.
- **Tests Added:** Yes — existing-database content migration regression in
  `tests/content-sources.test.mjs`.
- **Verification Evidence:** Receipt above; `/signal` returned HTTP 200 without
  the reported error after restart.
- **Archived:** pending

## Lessons Learned

Schema additions need an upgrade test against an existing database, not only a
fresh-schema test. A process-level database cache is useful for one-process
consistency but makes a restart part of local schema-change verification.
