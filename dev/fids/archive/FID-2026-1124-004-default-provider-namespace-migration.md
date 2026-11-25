# FID: Default-provider switch breaks the next catalog sync

**Filename:** `FID-2026-1124-004-default-provider-namespace-migration.md`
**ID:** FID-2026-1124-004
**Severity:** critical
**Status:** closed
**Created:** 2026-11-24 23:55
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

`FID-2026-1124-002` made the public id namespace owner a stored fact
(`providers.is_default`) and deliberately did **not** rewrite existing
`models.id` values: the next sync of each provider was declared to publish under
the new rule. That declaration is unimplementable as written. `models` carries
`UNIQUE (upstream_slug, upstream_id)` (`models_upstream_idx`) while
`replaceModels` upserts `ON CONFLICT (id)`, so the first sync after a switch
either collides with the *other* provider's row or duplicates its own upstream
key, and PostgreSQL refuses the transaction. The provider's catalog then cannot
sync at all until the default is moved back.

The same sync also reads the operator's preserved overrides from the wrong row
(`existing.get(model.id)`), so a switch that *did* succeed would apply one
model's manual group, manual cost and manual sell price to a different model.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `f2e1a53` on `main`, clean tree

## Detailed Description

### Problem

The two keys disagree. Identity is by published id:

`lib/storage/store/model-sync.ts:57-66`

```sql
INSERT INTO models
  (id, upstream_id, upstream_slug, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  upstream_id = excluded.upstream_id,
  upstream_slug = excluded.upstream_slug,
```

and the unique index is by upstream tuple:

`lib/storage/schema/catalog.ts:269-271`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS models_upstream_idx
  ON models(upstream_slug, upstream_id);
```

The published id is a function of *who is default*
(`lib/providers/registry.ts:246-254`):

```ts
export function publicModelId(defaultSlug, providerSlug, upstreamId) {
  return defaultSlug === providerSlug
    ? upstreamId
    : `${providerSlug}/${upstreamId}`;
}
```

and sync feeds it the stored default (`lib/storage/providers/sync.ts:186-193`):

```ts
} = buildSyncedCatalog(provider, models, metadata, await getDefaultProviderSlug(db));
await replaceModels(db, synced, await getMarkupBps(db), slug);
```

Walk the transition. Before the switch, default is `savant`:

| id | upstream_slug | upstream_id |
| --- | --- | --- |
| `gpt-5` | `savant` | `gpt-5` |
| `inferhub/gpt-5` | `inferhub` | `gpt-5` |

`setDefaultProvider(db, 'inferhub')` (`lib/storage/store/providers.ts:119-156`)
writes one column on two rows and nothing else. The next sync of `inferhub`
computes `id = 'gpt-5'` for its `gpt-5` row, then:

- **Overlapping model** — `ON CONFLICT (id)` matches the `savant` row and tries to
  set `('inferhub','gpt-5')`, which the existing `inferhub/gpt-5` row already
  holds → `23505` on `models_upstream_idx`.
- **Provider-only model** (`foo`) — `id = 'foo'` does not exist, so Postgres
  executes the insert, and `('inferhub','foo')` is already held by
  `inferhub/foo` → the same `23505`.

Because `replaceModels` runs its writes inside `db.transaction(...)`
(`model-sync.ts:92-170`), the whole sync rolls back: `in_catalog = 0` is undone
too, so the catalog is unchanged rather than half-written. The failure is total
and repeatable, not a partial corruption.

### Expected Behavior

1. Switching the default must leave the database in a state where **every**
   provider can sync successfully.
2. A switch must never move one model's operator overrides onto another model.
3. The mechanism must be explicit about what happens to customer-visible ids,
   because a published id is the string a customer sends.

### Root Cause

`FID-2026-1124-002` paired a changing id function with a fixed key. Its
non-goals say "No rewrite of existing `models.id` values, and no aliasing layer",
which is only safe if nothing else in the table is keyed by the upstream tuple.
Two things are: the unique index, and the override-preservation lookup.

### Evidence

```text
lib/storage/schema/catalog.ts:270   CREATE UNIQUE INDEX IF NOT EXISTS models_upstream_idx
lib/storage/schema/catalog.ts:271     ON models(upstream_slug, upstream_id);
lib/storage/store/model-sync.ts:64    ON CONFLICT (id) DO UPDATE SET
lib/storage/store/model-sync.ts:43    for (const row of await db.prepare("SELECT * FROM models").all<ModelRow>())
lib/storage/store/model-sync.ts:99      const current = existing.get(model.id);
lib/storage/store/providers.ts:146-151  UPDATE providers SET is_default = 0 ... is_default = 1
lib/providers/registry.ts:251-253       defaultSlug === providerSlug ? upstreamId : `${providerSlug}/${upstreamId}`
```

Dependent-key survey (`grep -n "model_id" lib/storage/schema`):

```text
billing.ts:85    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE   (plan_models)
billing.ts:125   model_id TEXT NOT NULL                                          (subscription_models)
content.ts:80    model_id TEXT NOT NULL                                          (content.model_links)
content.ts:123   model_id TEXT NOT NULL                                          (content.watches)
core.ts:112      model_id TEXT NOT NULL                                          (usage_events)
pricing.ts:20    model_id TEXT NOT NULL                                          (pricing_decisions)
```

`plan_models.model_id` declares no `ON UPDATE` action, so it is a hard
restriction on any `models.id` update; `subscription_models.model_id` declares no
foreign key at all, so it would dangle silently.

## Impact Assessment

### Affected Components

- `lib/storage/store/providers.ts` — `setDefaultProvider`
- `lib/storage/store/model-sync.ts` — key used for preservation and upsert
- `lib/storage/schema/catalog.ts` — index that enforces the invariant
- `lib/storage/store/overview.ts`, `app/admin/(panel)/providers` — the reported
  counts that describe the change
- `docs/providers.md` — the contract statement that has to change

### Risk Level

- [x] Critical: after a default switch, the new default's sync fails closed
      forever, so its catalog silently stops updating (price, availability and
      delistings all freeze). The override-misattribution path would corrupt
      operator pricing if the key were made to agree without fixing the lookup.

## Proposed Solution

### Options considered

| Option | Shape | Verdict |
| --- | --- | --- |
| **A. Switch-time re-key** | `setDefaultProvider` migrates the two affected providers' ids in one transaction | **Recommended** |
| B. Decoupled namespace flag | a second stored flag owns the namespace; `is_default` only owns the badge/overlay | Rejected: two flags whose relationship has to be re-explained everywhere, and the original operator complaint was that the namespace owner is invisible |
| C. Always prefix every provider | remove bare ids entirely | Rejected: breaks every existing customer key at once |

### Approach

Option A. A switch is the only moment the id function changes, so it is the one
place the database must be rewritten. The work is ordered so no intermediate
state violates `PRIMARY KEY (id)` or `models_upstream_idx`, and the entitlements
move with the ids while history keeps the strings it was sold under.

### Steps

1. **Predict the migration.** In `setDefaultProvider`, compute the new id for
   every row of both affected providers with `publicModelId(nextDefault, slug,
   upstream_id)`, and the previous id from the current flag. Do this before
   writing anything, so an unresolvable case (a target id already held by a
   third provider — impossible under the current rule, but cheap to assert) is a
   refusal rather than a half-applied switch.
2. **Re-key in one transaction, in three phases.** (a) move both providers' rows
   into a private temporary namespace (`id = id || '\u0001'`, which cannot
   collide with a public id and keeps the swap unique-safe); (b) write each row's
   final id; (c) leave the flag update where it is. All three phases run in the
   existing `db.transaction(...).immediate()`.
3. **Move the entitlements, keep the history.** Inside the same transaction
   update `plan_models.model_id`, `subscription_models.model_id`,
   `content.model_links.model_id`, `content.watches.model_id` and
   `showcase.bindings.model_id` via the computed old→new map. **Do not** rewrite
   `usage_events.model_id`, `pricing_decisions.model_id` or `identity.*`: those
   record what a customer was sold, which is exactly what `FID-2026-1124-002` was
   protecting.
4. **Fix the preservation lookup.** In `replaceModels`, key `existing` by
   `` `${upstream_slug}\u0000${upstream_id}` `` instead of `id`, and read
   `current` by that key. Restrict the preload to `WHERE upstream_slug = ?` so a
   sync does not load the whole table.
5. **Reconcile and report.** Run `reconcileRoutes(db)` after the re-key (the
   served-route columns are derived from ids and membership), and keep the
   existing `previousPublishedIds` / `publishedIds` counts as the confirmation
   numbers — they now describe ids that have already moved, so the labels become
   past tense.
6. **State the contract.** `docs/providers.md` says a switch re-keys the two
   affected providers immediately and that a client holding an old id receives
   `404 model_not_found`; it also says history is not rewritten. This replaces
   the "the next sync publishes under the new rule" sentence, which is retracted.
7. **Cover both directions.** The old default's rows gain a prefix and the new
   default's rows lose one, so the test must switch `savant` → `inferhub` → back,
   syncing in between, with a model id that exists on **both** providers plus a
   model that exists on only one.

### Non-goals

- No aliasing table and no second published id. One id, one owner.
- No change to `publicModelId`, the partial unique index, or the delete guard.
- No re-sync triggered by a switch: the switch fixes identity; fetching remains
  an explicit sync.

### Verification

`tests/provider-default-rekey-postgres.test.mjs` on a disposable database:
seed two providers with an overlapping id and a provider-only id, switch the
default, sync both, and assert (a) no exception, (b) `SELECT COUNT(*) FROM models
WHERE id IN (...)` matches the post-switch map, (c) `models_upstream_idx` has no
duplicates, (d) `subscription_models` and `plan_models` point at the new ids,
(e) `usage_events.model_id` still holds the old id, (f) a manual group and manual
sell price stay attached to the same `(upstream_slug, upstream_id)` across the
switch, and (g) switching back restores the original ids. Plus the existing
`tests/provider-default-postgres.test.mjs` still passing.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-default-rekey-postgres.test.mjs
- gate: test tests/provider-default-postgres.test.mjs
- gate: test tests/provider-public-id.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-11-25 — `npm run verify` PASS, 12/12 gates.
- `node --test tests/provider-default-rekey-postgres.test.mjs tests/provider-default-postgres.test.mjs tests/provider-public-id.test.mjs`: 15/15 pass, 0 skipped.
- `npm test`: 1282/1282 pass, 0 skipped. `npm run test:postgres`: 20/20.
- `npm run check`, `npm run quality` (719 files), `npm run build`: exit 0.

### Convergence Receipt (read-only)

- `git rev-parse --short HEAD` → `f2e1a53`; tree clean.
- The collision walk in §Problem was derived from the four quoted statements, not
  from a run. Implementation must reproduce it as the RED case of the new suite
  before the fix lands; if the reproduction fails, this FID is wrong and is
  reopened rather than patched.

## Perfection Loop

### Loop 1 — RED

- **RED:** the archive record `FID-2026-1124-002` asserts "a sync of the new
  default publishes its ids bare" as a whole solution. Reading
  `model-sync.ts:57-66` beside `schema/catalog.ts:269-271` shows the assertion is
  false in the presence of any existing row for that provider.
- **GREEN:** steps 1-7.
- **AUDIT:** every claim is a quoted line at `f2e1a53`; the dependent-key survey
  is `grep` output, not inference.
- **ADVERSARIAL:** the first objection is that this contradicts an archived,
  "verified" FID. It does, and the archive is wrong on this point: verification
  covered the flag, the index, the guard and the pure id rule, but no test synced
  a provider *after* a switch — which is why `tests/provider-default-postgres.test.mjs`
  passes while the path is broken. The second objection is that re-keying at
  switch time breaks live customers; the answer is that the alternative breaks
  them on the next sync instead, and the switch is the operator's deliberate act
  with a measured count in front of it.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Why not re-key inside `replaceModels` when it notices the id changed?** Because
   a sync may touch only its own provider (invariant 5 in `model-sync.ts:22-26`),
   and the collision is cross-provider: the incoming bare id is held by the
   outgoing default's row, which this provider's sync must not rewrite.
2. **What about a database where no switch ever happened?** Nothing moves: the
   map is empty and the transaction writes the same flag it writes today.
3. **Does `content.watches` matter?** It is keyed `(user_id, model_id)`; if it is
   not migrated, a customer's saved model silently vanishes instead of failing
   loudly. It is in step 3 for that reason.
4. **Is the temporary-id suffix safe?** `'\u0001'` cannot appear in an upstream id
   (`lib/providers/model-list.ts` only accepts trimmed strings, and ids are
   path-shaped) and is not a legal published id, so phase (a) cannot collide with
   a real row.

### Loop 2 — Independent audit and self-correction

- **RED:** step 4 as first drafted also changed the upsert's conflict target to
  `(upstream_slug, upstream_id)`. That is not expressible: `ON CONFLICT` needs a
  unique index over exactly those columns *without* the `id` primary key in the
  way, and switching the conflict target would still fail on a `PRIMARY KEY`
  collision. Corrected: the conflict target stays `(id)`; only the *preservation
  lookup* changes key.
- **GREEN:** step 4 now changes only the map key and the preload filter.
- **AUDIT:** with identities reconciled by step 2, the incoming id equals the
  stored id for every row of that provider, so `ON CONFLICT (id)` updates in
  place and the upstream index is never asked to hold a duplicate.
- **ADVERSARIAL:** "what if the transaction is interrupted?" It cannot be: the
  temporary namespace, the final ids and the flag are one transaction, so a
  crash leaves either the old world or the new one.
- **CHANGE DELTA:** ~8%.

### Loop 3 — Final convergence

- **RED:** residual risk that `reconcileRoutes` after a re-key republishes a
  different `publishedId` for a group, changing which row serves. That is
  correct behaviour (membership by id changed) but it must be asserted, not
  assumed.
- **GREEN:** the test asserts the post-switch serving row for the overlapping id
  explicitly.
- **AUDIT:** `reconcileRoutes` is already called by `replaceModels` and by
  `deleteProvider`; adding it to `setDefaultProvider` keeps one rule for "ids
  changed, republish".
- **ADVERSARIAL:** "this could have been avoided by not letting the id depend on
  the default." Agreed — that is option C/B, and the record keeps both with their
  costs instead of pretending the coupling is free.
- **CHANGE DELTA:** <2% — converged.

## Implementation Evidence (REQUIRED for `closed`)

- **Commit SHA:** `a629d38` (`fix(providers): re-key public ids on a default switch (FID-2026-1124-004)`).
- **File:line ranges:** `lib/storage/store/provider-rekey.ts` (plan, collision refusal, temporary-namespace swap, dependent migration); `lib/storage/store/providers.ts` — `setDefaultProvider` re-keys inside the flag transaction and republishes routes; `lib/storage/store/model-sync.ts` — `replaceModels` preserves overrides by `(upstream_slug, upstream_id)` and preloads only the syncing provider; `components/admin/providers-panel.tsx` and `docs/providers.md` state the immediate consequence.
- **Gate output:** `npm run verify` PASS 12/12 gates — check, storage:check, config:check, repository:check, test 1282/1282, test:postgres 20/20, quality, build, visual builds, HTTP, recovery, deployment receipt. Focused rekey suite 5/5; the three-file provider suite 15/15.
- **Reproducibility:** `grep -rn rekeyProviderIds lib` returns the definition and the `setDefaultProvider` call; `tests/provider-default-rekey-postgres.test.mjs` seeds two providers with one overlapping upstream id and one provider-only id, so the `23505` path is exercised rather than described.
- **Step statuses:** steps 1–7 `implemented`.

## Resolution

- **Closed Date:** 2026-11-25
- **Fix Description:** a switch now re-keys both affected providers in the flag's transaction. Rows move to a temporary `U+0001` namespace, then to their final ids; `plan_models` moves in the same statement as `models` through a data-modifying CTE so the immediate foreign key never sees a dangling id. Subscription entitlements, saved-model watches, content links, showcase bindings and aliases follow the model; `usage_events`, `pricing_decisions` and `content.link_decisions` keep the id they were recorded under. A target id owned by a third provider is refused before any write, and routes are republished after the swap.
- **Tests Added:** Yes — `tests/provider-default-rekey-postgres.test.mjs`, 5 cases: collision-free re-key, entitlement migration with usage history intact, sync after switch with manual overrides kept, switch-back restoration, and refusal on a foreign target id.
- **Verification Evidence:** the receipt above; `npm run verify` PASS on the implementation tree.
- **Archived:** 2026-11-25 — moved to `dev/fids/archive/`.

## Lessons Learned

A unique constraint and a conflict target encode the same identity assumption in
two places; changing what an id *means* without migrating the rows leaves them
disagreeing. When an archived FID declares a non-goal ("do not rewrite ids"), the
implementation must still prove that the omitted work is not required by a key
somewhere else — and a switch-then-sync test would have caught this in one line.
