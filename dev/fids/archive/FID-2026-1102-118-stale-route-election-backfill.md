# FID: Re-elect catalogues imported before tier-scoped route groups

**Filename:** `FID-2026-1102-118-stale-route-election-backfill.md`
**ID:** FID-2026-1102-118
**Severity:** high
**Status:** closed
**Created:** 2026-11-03 09:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

> This FID is a pre-implementation design record. It does not authorize or
> claim implementation of the proposed change.

---

## Summary

FID-116 fixed which row a route group elects, but nothing re-elected the rows
already stored. A catalogue imported under the old rule keeps its old
`is_primary` flags until someone syncs again, so the paid counterpart of a free
model stayed imported, priced and active while `/models` published only the free
allocation. In the operator's database this affected six model families, not the
one that was reported: `glm-5.3`, `glm-5.3-flash`, `gpt-6-luna`, `kimi-k3`,
`jev-1.13` and `gemini-3.8-flash`. This FID adds a version-stamped one-time
re-election at boot, so an upgrade repairs the stored catalogue without waiting
for an operator to sync.

## Environment

- **OS:** win32
- **Language/Runtime:** Node >=22.18.0, Next.js 16, PostgreSQL (PGlite locally)
- **Commit/State:** `ed97ae5` plus this change

## Detailed Description

### Problem

`/models` showed a free model with no paid counterpart even though a priced,
active paid row existed for it. The paid row was withheld by
`PUBLIC_MODEL_SCOPE` because its `is_primary` was still `0` from the election
that ran before FID-116 scoped route groups to the billing tier.

### Expected Behavior

After upgrading, every stored catalogue reflects the current election rule: a
free allocation and its paid counterpart are both published, and a paid row with
no upstream counterpart stays a single free path.

### Root Cause

`routeGroupKey` is applied when `reconcileRoutes` runs, and a sync is the only
caller. A row's stored election is therefore frozen at whatever rule was live
when it was last synced. The code fix in `1bc8256` corrected the rule for new
elections and left every existing row un-elected under it.

### Evidence

Measured against the local PostgreSQL catalogue before any repair:

- 89 model rows, 11 free groups, 49 published rows, 9 published free rows.
- 6 free groups had paid rows that were priced, active and `in_catalog = 1`,
  but `is_primary = 0` — 9 withheld paid rows.
- Affected: `glm-5.3` (2 paid rows), `glm-5.3-flash` (2), `gpt-6-luna` (2),
  `kimi-k3` (1), `jev-1.13` (1), `gemini-3.8-flash` (1).
- Upstream `/v1/models`: savant 44 ids (21 free, 23 paid), apixo 44 paid ids.
  Seven canonical models have no paid id on either provider —
  `qwen-3.8-max`, `minimax-m3.1-flash`, `glm-5.3-flashx`, `hy4`, `kimi-k2.8`,
  `minimax-m3`, `claude-sonnet-4.6` — so those are free-only products, not
  stripped rows, and no paid path can be invented for them.
- `commandcode` was not scanned: `COMMANDCODE_API_KEY` is not configured.

After a manual reconciliation of the same rows: 62 published rows, 0 free groups
without a public paid counterpart. That confirmed the flags were stale rather
than the import being incomplete.

## Impact Assessment

### Affected Components

- `lib/storage/backfill.ts` (new one-time repair)
- `lib/storage/runtime.ts` (runs it once per database)
- `lib/storage/store/routes.ts` (unchanged; supplies `reconcileRoutes`)
- `tests/route-election-backfill.test.mjs` (new regression test)

### Risk Level

- [x] High: decides the public catalogue and the served route
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Record the election rule version in `settings` and reconcile once when the
stored version differs. The repair runs inside the storage bootstrap, after the
migration and before the handle is handed to a request, so no page can read a
catalogue that has not been re-elected. A later boot reads the version and stops,
which keeps the write off the cold-start path and leaves post-upgrade elections
authoritative.

A failure throws, exactly like the migration before it: a catalogue known to be
mis-elected is not served.

### Steps

1. Add `backfillRouteElection` with `ROUTE_ELECTION_VERSION = "2"` and the
   `catalog.route_election_version` key.
2. Call it from `getDatabase()`'s single-flight `create()` after
   `createStorageDatabase`.
3. Cover the repair, the published result and the one-time semantics in
   `tests/route-election-backfill.test.mjs`.

### Verification

- Focused: `node --test tests/route-election-backfill.test.mjs`
- Gates: `npm test`, `npm run typecheck`, `npm run lint`, `npm run quality`,
  `npm run build`
- Live: re-run the catalogue scan after a boot and confirm no free group is
  missing a public paid row that exists upstream.

## Verification Gates

- gate: test tests/route-election-backfill.test.mjs
- gate: test — `npm test`
- gate: typecheck — `npm run typecheck`
- gate: lint — `npm run lint`
- gate: quality — `npm run quality`
- gate: build — `npm run build`

### Verification Receipt

- verified: 2026-11-03T09:40Z
- focused: `node --test tests/route-election-backfill.test.mjs` exit 0 — 3/3
- test: `npm test` exit 0 — 863 tests, 862 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 538 files)
- build: `npm run build` exit 0
- live scan (local PostgreSQL): before 49 published / 6 stale groups; after 62
  published / 0 stale groups
- not run: `npm run test:http`, `npm run test:recovery`, browser review

## Perfection Loop

### Loop 1 — RED

- **RED:** A paid row that the provider sells, that the sync imported and priced,
  that is active and `in_catalog = 1`, is absent from `/models` because its
  `is_primary` predates the tier-scoped rule. Reported as one model; the scan
  showed six families.
- **GREEN:** Version-stamped boot repair plus a test that reproduces the stale
  flag and asserts both the flags and the published list.
- **AUDIT:** `lib/storage/backfill.ts` reads
  `catalog.route_election_version`, calls `reconcileRoutes`, then writes the
  version; `lib/storage/runtime.ts` awaits it inside the single-flight
  `create()`; `tests/route-election-backfill.test.mjs` builds a real PGlite
  schema, syncs `free/glm-5.3` + `glm-5.3`, forces the pre-fix flag, and checks
  the repair, the published result and the one-time behaviour.
- **ADVERSARIAL:** Does a boot repair overwrite an operator's later decision? No:
  the version row means the repair runs once per database version; the third
  test deliberately re-breaks a flag after the repair and asserts the backfill
  leaves it alone. Could reconciling at boot change prices? Only auto-priced
  rows follow their serving cost, which is the same rule a sync applies; manual
  prices are untouched by `reconcileRoutes`. Could a failed repair brick the
  app? It throws, which is the same fail-closed contract as the migration, and
  the version write happens only after reconciliation succeeds, so the next boot
  retries.
- **CHANGE DELTA:** 25% before implementation.

### Missed Questions

1. Why not reconcile on every boot? It is a write transaction over the whole
   catalogue; the version key makes the upgrade a one-time event and keeps the
   steady-state path to a single read.
2. Should the three free-only models get a synthetic paid row? No. No upstream
   price exists, and inventing one would publish a rate the gateway cannot buy.
3. Does this repair production? The production catalogue currently holds no
   models, so nothing is stale there; the repair guarantees the same outcome for
   any database that was synced before the rule changed.

## Resolution

- **Closed Date:** 2026-11-03 09:45
- **Fix Description:** a one-time, version-stamped route reconciliation at
  storage bootstrap re-elects stored catalogues under the tier-scoped rule.
- **Tests Added:** Yes — `tests/route-election-backfill.test.mjs`, three cases.
- **Verification Evidence:** focused 3/3; `npm test` 863 (862 pass, 1 skipped);
  typecheck 0; lint 0 warnings; quality PASS 538 files; build 0; live scan moved
  the local catalogue from 49 to 62 published rows with 0 stale groups.
- **Archived:** 2026-11-03 09:45

## Lessons Learned

A rule change on stored data needs a data step, not only a code step. The sync
path applied FID-116 to new imports and left the existing flags silently wrong,
which is why the defect outlived its own fix.
