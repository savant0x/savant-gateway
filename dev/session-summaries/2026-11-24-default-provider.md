# Session summary — 2026-11-24 — the default provider becomes a fact

## What the operator asked for

"there is also no way to change the default provider".

## What "default provider" actually was

A constant, `DEFAULT_PROVIDER_SLUG = "savant"` in `lib/providers/registry.ts`,
copied as a literal in `lib/storage/store/overview.ts`,
`app/api/admin/providers/[slug]/route.ts` and — until this session removed it —
`components/admin/provider-actions.tsx`. It decided four things:

| Consumer | Effect |
| --- | --- |
| `publicModelId` | the default's rows keep bare ids; others are `slug/id` |
| `overview.ts` | whose balance/quota/`synced_at` the landing page and `/admin` publish |
| `providers/sync.ts` | which catalog receives the public metadata overlay |
| `deleteProvider` + the route | which row can never be deleted |

The operator's live row made the defect concrete: slug `savant`, label
`apinex`, disabled, 44 models, `health: error`, and undeletable. The slug is only
editable when creating a provider (`provider-form.tsx` renders the field when
`!editing`), so the row could not even be renamed to match its label.

## The chosen design (operator picked it over a slug rename)

The default is one stored fact:

- `providers.is_default INTEGER NOT NULL DEFAULT 0`, plus
  `CREATE UNIQUE INDEX providers_default_idx ON providers(is_default) WHERE
  is_default = 1` — the database, not a code path, holds "at most one".
- `pickDefaultProvider()` runs after the seeds and only while nothing is flagged,
  choosing the legacy seed, else the enabled row with the lowest `sort_order`.
- `getDefaultProviderSlug(db)` is the one read; `getDefaultProvider`,
  `deleteProvider`, `overview.ts` and `getProviderStatus` all use it.
- `setDefaultProvider(db, slug)` clears the flag and sets the target in one
  transaction, returning the outgoing slug plus the measured published-row count
  on both sides.

## The consequence, stated rather than discovered

Moving the default changes which ids are bare. Existing rows are **not**
rewritten: a public id is what customers send, and `usage_events.model_id` is
history. So the change is published by the *next sync* of each provider. The
route returns `previousPublishedIds` and `publishedIds`, the confirm dialog
repeats them, and `docs/providers.md` says exactly when they take effect.

## Two implementations the tests corrected

1. **The backfill ran too early.** It sat in `providerColumns`, which runs before
   `catalogSeeds` inserts rows, so a fresh database had no default at all. The
   new suite caught it (`defaults(db)` was `[]`); the pick moved after the seeds.
2. **A missing default silently prefixes.** `buildSyncedCatalog` with no default
   argument treats `undefined === slug` as false, so it prefixes everything —
   safe, but not what four existing call sites meant. Those call sites now pass
   the default explicitly and `publicModelId`'s callers were updated to three
   arguments.

## Live evidence (no switch performed)

`/admin/providers` 200 with the `default` chip on `savant` and four **Make
default** buttons; Delete note reads "Make another provider the default, then
delete this one"; `POST /api/admin/providers/<slug>` answers `404` for an absent
slug, `400` for a wrong action and `401` without a session. The switch itself is
the operator's decision, because it renames the public catalog at the next sync.

`npm run verify` PASS — 12/12 gates, 1277/1277 tests, 0 skipped.

## What the operator should do next

1. `/admin/providers` → **Make default** on the provider that should own the
   namespace (InferHub is the enabled one today). Read the two counts, confirm.
2. Optional: once `savant` is demoted, **Delete** it — that removes 44 dead rows
   that today only exist because the guard protected them.
3. Press **Sync** on the providers whose namespace changed, when ready for the new
   ids to be published.

## Law 1

No project file was edited through a script this session. Lint raised 12
import-order and prettier warnings; each was fixed with targeted edits rather than
`eslint --fix`, because a formatter run is a scripted transform.
