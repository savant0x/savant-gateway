# FID: First-class model groups with operator assignment

**Filename:** `FID-2026-1029-007-model-group-control.md`
**ID:** FID-2026-1029-007
**Severity:** high
**Status:** verified
**Created:** 2026-10-29 10:18 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Related record:** FID-2026-1029-008 owns customer subscription plans,
entitlements, and recurring billing. This FID owns only the catalog group.

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. `verified`
means the implementation and gates are complete; closure still requires the
implementation commit recorded in this FID. The repository gates are `lint`,
`typecheck`, `test`, `quality`, `build`, and `verify`.

## Summary

The admin panel cannot manage model groups. It can enable or disable a model
and edit a sell price, but the group shown in the catalog is derived entirely
from the provider row: `free` when `allow_free = 1` and `token_weight > 0`,
`subscription` when the id starts with `free/`, and `paid` otherwise. There is
no group table, no create/rename/delete flow, and no way to assign a model to a
different group. A provider sync rewrites the provider flags, so even a direct
database edit is not durable.

This FID adds first-class model groups. The operator can create unlimited
custom groups, choose each group's billing mode, assign any model to any group,
edit the group label and order, and delete a custom group only by explicitly
reassigning its models. The three existing groups remain protected system
groups. Assignments made in the admin panel survive provider syncs. Pricing,
routing, public catalog labels, and the API continue to work from the same
billing rules.

## Environment

- **OS:** Windows 11, Git Bash.
- **Runtime:** Node `v24.21.0`, npm `12.2.1`.
- **Tool Versions:** Next.js `16.4.3`, React `19.3.0`, HeroUI `3.2.7`,
  Tailwind CSS `4.3.3`, better-sqlite3 `13.0.3`, TypeScript `5.9.3`.
- **Commit/State:** `b5ae9fc` on `main`; FID-007 implementation is in the
  working tree and uncommitted. Design baseline was `48c21e1`.

## Detailed Description

### Problem

The admin catalog shows a Group column, but it is read-only. The current
implementation has no group entity and no group mutation:

- `accessFor` derives the group from `allow_free`, `token_weight`, and the
  `free/` id prefix.
- The catalog PATCH route accepts only `active` and `disabled`.
- The pricing PATCH route rejects free rows with
  `Free-pool models are always priced at zero.`
- Free rows render fixed "Free" prices and a disabled Save button.
- A provider sync updates `allow_free` and `token_weight` on every row, so a
  manual group change would be lost.

This blocks the operator from doing any of the following:

- moving a free-pool model into a paid group and charging for it;
- moving a paid model into a free group;
- creating a group such as `starter`, `enterprise`, or `beta`;
- renaming a group without changing the provider catalog;
- removing a custom group safely;
- preserving a deliberate group choice across a provider sync.

### Expected Behavior

The admin panel becomes the authority for group membership and presentation:

1. The database seeds three protected system groups: `free`, `paid`, and
   `subscription`.
2. The operator can create unlimited custom groups with a unique slug, a
   display label, an optional description, a billing mode, and a sort order.
3. The operator can edit a custom group's label, description, billing mode,
   and sort order. The slug is immutable after creation so public API
   identifiers and bookmarks do not drift.
4. System groups keep their fixed slugs and billing modes. Their label,
   description, and sort order may be edited, but they cannot be deleted and
   their billing mode cannot be changed.
5. The operator can assign any catalogued model to any group from the catalog
   table. The assignment is a manual override and survives a provider sync.
6. A model without a manual override follows the provider-derived default on
   each sync.
7. A free group forces both sell prices to zero and routes without a credit
   hold. A paid group requires a non-zero sell price and settles actual usage.
   A subscription group is a catalog tier whose plan entitlement is owned by
   FID-2026-1029-008; the group itself does not grant a subscription.
8. Deleting a custom group requires an explicit destination group. Its models
   move in one transaction; historical usage keeps the group snapshot it was
   billed under.
9. The public catalog, admin catalog, pricing page, filters, and `/v1/models`
   expose the custom group label without breaking the existing `access`
   billing-mode field.
10. Every group mutation is admin-session guarded, same-origin checked, and
    validated on the server.

### Root Cause

Groups are a presentation detail computed from provider flags. There is no
first-class row to own a group name, billing mode, order, or model membership,
and no `manual`/`auto` source flag to survive sync. The admin APIs were built
around model status and price only, so no write path exists for membership.

### Evidence

`lib/store/shared.ts:99-105` derives the group:

```ts
export function accessFor(
  row: Pick<ModelRow, "allow_free" | "token_weight" | "provider" | "id">,
): ModelAccess {
  if (row.allow_free === 1 && row.token_weight > 0) return "free";

  return row.id.startsWith("free/") ? "subscription" : "paid";
}
```

`app/api/admin/models/route.ts:7` accepts only status values:

```ts
const STATUSES = new Set(["active", "disabled"]);
```

`app/api/admin/pricing/route.ts:52-54` rejects a free row:

```ts
if (model.access === "free") {
  return adminError(400, "Free-pool models are always priced at zero.");
}
```

`lib/store/models.ts:126` rewrites the provider flags on every sync:

```sql
allow_free = excluded.allow_free,
```

`components/admin/pricing-row.tsx` disables the price controls when
`model.access === "free"` and shows `Free` instead of inputs. The catalog table
has a Group column but no group control; its only action is Disable/Enable.

`app/v1/models/route.ts:31` currently publishes the billing mode as `group`:

```ts
group: model.access,
```

There is no `model_groups` table, no group API route, no group page, and no
`groups` entry in `components/admin/admin-nav.tsx`.

## Impact Assessment

### Affected Components

- `lib/db.ts` — `model_groups` table, `models.group_slug`,
  `models.group_source`, `usage_events.group_slug`; additive migration and
  system-group seed/backfill.
- New `lib/model-groups.ts` — pure validation, reserved-slug rules, billing
  mode rules, reassignment checks, and display helpers.
- New `lib/store/groups.ts` — CRUD, counts, assignment, and transactional
  reassignment.
- `lib/store/shared.ts`, `lib/store/models.ts`, `lib/store/overview.ts`,
  `lib/store/pricing.ts`, `lib/store/usage.ts`, `lib/gateway.ts` — group joins,
  billing decisions, and usage snapshots.
- New `app/api/admin/groups/route.ts` — group list/create/update/delete.
- `app/api/admin/models/route.ts` — accept `groupSlug` as a second mutation.
- `app/api/admin/pricing/route.ts` — evaluate free status from the group.
- `app/api/models/route.ts`, `app/v1/models/route.ts`, `lib/types.ts` — additive
  group fields while keeping `access` and the existing `group` field stable.
- New `app/admin/(panel)/groups/page.tsx` and `components/admin/groups-*`.
- `components/admin/models-table.tsx`, `components/admin/pricing-table.tsx`,
  `components/admin/pricing-row.tsx`, `components/admin/admin-nav.tsx`,
  `components/catalog/model-catalog-table.tsx`,
  `components/dashboard/chips.tsx`.
- `tests/model-groups.test.mjs` — pure group rules and access mapping.
- `README.md`, `AGENTS.md`, `knowledge.md`, `docs`/API reference, and
  `SCOPE.md`.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability.
- [x] High: Major feature broken or missing.
- [ ] Medium: Feature degraded, workaround exists.
- [ ] Low: Minor issue, cosmetic, or edge case.

The missing control is a product gap, not a crash. Containment is the existing
free/paid derivation, which remains correct until the migration runs. The
migration is additive and does not delete models, prices, keys, or usage.

The main new economic risk is deliberate: assigning a model whose upstream
cost is non-zero to a free group produces zero revenue on a positive-cost call.
The admin UI must warn when a model with `costInputMicros > 0` or
`costOutputMicros > 0` is assigned to a free group; the operator still owns the
decision.

## Proposed Solution

### Approach

Add a group table and a nullable model membership with an explicit source. Keep
`allow_free` and `token_weight` as upstream facts; move the access decision to
the group's billing mode. Backfill current groups so behavior does not change
on migration. Extend the admin surface with group CRUD and a group selector,
and preserve manual assignments through sync.

The existing public `access` field remains the billing mode (`free`, `paid`,
`subscription`). The existing `/v1/models` `group` field also remains the
billing mode for compatibility. New additive fields expose the custom group:

- `group_slug` / `groupSlug`
- `group_label` / `groupLabel`
- `group_billing_mode` / `groupBillingMode`

The public catalog's Group column and filters use the custom group label; the
billing behavior still reads `access`.

### Data Model

```sql
CREATE TABLE model_groups (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL COLLATE NOCASE UNIQUE,
  billing_mode TEXT NOT NULL
    CHECK (billing_mode IN ('free', 'paid', 'subscription')),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE models ADD COLUMN group_slug TEXT
  REFERENCES model_groups(slug) ON DELETE RESTRICT;
ALTER TABLE models ADD COLUMN group_source TEXT NOT NULL DEFAULT 'auto'
  CHECK (group_source IN ('auto', 'manual'));
ALTER TABLE usage_events ADD COLUMN group_slug TEXT;
```

`group_slug` is nullable only during the additive migration. The migration
backfills every existing row, and application code treats a null as the
provider-derived default; new syncs always write a group. `group_source` is
`manual` when an operator assigns a model and `auto` otherwise. A provider sync
updates `group_slug` only when the source is `auto`.

System groups are seeded idempotently:

| slug | label | billing_mode | is_system |
|---|---|---|---|
| `free` | Free | `free` | 1 |
| `paid` | Paid | `paid` | 1 |
| `subscription` | Subscription | `subscription` | 1 |

The migration maps each existing model to the system group matching the
current `accessFor` result, and sets `group_source = 'auto'`.

### Rules

- **Free billing mode:** the gateway does not reserve credit, the effective
  sell price is zero, and both stored sell prices are forced to zero when the
  group is assigned or its mode changes to free. Weighted usage still uses the
  model's provider `token_weight` when present. A warning is shown for
  positive upstream cost.
- **Paid billing mode:** the gateway requires at least one non-zero sell price;
  a zero/zero model remains catalogued but returns `503 model_unpriced` until
  priced. A credit hold is reserved and actual usage is settled.
- **Subscription billing mode:** the row is visible and labeled as a
  plan-only tier. Plan access, recurring billing, included allowances, and
  entitlement checks are owned by FID-2026-1029-008. This FID stores the group
  and its price behavior; it does not invent a subscription service.
- **Group change:** assigning a free group zeros prices. Changing to paid or
  subscription leaves existing prices untouched; a zero/zero row is allowed
  but visibly unpriced and blocked at request time. No hidden auto-markup is
  applied.
- **Slug:** immutable after creation, lowercase `^[a-z][a-z0-9-]{1,31}$`,
  unique, and reserved values are `free`, `paid`, `subscription`.
- **Label:** trimmed, 1–40 characters, case-insensitive unique.
- **Description:** optional, trimmed, maximum 200 characters.
- **Sort order:** integer; lower values render first, then label.
- **Deletion:** only `is_system = 0` groups. The request must name a different
  existing `reassignTo` group. One transaction moves the models, sets
  `group_source = 'manual'`, records the reassignment, and deletes the group.
  The destination may be a system or custom group.
- **System group edit:** label, description, and sort order only. Slug,
  billing mode, and deletion are rejected with `400`.
- **Historical usage:** `usage_events.group_slug` is written at settlement
  time. Changing or deleting a group never rewrites history, and a deleted
  group's slug remains readable in old usage rows.
- **Sync:** provider fields continue to update; a manual `group_slug` is
  preserved. A new model gets the provider-derived system group. A delisted
  model keeps its manual group.
- **API compatibility:** `access` and `/v1/models` `group` remain the billing
  mode. Custom group naming is additive, so existing clients do not break.

### API Contract

`GET /api/admin/groups`

```json
{
  "groups": [
    {
      "slug": "free",
      "label": "Free",
      "billingMode": "free",
      "description": null,
      "sortOrder": 0,
      "isSystem": true,
      "modelCount": 11
    }
  ]
}
```

`POST /api/admin/groups`

```json
{
  "slug": "starter",
  "label": "Starter",
  "billingMode": "paid",
  "description": "Entry paid tier",
  "sortOrder": 10
}
```

`PATCH /api/admin/groups`

```json
{
  "slug": "starter",
  "label": "Starter Plus",
  "billingMode": "paid",
  "description": "Updated label",
  "sortOrder": 20
}
```

`DELETE /api/admin/groups`

```json
{
  "slug": "starter",
  "reassignTo": "paid"
}
```

`PATCH /api/admin/models`

```json
{
  "id": "free/gpt-6-luna",
  "groupSlug": "starter"
}
```

The existing `{ id, status }` shape remains valid. A request may carry
`status`, `groupSlug`, or both; at least one is required.

### UI

- Add **Groups** to the admin navigation at `/admin/groups`.
- The page lists system and custom groups with model count, billing mode,
  system badge, order, edit, and delete actions.
- Create/edit forms use server validation and display field-level errors.
- Delete requires choosing a reassignment group and confirms the model count.
- The catalog table replaces the read-only Group cell with a selector (or a
  compact "Move" action) and shows the current group label and source.
- The pricing table filters/groups are built from the actual group list, not a
  hardcoded free/paid/subscription array. Free inputs remain disabled.
- The public catalog's Group filter and column use custom labels. `AccessChip`
  colors by billing mode but displays the custom label.
- The admin overview may show a group count summary; the groups page is the
  authoritative count.

### Migration and Rollback

The migration is additive:

1. Create `model_groups`.
2. Seed the three system groups.
3. Add `models.group_slug`, `models.group_source`, and
   `usage_events.group_slug`.
4. Backfill each model to the group matching the current `accessFor` result.
5. Create indexes on `models.group_slug` and `model_groups.sort_order`.

Rollback is a code rollback; the extra columns are ignored by the previous
code. No model, price, key, or usage row is deleted. A production backup is
still required before the migration because SQLite schema changes are not free.

### Steps

1. Add the schema, system-group seed, backfill, and indexes in `lib/db.ts`.
2. Add pure group validation and access mapping in `lib/model-groups.ts`.
3. Add `lib/store/groups.ts` with list/create/update/delete/reassign/counts.
4. Add group joins and billing-mode fields to model and gateway store shapes.
5. Update `isFreeCall` and settlement to use the group's billing mode, and
   snapshot `group_slug` into `usage_events`.
6. Add `/api/admin/groups` with admin guard, same-origin checks, validation,
   and transactional mutations.
7. Extend `/api/admin/models` to accept a group assignment and preserve
   `group_source = 'manual'`.
8. Make `/api/admin/pricing` free checks group-aware.
9. Add the Groups page and admin navigation.
10. Add the group selector/filter to the catalog and pricing surfaces.
11. Add custom group fields to public model shapes, `/v1/models`, filters, and
    labels while retaining `access` compatibility.
12. Update the provider sync to preserve manual groups and derive auto groups.
13. Add `tests/model-groups.test.mjs` for validation, reserved slugs, billing
    rules, price reset, reassignment validation, and access mapping.
14. Update README, AGENTS vocabulary, knowledge, and API docs.
15. Run gates and a disposable-database HTTP receipt covering create, assign,
    price, free-to-paid, paid-to-free, sync preservation, system protection,
    delete/reassign, and public labels.

### Verification

The pure test file is `tests/model-groups.test.mjs`. It covers:

- slug and label validation, reserved slugs, duplicate labels;
- billing-mode transitions and free price reset;
- reassignment destination validation;
- system-group edit/delete protection;
- access mapping from a group row;
- the public `access`/`group` compatibility shape.

The HTTP receipt runs on a disposable database and proves:

- create a custom paid group; assign a free-pool model; set a price; call the
  gateway and observe a paid charge and ledger row;
- change the group to free; observe zero charge and no hold;
- change a paid model to a free group and back;
- run a provider sync and confirm a manual assignment survives while an auto
  assignment follows the provider;
- reject system group deletion/billing edit;
- delete a custom group with `reassignTo` and confirm models moved and old
  usage retains the old `group_slug`;
- public `/models` and `/v1/models` show the custom group label and additive
  fields without breaking `access`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-groups.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-10-29T17:27:29Z
- lint: exit 0 (`npm run lint`, zero warnings)
- typecheck: exit 0 (`npm run typecheck`)
- test tests/model-groups.test.mjs: exit 0 (10 cases)
- test: exit 0, 89/89 pass, 0 fail
- quality: exit 0, PASS (400-line ceiling, 160 files scanned)
- build: exit 0, 41 route entries including `/_not-found`
- verify: exit 0 (`npm run verify`, full set)
- disposable DB: copied `data/gateway.db` to a temporary database, booted the
  production build on port 3105, and confirmed all 45 models preserved (10
  free, 23 paid, 10 subscription auto groups; 2 manual paid after the test).
- admin flow: created `resale` (paid), moved
  `free/deepseek-v4-pro-0813` (cost $0) into it, priced $0.50 in / $1.00 out,
  and confirmed `access = paid` with a 100% margin.
- sync: `POST /api/admin/providers/savant/sync` returned 200; the manual
  `resale` group, `group_source = manual`, and $0.50/$1.00 prices survived.
- free reset: created `beta` (free), moved `claude-opus-5.5` into it, confirmed
  both sell prices became zero; deleting it with `reassignTo: paid` moved the
  model and left prices at zero.
- protection: a system group billing-mode edit returned 400; deleting `free`
  returned 400; a duplicate label returned 409; delete-with-reassign returned
  200 and moved the models.
- live charge: a paid call to the moved zero-cost model returned 200, recorded
  `charged_micros = 160`, `weighted_tokens = 0`, and `group_slug = paid`.
- public shape: `GET /api/models` and `GET /v1/models` returned the custom
  group fields while `group` remained the billing mode; `/admin/groups`,
  `/admin/pricing`, and `/admin/catalog` each returned 200.
- cleanup: the temporary server was stopped and its database, cookie, and
  header files were deleted.

## Perfection Loop

### Loop 1 — RED

- **RED:** The admin surface exposes a Group column without a group write path;
  `accessFor` is derived from provider flags; free rows are hard-zero; sync
  overwrites provider flags; there is no group table, route, page, or test.
  The public filter is a hardcoded free/paid/subscription array.
- **GREEN:** Add a first-class group table, system seed/backfill, manual/auto
  membership, group CRUD, group assignment, group-aware pricing/routing, a
  Groups page, dynamic filters, additive public group fields, usage snapshots,
  and tests.
- **AUDIT:** Code evidence above: `lib/store/shared.ts:99-105`,
  `app/api/admin/models/route.ts:7`, `app/api/admin/pricing/route.ts:52-54`,
  `lib/store/models.ts:126`, `app/v1/models/route.ts:31`. The existing
  `npm run verify` baseline is green at `48c21e1`: 48/48 tests, quality PASS
  over 125 files, 33 routes.
- **ADVERSARIAL:** Assigning a positive-cost model to a free group produces
  zero revenue; deleting a group could orphan models; a sync could clobber a
  manual choice; changing the public `group` field could break clients; a
  billing-mode edit could leave unpriced paid rows. The design addresses each
  with a warning, explicit `reassignTo`, `group_source`, additive fields, and
  a visible unpriced state.
- **CHANGE DELTA:** Baseline authoring; no prior version exists, so no
  percentage applies.

### Missed Questions

1. **Are groups billing tiers or labels?** Both. `billing_mode` controls
   routing and charging; `label` and `slug` control presentation and API
   identity. A custom group can share a billing mode with another group.
2. **Can a system group be deleted?** No. It would remove the fallback needed
   by sync and by models whose provider group changes. Labels and order remain
   editable.
3. **Can a slug be renamed?** No. It is the public identifier and is embedded
   in usage snapshots. Rename the label instead; create a new group if a new
   identifier is required.
4. **What happens to prices when a model moves to free?** Both sell prices are
   zeroed in the same transaction. Moving back to paid leaves them zero, so
   the row is visibly unpriced until the operator sets a price.
5. **What happens to historical usage?** `usage_events.group_slug` records the
   group at settlement. A later rename, move, or delete does not rewrite it.
6. **Does group assignment affect existing keys or balances?** No. It changes
   pricing/routing for future calls only; no ledger entry is rewritten.
7. **Does a custom free group require provider `allowFree`?** No. The operator
   can assign any model to a free group. The UI warns when upstream cost is
   positive; the gateway does not reserve credit for that group.
8. **Does a subscription group enforce an entitlement?** Not in this FID.
   FID-2026-1029-008 adds the plan, entitlement, allowance, and
   `subscription_required` behavior. FID-007 deliberately creates only the
   catalog group so the two records do not duplicate each other.
9. **What happens when a custom group is deleted with no models?** It can be
   deleted; `reassignTo` is still required by the API for a uniform contract,
   but the UI may prefill the system paid group.
10. **Does a provider sync re-create a deleted custom group?** No. Sync only
    assigns system defaults to new or auto rows; custom groups are operator
    data.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** Pending. The implementation is uncommitted at
  `b5ae9fc`; closure is blocked on the implementation commit.
- [x] **File:line ranges:**
  - `lib/schema/groups.ts:1-81` — group table, system seed, model columns, and
    access backfill.
  - `lib/model-groups.ts:1-253` — system definitions, validation, default
    group, access mapping, price reset, and reassignment rules.
  - `lib/store/groups.ts:1-259` — list/create/update/delete/assign with
    transactional price and membership updates.
  - `lib/store/shared.ts:20-62,125-177` — group columns, group-first
    `accessFor`, gateway model, and summary fields.
  - `lib/store/models.ts:25-60,184-330` — joined reads, gateway lookups,
    sync-safe group writes, and group-aware markup.
  - `lib/gateway.ts:72-74` — free routing reads `billingMode`.
  - `lib/gateway-settle.ts:113-129` — free groups charge zero.
  - `lib/store/usage.ts:37-86` — weighted tokens and `group_slug` snapshot.
  - `app/api/admin/groups/route.ts:1-122` — guarded group CRUD.
  - `app/api/admin/models/route.ts:23-107` — group assignment in the catalog
    PATCH.
  - `app/api/admin/pricing/route.ts:22-69` — free-group price rejection with a
    move-to-charge message.
  - `app/v1/models/route.ts:28-42` — additive group fields.
  - `app/admin/(panel)/groups/page.tsx:1-42`,
    `components/admin/groups-panel.tsx:1-368`,
    `components/admin/group-fields.tsx:1-84`,
    `components/admin/group-select.tsx:1-74` — admin group surface.
  - `components/admin/models-table.tsx:1-312`,
    `components/admin/pricing-table.tsx:1-284`,
    `components/admin/pricing-row.tsx:1-154` — group selectors and dynamic
    pricing filters.
  - `components/catalog/model-catalog-table.tsx:1-291`,
    `components/dashboard/chips.tsx:1-30` — public labels and filters.
  - `tests/model-groups.test.mjs:1-179` — pure group rules.
- [x] **Gate output:** `npm run verify` exit 0; 89/89 tests, quality PASS over
  160 files, 41-route build. See the Verification Receipt above.
- [x] **Reproducibility:** Grep for `listModelGroups`, `group_billing_mode`,
  `group_slug`, and `assignModelGroup` in the working tree. The disposable-DB
  receipt above can be repeated with `DB_PATH` pointed at a copied database.
- [x] **Step statuses:**
  1. implemented — schema, system seed, backfill, indexes.
  2. implemented — `lib/model-groups.ts` validation and access mapping.
  3. implemented — `lib/store/groups.ts` CRUD, counts, assignment, delete.
  4. implemented — group joins and billing-mode fields in store/gateway shapes.
  5. implemented — `isFreeCall`, settlement, and usage snapshot use the group.
  6. implemented — `/api/admin/groups` with guard and validation.
  7. implemented — `/api/admin/models` accepts `groupSlug` and persists manual
     source.
  8. implemented — pricing free check is group-aware.
  9. implemented — Groups page and admin navigation.
  10. implemented — catalog and pricing group selectors, dynamic filter.
  11. implemented — public group fields and labels, additive compatibility.
  12. implemented — sync preserves manual groups and derives auto groups.
  13. implemented — `tests/model-groups.test.mjs`.
  14. implemented — README, AGENTS, knowledge, CHANGELOG, SCOPE.
  15. implemented — gates and disposable-DB HTTP receipt.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist in the working tree.
- [x] Implementation matches the Proposed Solution, including the protected
  system groups, explicit reassignment, sync-safe membership, group-aware
  billing, usage snapshots, and additive public fields.
- [x] Typecheck/tests/lint pass with pasted tool output in the receipt above.
- [x] Production call-graph evidence is present: the live gateway call returned
  200, charged 160 micros, and wrote `group_slug = paid`; the provider sync
  preserved the manual group and price.
- [x] FID status reflects the actual implementation state: `verified`, not
  `closed`, because the commit is pending.

### Loop 2 — Independent audit and self-correction

- **RED:** The first design risked treating the group as a cosmetic label and
  leaving `isFreeCall` on provider flags. That would let a model appear in a
  paid group while still routing as free. The first deletion design allowed a
  dangling group reference. The first public proposal renamed `group` and
  would have broken existing clients.
- **GREEN:** The billing decision moved to the group's billing mode; deletion
  requires `reassignTo`; public custom fields are additive while `access` and
  `group` remain stable; usage snapshots preserve history.
- **AUDIT:** The design was checked against the actual `accessFor`,
  `isFreeCall`, admin routes, sync upsert, pricing rejection, and public
  payload. Each old behavior has a named replacement or compatibility field.
- **ADVERSARIAL:** A custom free group can still lose money by design; the
  warning is a control, not a hard block. A future multi-instance deployment
  must apply the same transaction around group deletion and model assignment.
- **CHANGE DELTA:** Baseline reconciliation; no measured percentage is claimed
  for a record without a prior version.

### Loop 3 — Final convergence

- **RED:** Remaining pre-implementation risks: schema migration on a live
  database, price reset on free assignment, public API compatibility, and
  sync override preservation.
- **GREEN:** The migration is additive; free assignment zeroes prices in the
  same transaction; public changes are additive; `group_source` protects
  manual assignments. No code is written yet.
- **AUDIT:** The plan names every write path, every public shape, the system
  group invariants, the deletion contract, and the tests that will prove them.
  The current baseline is green at `48c21e1`.
- **ADVERSARIAL:** The strongest remaining challenge is economic, not
  technical: the operator can mark a cost-bearing model free. The design
  surfaces that cost in the admin UI and leaves the decision with the
  operator.
- **CHANGE DELTA:** The record was authored in one pass; no prior draft exists
  to measure. Convergence is based on the resolved questions and the complete
  write-path audit, not a claimed percentage.

### Loop 4 — Implementation audit

- **RED:** The first implementation pass had two quality violations: the
  Groups panel and model store crossed the 400-line ceiling, and HeroUI `Input`
  does not accept a `label` prop. The first pricing copy still said free-pool
  rows were always zero, which was no longer the rule.
- **GREEN:** Extracted `GroupFields` and `group-fields.tsx`, moved
  `toGatewayModel` into `store/shared.ts`, corrected the input labels, and
  rewrote the pricing and README copy around groups.
- **AUDIT:** `npm run lint` and `npm run typecheck` both exit 0 with zero
  warnings; `npm run quality` PASS over 160 files; the full verify exits 0.
  The disposable-DB receipt exercises system protection, create, assign,
  price, sync preservation, free reset, delete/reassign, and the public shape.
- **ADVERSARIAL:** The live charge used a zero-cost `free/` model moved to a
  paid group, which is the exact case the operator reported. The test proved
  `charged_micros = 160` and `weighted_tokens = 0`, so the old free path did
  not run. The remaining risk is economic: assigning a positive-cost model to
  a free group loses money by design; the UI exposes cost but does not block
  the operator.
- **CHANGE DELTA:** Implementation expanded the original design only where the
  existing schema required it: joined group labels in model queries, a
  `group_slug` usage snapshot, and a shared gateway mapper. No public field was
  renamed.

## Resolution

- **Closed Date:** none. Status is `verified`; the implementation commit is
  pending.
- **Fix Description:** First-class model groups with system defaults, custom
  CRUD, manual assignment, sync-safe membership, group-aware billing, usage
  snapshots, and an admin Groups surface. A zero-cost model can be moved to a
  paid group and charged.
- **Tests Added:** Yes — `tests/model-groups.test.mjs` (10 cases).
- **Verification Evidence:** `npm run verify` exit 0, 89/89 tests, quality PASS
  over 160 files, 41-route build; disposable-DB HTTP receipt and live charge
  recorded above.
- **Archived:** not archived. A `verified` FID stays in `dev/fids/` until the
  implementation commit exists.

## Lessons Learned

A group that exists only as a derived label will always be read-only. The
operator needs a durable entity, an explicit source for manual choices, and a
deletion contract that moves members instead of orphaning them. Billing
decisions must live on the same entity as the label; otherwise a model can
display one group while the gateway charges according to another. Public API
compatibility should be preserved by adding fields, not by repurposing a field
that clients already consume.
