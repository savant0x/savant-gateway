# FID: Persisted, switchable default provider

**Filename:** `FID-2026-1124-002-default-provider.md`
**ID:** FID-2026-1124-002
**Severity:** medium
**Status:** fixed

## Summary

"The default provider" is not data. It is the constant
`DEFAULT_PROVIDER_SLUG = "savant"` in `lib/providers/registry.ts`, repeated as a
literal in `lib/storage/store/overview.ts`, `app/api/admin/providers/[slug]/route.ts`
and `components/admin/provider-actions.tsx`. Three consequences follow, and the
operator hit all three:

1. No provider can be made the default.
2. The default row can never be deleted, so the legacy seed row lives forever.
3. The public id namespace owner is a compile-time decision that no console shows.

This FID makes the default one stored fact with exactly one holder, a console
action to move it, and an honest statement of what moving it changes.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `ae9148f` on `main`

## Detailed Description

### Problem

Live state on 2026-11-24 (`/admin/providers`):

| Field | Value |
| --- | --- |
| slug | `savant` |
| label | `apinex` |
| base URL | `https://api.apinex.bond/v1` |
| key variable | `PROVIDER_KEY` |
| status | disabled, `health: error` |
| catalog rows | 44 |

The operator renamed the label to `apinex` — the row is a legacy seed
(`lib/storage/schema/catalog-seeds.ts`, `PROVIDER_BASE_URL`, `PROVIDER_KEY`)
whose slug they cannot change after creation
(`components/admin/provider-form.tsx` renders the slug field only when creating)
and whose row they cannot delete (the guard refuses the slug `savant`).

`DEFAULT_PROVIDER_SLUG` decides four things:

| Consumer | Effect |
| --- | --- |
| `publicModelId` (`lib/providers/catalog.ts:89`) | the default's rows keep bare ids; every other provider's rows are `slug/id` |
| `lib/storage/store/overview.ts` (4 sites) | which provider's balance, quota and `synced_at` the landing page and `/admin` publish |
| `lib/providers/sync.ts:87` | which provider's catalog receives the public metadata overlay |
| `lib/storage/store/providers.ts:196` + the `[slug]` route | which row cannot be deleted |

So the complaint is structural, not cosmetic: the console offers no way to move
the namespace owner, and the guard makes the seed row immortal in the process.

### Expected Behavior

1. Exactly one provider is the default, and the fact is stored, not compiled.
2. `/admin/providers` shows which row is the default and offers **Make default**
   on the others, disabled while a request is in flight.
3. Moving the default states, before the operator confirms, how many published
   rows carry unprefixed ids today (the old default's scope) and how many rows of
   the new default are currently prefixed — because those are the ids that change
   the next time each provider syncs.
4. Deleting the current default is refused with the row named; deleting any
   non-default provider works, including one that used to be the default.
5. A database that has never been told which row is the default picks one at
   migration time, deterministically, and keeps that choice afterwards.

### Root Cause

The gateway began as one upstream, so "the provider" could be a constant. The
registry arrived later (`FID-085`, `FID-2026-1120-002`) and made providers rows,
but the identity rule (`publicModelId`) kept the constant, and the constant was
copied rather than imported in two places. Nothing ever wrote a default to the
database, so nothing can move it.

## Impact Assessment

### Affected Components

- `lib/storage/schema/catalog.ts` — column, partial unique index, one-time pick
- `lib/storage/store/providers.ts` — `getDefaultProviderSlug`, `setDefaultProvider`,
  delete guard
- `lib/providers/registry.ts` — `publicModelId` takes the default slug
- `lib/providers/catalog.ts` — `buildSyncedCatalog`/`buildSyncedModels` pass it
- `lib/storage/providers/sync.ts`, `lib/providers/preview.ts` — read it
- `lib/storage/store/overview.ts`, `lib/storage/store/provider.ts` — drop the literal
- `app/api/admin/providers/[slug]/route.ts` — `POST` action, guarded `DELETE`
- `components/admin/{provider-actions,providers-panel}.tsx` — chip and action
- `lib/providers/types.ts` — `ProviderRecord.isDefault`
- `docs/providers.md`

### Risk Level

- [x] Medium: one schema column, one write path, one changed id rule. The id rule
      only changes what a *future* sync publishes; no price, guard, reservation or
      settlement path is touched, and no existing row is rewritten.

## Proposed Solution

### Steps

1. **Store the fact.** `providers.is_default INTEGER NOT NULL DEFAULT 0`, plus
   `CREATE UNIQUE INDEX providers_default_idx ON providers(is_default) WHERE
   is_default = 1` so the database, not a code path, guarantees one holder. When
   no row carries the flag, the migration sets it on `savant` if that row exists,
   otherwise the enabled row with the lowest `sort_order`, otherwise the lowest
   `sort_order`. It runs only while no row holds the flag, so a later choice is
   never overwritten.
2. **Read it everywhere.** `getDefaultProviderSlug(db)` returns the flag holder,
   falling back to the same deterministic order for a database where the column
   was added outside a migration. `getDefaultProvider`, `deleteProvider`, the
   whole of `overview.ts` and `getProviderStatus` read it instead of the constant;
   the `[slug]` route stops comparing against the literal.
3. **Move it.** `setDefaultProvider(db, slug)` in one transaction clears the flag
   and sets it on the target, refusing an unknown slug. It returns the previous
   slug plus the measured id blast radius (`publishedIds(db, slug)` — in-catalog
   rows of that provider), which the route reports so the confirmation is a
   number, not an adjective.
4. **Keep ids honest.** `publicModelId(defaultSlug, providerSlug, upstreamId)`
   keeps the default's ids unprefixed. Sync reads the stored default before
   building rows; the preview receives it from its route, so preview keeps its
   no-database signature. Existing rows are not rewritten: a sync of the old
   default publishes its ids prefixed from then on, and a sync of the new default
   publishes its ids bare. `docs/providers.md` says exactly that.
5. **Surface it.** `ProviderRecord.isDefault` → a `default` chip on the row and a
   **Make default** action on every other row, with the confirm naming the two
   counts. Delete keeps refusing the default and now uses the stored slug; the
   action component no longer carries a copy of the constant.
6. **Tests** (disposable PostgreSQL via PGlite): the seeded database has exactly
   one default; switching moves it and leaves one holder; a raw second flag is
   refused by the index; the reported counts match the rows; the old default
   becomes deletable and the current one does not; with no flag set the fallback
   picks the enabled row with the lowest `sort_order`; and the pure id rule gives
   bare ids for the passed default only.

### Non-goals

- No rewrite of existing `models.id` values, and no aliasing layer. A published id
  is a customer contract; history keeps the ids it was sold under.
- No re-sync is triggered by a switch: an operator who wants the new namespace
  immediately presses **Sync** on those providers.
- No second default, no "preferred provider" for routing. Routing is by
  `served_provider_slug` and is untouched.
- No slug renaming. This FID moves the default; renaming a provider's slug would
  rewrite published ids for a non-default provider and needs its own record.

### Verification

`npm run verify`; the new store suite; `npm run quality`; and a live probe of
`POST /api/admin/providers/<slug>` (`make-default`) showing the returned counts
and exactly one `is_default` row afterwards, then a check that the seeded
`savant` row can be deleted once it is no longer the default.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-default-postgres.test.mjs
- gate: test tests/provider-public-id.test.mjs
- gate: quality
- gate: verify

### Verification Receipt

- verified: `npm run verify` PASS — 12/12 gates, **1277/1277 tests**, 0 skipped
  (`.verify/summary.json`). `test:postgres` 20/20.
- verified: `tests/provider-default-postgres.test.mjs` 8/8 and
  `tests/provider-public-id.test.mjs` 2/2 (both new).
- verified live (`node .scratch/probe-default-live.mjs`, 2026-11-24 after a dev
  restart so the migration ran): `/admin/providers` 200 states the `default` chip
  on the legacy `savant` row and renders 4 **Make default** buttons (5 rows, 1
  default); the Delete note reads "Make another provider the default, then delete
  this one"; `POST` with an absent slug → `404`, wrong action → `400`, no session
  → `401`. **No live switch was performed**: moving the default renames published
  ids on the next sync, which is the operator's call.
- verified: lint zero warnings, `npm run quality` PASS (718 files), `tsc --noEmit`
  clean.
- verified: `/`, `/models` 200 after the migration; every `/admin` route 200 with
  a session (`.scratch/admin-pages.json`).

## Perfection Loop

### Loop 1 — RED

- **RED:** the live row proves it. `/admin/providers` shows the operator's
  legacy row labelled `apinex` under slug `savant`, disabled, 44 rows, with the
  note "The default provider cannot be deleted", and no control anywhere can
  change which row is the default. `grep -rn DEFAULT_PROVIDER_SLUG` finds one
  constant and three literal copies.
- **GREEN:** steps 1–6.
- **AUDIT:** to be recorded with gate output at implementation.
- **ADVERSARIAL:** the strongest objection is that moving the default renames
  published ids, so the feature is a footgun and the honest answer is to refuse
  it. That is why step 3 returns counts and step 4 states when they take effect:
  an operator who is told "44 ids will move on the next sync of each provider"
  can decide, and one who is not told will be surprised by `503 model_not_found`
  after a sync. The other objection — that a persisted flag is a second source of
  truth beside `sort_order` — is answered by the partial unique index: the
  database holds at most one, and every read goes through one function.
- **CHANGE DELTA:** 0% — first convergence pass.

### Missed Questions

1. **Should the default have to be enabled or configured?** No. The flag names
   the namespace owner and the published badge subject; a disabled default publishes
   an honest "disabled/unconfigured" badge, which is what the curl of the landing
   page already shows today. Refusing would block the very operation the operator
   needs — moving the flag off a dead row — while that row is still disabled.
2. **Should switching also rewrite ids in place?** No. `models.id` is the string
   customers send; rewriting it in place would silently change the meaning of
   historic `usage_events.model_id` rows and break references we cannot enumerate
   (keys, content links, showcase rows). The next sync is the honest moment for a
   new namespace, and the console says so.
3. **What if two rows are flagged by an old database?** The index makes that
   state impossible to create. The migration runs only when no row is flagged, so
   it cannot add a second.

### Loop 2 — Implementation audit

- **RED:** the first implementation put the backfill inside `providerColumns`,
  which runs **before** `catalogSeeds` inserts the rows, so a fresh database had
  no default at all — caught by the new suite (`defaults(db)` returned `[]`).
  Moved to `pickDefaultProvider`, called after the seeds.
- **GREEN:** the pick is now idempotent: it fires only while no row is flagged, so
  a boot after an operator switch cannot undo it.
- **AUDIT:** the tests found two real couplings. `buildSyncedCatalog` with a
  missing default silently prefixes every id (`undefined === slug` is false), which
  is safe but was not what four existing call sites meant —
  `tests/route-election-backfill.test.mjs` and `tests/catalog-normalize.test.mjs`
  now pass the default explicitly, and `tests/providers.test.mjs` was updated to
  the three-argument `publicModelId`. Lint raised 12 import-order/prettier
  warnings; all fixed by hand, no `--fix`.
- **ADVERSARIAL:** the strong objection was that a switch is a footgun. Answer:
  the id change is unavoidable for a namespace owner, so the feature is only
  acceptable if the consequence is measured and stated — the route returns
  `previousPublishedIds` and `publishedIds`, the confirm dialog repeats them, and
  `docs/providers.md` says when they take effect. A second objection — two sources
  of truth beside `sort_order` — is answered by the partial unique index and one
  read function; `sort_order` now only breaks ties where nothing is flagged.
- **CHANGE DELTA:** +1 column, +1 index, +1 route verb, +2 tests, and the constant
  survives only as the name an empty registry is described by.

### Loop 3 — Boundary checks

- **The index, not the code, guarantees one holder.** A raw second flag is refused
  by PostgreSQL and a test asserts that.
- **The fallback is deterministic and not sticky.** With no flag set, the enabled
  row with the lowest `sort_order` wins; a disabled legacy seed is skipped while an
  enabled row exists.
- **The guard follows the fact, not the slug.** The `savant` row deletes cleanly
  once it is no longer the default, and the new default inherits the refusal — both
  asserted.
- **No history is rewritten.** `setDefaultProvider` writes one column on two rows;
  no `models.id`, `usage_events.model_id`, key or content row is touched, so a
  ledger entry keeps the id it was sold under.
- **Preview keeps its no-database signature.** The default reaches it as a
  parameter from the route, so "preview writes nothing" remains a property of the
  type.
- **The switch is not a re-sync.** Nothing is fetched or imported by it, so it
  cannot fail halfway through a vendor read.

## Resolution

- **Closed Date:** 2026-11-24
- **Fix Description:** The default provider is now `providers.is_default` — one
  holder enforced by a partial unique index, chosen once at migration and moved by
  **Make default** on `/admin/providers`. The id rule, the published badge, the
  metadata overlay and the delete guard all read the stored fact, so the legacy
  `savant` row can be demoted and then deleted. A switch reports the number of
  published ids that change on each side and does not rewrite anything: the next
  sync of each provider publishes under the new rule, and `docs/providers.md`
  states that.
- **Tests Added:** `tests/provider-default-postgres.test.mjs` (8) and
  `tests/provider-public-id.test.mjs` (2).
- **Verification Evidence:** `npm run verify` PASS 12/12, 1277/1277;
  `.scratch/probe-default-live.mjs` output quoted above; `docs/providers.md`
  "The default provider".
- **Archived:** 2026-11-24 → `dev/fids/archive/`
