# FID: Hide a group from the public catalog

**Filename:** `FID-2026-1029-030-group-hiding.md`
**ID:** FID-2026-1029-030
**Severity:** low
**Created:** 2026-10-30 06:05
**Automation level:** 3
**YAGNI-Compliance:** Verified — one column, one filter clause, one checkbox. No
new table, no soft-delete, no routing change.

---

## Summary

An operator can now hide a model group. Hiding removes the group's models from
the public catalog, `/v1/models` and the site's model counts, while leaving the
group's billing mode, prices, plan membership and direct-by-id calls untouched.
Before this, the only way to take a tier off the public page was to disable each
model individually or delete the group and reassign its models.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** working tree on `main`

## Detailed Description

### Problem

`model_groups` had no visibility control. Every enabled group's active,
in-catalog models were returned by `listModels()`, which feeds the public
catalog page, the landing page and `/v1/models`. `/admin/groups` could rename,
reprice and delete groups but could not take one out of view.

### Expected Behavior

- Admin → Groups has a "Hide group" checkbox on create and edit.
- A hidden group's models do not appear in the public catalog, the landing page
  model grid, `/v1/models`, or the public model counts.
- The admin list still shows the group, its model count, and a `hidden` chip.
- Billing is unchanged: a hidden subscription group is still plan-gated and a
  hidden paid group still holds and settles credit.
- A key that already knows an id can still call that model.
- Models with no group row stay visible (`COALESCE(g.hidden, 0) = 0` over a
  LEFT JOIN).

### Root Cause

Visibility was a property of the model (`in_catalog`, `status`) only; the group
dimension had none.

### Evidence

```text
before  lib/store/models.ts   PUBLIC_SCOPE = "m.in_catalog = 1 AND m.status = 'active'"
after   lib/store/models.ts   PUBLIC_SCOPE = "... AND COALESCE(g.hidden, 0) = 0"
scratch DB  hide free        public 44 -> 33
            hide subscription public 33 -> 23
            unhide           public 23 -> 44
```

## Impact Assessment

### Affected Components

- `lib/schema/groups.ts` — `model_groups.hidden` column via `ensureColumn`
- `lib/types.ts` — `ModelGroupSummary.hidden`
- `lib/model-groups.ts` — `hidden` in the validated group values
- `lib/store/groups.ts` — read, create, update
- `lib/store/models.ts` — public scope
- `lib/store/overview.ts` — public model counts
- `components/admin/group-fields.tsx`, `components/admin/groups-panel.tsx`

### Risk Level

Low. Presentation only: no billing, admission or authorization path reads
`hidden`.

## Proposed Solution

### Approach

Store visibility on the group, filter the one public projection at its single
query, and keep the admin list unfiltered so the operator can always unhide.

### Steps

1. Additive `hidden` column with a `0` default. — implemented
2. Carry `hidden` through validation, store and the summary type. — implemented
3. Filter the public scope and the public counts. — implemented
4. Checkbox in the shared group form, sent on create and update; `hidden` chip
   in the admin list. — implemented

### Verification

- `npx tsc --noEmit` — pass.
- `npm test` — 185 tests, 185 pass.
- Scratch copy of `data/gateway.db`: the public-scope query returned 44 visible
  models, 33 with `free` hidden, 23 with `free` and `subscription` hidden, and
  44 again after unhiding.

## Verification Gates

- gate: typecheck
- gate: test
- gate: sql public-scope check on a scratch DB

### Verification Receipt

```text
npx tsc --noEmit      pass
npm test              185 tests, 185 pass
scratch DB            visible 44 | hide free 33 | hide subscription 23 | unhide 44
```

## Perfection Loop

### Loop 1 — RED

- **RED:** No way to take a group out of the public catalog.
- **GREEN:** `hidden` on the group; public projection filters it.
- **AUDIT:** `PUBLIC_SCOPE` is used by exactly one query (`listModels`), which
  already LEFT JOINs `model_groups g`, so the clause needs no new join.
- **ADVERSARIAL:** Hiding is not disabling — an existing key must still reach the
  model, and a system group must not be deletable. Neither path reads `hidden`.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should the API key list hide hidden groups? → No. The catalog is the surface
   being curated; `/v1/models` mirrors it, so both follow `listModels`.
2. Should hidden models be blocked from completions? → No. That would be a
   billing/authorization change requested as a display change; `status =
'disabled'` already exists for hard blocks.
3. Does hiding a plan group break plan access? → No. Plan membership and
   entitlement never consult visibility.
4. Should hidden groups still count in the admin overview? → Yes. The public
   counts exclude them; the admin groups table shows the real model count.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/store/models.ts:25-26`,
      `lib/store/overview.ts:23-47`, `lib/store/groups.ts:47-58`,
      `components/admin/group-fields.tsx:100-120`
- [x] Gate output — above
- [x] SQL evidence — above
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-30
- **Fix Description:** A group carries `hidden`; the public catalog, model list
  and counts exclude hidden groups, while billing and direct calls are unchanged.
- **Tests Added:** No — the store path needs a live SQLite handle; verified with a
  scratch-DB query instead.
- **Verification Evidence:** Gate receipt above.
- **Archived:** `dev/fids/archive/`, committed as `7b8774d`

## Lessons Learned

Visibility is cheap to model on the group and expensive to model per model: the
operator thinks in tiers, and the catalog is one projection that can be filtered
once.
