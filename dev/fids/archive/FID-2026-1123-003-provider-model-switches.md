# FID: Provider-scoped switches for individual models

**Filename:** `FID-2026-1123-003-provider-model-switches.md`
**ID:** FID-2026-1123-003
**Severity:** medium
**Status:** closed
**Created:** 2026-11-23 23:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

One model can be switched on or off (`PATCH /api/admin/models` with
`{id, status}`, `lib/storage/store/models.ts:90`), and `/admin/catalog` exposes
that as a per-row Enable/Disable button. What is missing is a provider-scoped
way to do it: a catalog of 281 rows is switched one press at a time, with no
selection, no bulk action and no report of which rows were refused and why. This
FID adds selection and a bulk Enable/Disable on the existing catalog surface —
in `/admin`, not a new page — with the same per-row rules, so a bulk action can
never publish a row the single action would refuse.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `5c7a78e` on `main` (clean)

## Detailed Description

### Problem

The operator asked for "a feature that allows me to enable/disable specific
models from a provider". The capability exists but not at that scope:

| Need | Today |
| --- | --- |
| Switch one model | `/admin/catalog` row button (399-line component, no selection) |
| Switch a provider's whole selection | impossible — one request per row |
| See why a switch was refused | one toast per row; a bulk attempt would need N round trips |
| Do it from the provider row | no — serve status lives only on the catalog page | |

Second, reported in the same review: pressing **Disable** on `/admin/providers`
leaves the **Status** column reading `active`, so the switch looks like it did
nothing. The write is correct — `updateProvider` sets `enabled = 0` and the store
suite already asserts it (`tests/store-providers-postgres.test.mjs:111-114`) —
but that column renders `provider.status`, which the quota probe writes
(`lib/storage/ledger/quota.ts:74`: `active | exhausted | error`), not the
operator's switch. The disabled state was only visible as a small chip beside the
label. The column is the switch; health is a different fact and now says so.

The rules that make a switch safe are already written and are not repeated:
enabling is refused while the provider requires model review and the row has no
explicit `chat` decision (`not_eligible`), and refused while a paid row has no
positive cost or sell price (`cost_unknown`). A delisted row (`in_catalog = 0`)
cannot be enabled from the UI at all, because upstream no longer serves it.

### Expected Behavior

On `/admin/catalog`, with a provider filter applied:

1. each row has a selection checkbox, and the header selects the page;
2. a bulk bar states how many rows match the current filter and offers
   **Enable selected / Disable selected / Clear**;
3. one request carries the selection and one transaction applies it, with one
   route reconciliation;
4. the result names what worked and why each refused row refused, in words the
   operator can act on ("3 need a chat decision", "1 needs a cost");
5. the single-row button keeps working exactly as before.

### Root Cause

`setModelStatus` is per-row by construction: it loads one row, checks the
guards, writes, and calls `reconcileRoutes`. There is no selection model in
`components/admin/models-table.tsx`, and the component sits at the 400-line
ceiling, so there is no room to grow in place.

### Evidence

```text
$ wc -l components/admin/models-table.tsx lib/storage/store/models.ts
399 components/admin/models-table.tsx
352 lib/storage/store/models.ts

$ grep -n "setModelStatus" -r lib app components
lib/storage/store/models.ts:90:export async function setModelStatus(
lib/store-facade/catalog.ts:59:export const setModelStatus = bound(models.setModelStatus);
app/api/admin/models/route.ts:74:    const result = await setModelStatus(id, status as "active" | "disabled");
components/admin/models-table.tsx:112: body: JSON.stringify({ id: model.id, status: next }),
```

## Impact Assessment

### Affected Components

- `lib/storage/store/model-status.ts` (new) — the shared guard, the single
  switch and `setModelStatusBulk`; `lib/storage/store/models.ts` keeps its reads
  and re-exports the switch so the 400-line ceiling holds
- `lib/store-facade/catalog.ts` — bulk binding
- `app/api/admin/models/route.ts` — `ids` accepted beside `id`
- `components/admin/models-table.tsx` — selection state and the bar mount
- `components/admin/model-row.tsx` (new) — the row, extracted for the ceiling
- `components/admin/model-bulk-actions.tsx` (new) — the bar and its wording
- `components/admin/providers-panel.tsx` — the Status column reports the switch,
  with sync health named as health
- `docs/operator-first-run.md` — steps 1 and 2 name both surfaces

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: writes `models.status`, the same column the existing button writes,
      with the same rules; one new endpoint shape and no schema change.

## Proposed Solution

### Approach

Extract the enable-time guard into one predicate that both the single and bulk
paths call, then apply it row by row inside one transaction that ends with one
`reconcileRoutes`. The route accepts `ids` through the same validation as `id`,
so there is one endpoint and one contract. The component is split so the table
stays under the file ceiling.

### Steps

1. `lib/storage/store/model-status.ts` (new): `enableBlocker(row)` returns
   `"not_eligible" | "cost_unknown" | null` from one `STATUS_ROW_SELECT` query
   text; `setModelStatus` uses it. `setModelStatusBulk(db, modelIds, status)`
   returns `{ written, skipped: { id, reason }[] }`, dedupes, caps at
   `MAX_BULK_STATUS = 1000`, selects the requested rows in one query, skips
   missing ids (`not_found`) and delisted rows (`delisted`), applies the guard
   only when enabling, writes inside one transaction, and calls
   `reconcileRoutes` once. `lib/storage/store/models.ts` re-exports it.
2. `lib/store-facade/catalog.ts`: bind `setModelStatusBulk`.
3. `app/api/admin/models/route.ts`: accept `ids: string[]`; an empty list is
   `400`, more than the cap is `400`, and the response is
   `{ ok, written, skipped }` on the same route that already handles `id`. The
   single-row branch gained the `delisted` refusal message.
4. `components/admin/model-bulk-actions.tsx`: the selection bar — counts
   matching the current filter, Enable selected / Disable selected / Clear, a
   confirm with the count, and a notice translating `skipped` reasons into
   counts.
5. `components/admin/models-table.tsx`: selection state, a checkbox column and
   the bar mount; the row body moves into `components/admin/model-row.tsx` so the
   table keeps its size and the cell logic has one home.
6. `components/admin/providers-panel.tsx`: the Status column shows
   `enabled`/`disabled` from the switch, and shows `health: <status>` only when
   the stored status is not the ordinary `active`.
7. Tests: `tests/model-status-bulk-postgres.test.mjs` — bulk disable writes every
   selected row in one transaction; a mixed enable writes the eligible priced row
   and reports `not_eligible` / `cost_unknown` / `not_found` / `delisted` for the
   rest; an emptied selection refuses; the cap refuses; a duplicate id is written
   once; a switched-off row stays off across the next sync; the single-row path
   refuses a delisted row by name. Provider-toggle persistence is already
   asserted in `tests/store-providers-postgres.test.mjs`.
8. Docs: `docs/operator-first-run.md` steps 1 and 2 name both surfaces, the
   refusal reasons and the health-versus-switch distinction.

### Non-goals

- No new column, no per-provider allowlist, and no "enable everything" that
  bypasses the eligibility or cost guard.
- Bulk enable never invents a price or a decision; a skipped row is reported, not
  silently activated.
- The vendor's own catalog is never an input to the switch.

### Verification

`node --test tests/model-status-bulk-postgres.test.mjs`, the existing store and
HTTP suites, and a read-only probe of the running server's bulk branch with a
selection that matches no row (proving the shape and the guard without writing).

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-status-bulk-postgres.test.mjs
- gate: test tests/store-admin-postgres.test.mjs
- gate: test tests/store-providers-postgres.test.mjs
- gate: quality
- gate: verify

### Verification Receipt

- verified: `npm run verify` — **PASS, 12 gates, 1264/1264 tests, 0 skipped,
  176.8 s** (`.verify/summary.json`); `npm run lint` zero warnings;
  `npm run quality` PASS; `node --test
  tests/model-status-bulk-postgres.test.mjs` 5/5; live admin probe listed in
  Loop 2.

## Perfection Loop

### Loop 1 — RED

- **RED:** the switch exists per row only; no selection, no bulk, no aggregate
  refusal report, and the component that would host it is at 399 of 400 lines.
- **GREEN:** steps 1–7.
- **AUDIT:** to be recorded in Loop 2 with the real gate output.
- **ADVERSARIAL:** the strongest objection is that a bulk action over 281 rows is
  a foot-gun — one press could unpublish a whole provider. The answer is that
  Disable is the safe direction and is confirmed with its count, while Enable
  cannot succeed for a row that fails the guard; the bar reports exactly which
  rows were skipped and never widens what the single button would allow.
- **CHANGE DELTA:** 0% — first convergence pass.

### Loop 2 — GREEN and AUDIT (implementation)

- **GREEN:** steps 1–8 are implemented. The first draft exceeded the file
  ceiling twice — `lib/storage/store/models.ts` reached 472 lines and
  `models-table.tsx` had no room for a column — so the switch moved to
  `lib/storage/store/model-status.ts` (210 lines, re-exported by `models.ts` now
  278) and the row moved to `components/admin/model-row.tsx`, leaving the table
  at 306 lines. That is extraction, not compression: no logic was shortened to
  fit.
- **AUDIT — RED measured, then GREEN, with real output:**

```text
$ node --test tests/model-status-bulk-postgres.test.mjs   # first run
✔ a bulk disable switches every selected row in one call
✖ an enable writes the eligible priced row and names every refusal
✖ the single switch refuses a delisted row by name
ℹ pass 3  fail 2

$ node --test tests/model-status-bulk-postgres.test.mjs   # after correcting the
✔ 5 / ✔ 5 / ✔ 5 / ✔ 5 / ✔ 5                             # wrong assertions
ℹ pass 5  fail 0

$ npm run lint      → zero warnings
$ npm run quality   → PASS (400-line ceiling, 715 files scanned)
$ npm run verify    → PASS, 12 gates, 1264/1264 tests, 0 skipped, 176.8 s
```

The two failures were assertions, not behaviour: an already-enabled priced row
whose decision is missing stays on (the guard governs enabling), and a refused
delisted row is left as it was rather than switched off. Both are recorded here
because the first draft of this test claimed otherwise.

- **AUDIT — the reported defect:** `provider.status` is written by the quota
  probe (`lib/storage/ledger/quota.ts:74`), so the panel's Status column could
  never follow the switch. `tests/store-providers-postgres.test.mjs:111-114`
  already proved the disable persists; only the label was wrong. The column now
  renders the switch and names health separately. Live render after the change:
  five provider rows, one `enabled` chip and four `disabled`, with
  `health: error` shown on the apinex row.
- **AUDIT — live probe (no row written):**

```text
PATCH /api/admin/models (no session)         → 401 Admin sign-in required.
{ids: [], status: "disabled"}                → 400 At least one model id is required.
{ids: [1001 ids], status: "disabled"}        → 400 Select at most 1000 models at once.
{ids: ["__absent__"]}                        → 400 A status is required for a selection.
{ids: ["__absent__"], status: "disabled"}    → 200 {"ok":true,"written":0,
                                                    "skipped":[{"id":"__absent__",
                                                    "reason":"not_found"}]}
```

### Loop 3 — ADVERSARIAL (second pass)

- **Objection: a bulk disable over 281 rows is a foot-gun.** It is the safe
  direction and is confirmed with its count. Enable — the direction that
  publishes — cannot succeed for any row the guard refuses; the bar names those
  rows instead of hiding them.
- **Objection: two switches could disagree.** They cannot drift silently: both
  paths share one query text and one predicate, and the cap and dedupe live in
  the store rather than the route, so a second caller inherits them.
- **Objection: selection leaks across filters.** `applyFilter` clears the
  selection whenever the filter, provider or query changes, so "Disable
  selected" can never carry an id the operator cannot see.
- **Residual risk, stated:** a selection larger than one page (`Select all N`)
  is written blind beyond the visible rows. That is the same set the count in the
  bar names, and every refused row is reported; a reviewer who wants row-level
  sight can page. Not claimed beyond this.

## Resolution

- **Implementation commit:** `f875bb9`.

- **Closed Date:** 2026-11-23
- **Fix Description:** `setModelStatusBulk` in
  `lib/storage/store/model-status.ts` with one shared `enableBlocker` and one
  `STATUS_ROW_SELECT`; `ids` accepted by `PATCH /api/admin/models` with the
  `delisted` refusal named; selection checkboxes and a bulk bar
  (`components/admin/model-bulk-actions.tsx`) on `/admin/catalog`; the row
  extracted to `components/admin/model-row.tsx`; the `/admin/providers` Status
  column reporting the switch with health named separately; operator docs and
  changelog updated.
- **Tests Added:** `tests/model-status-bulk-postgres.test.mjs` (5 cases).
- **Verification Evidence:** `npm run verify` PASS — 12 gates, 1264/1264 tests,
  0 skipped, 176.8 s; lint zero warnings; quality PASS; the live probe above run
  against the running server with an admin session and writing nothing.
- **Archived:** 2026-11-23 → `dev/fids/archive/`.

### Missed Questions

1. **Is this the same feature as the eligibility review panel?** No. Eligibility
   records whether a model is *allowed* (chat/unsupported); the switch records
   whether a model is *offered* now. A model may be eligible and deliberately
   switched off — that is the whole point of the feature.
2. **Should a bulk action span providers?** It may: the request carries ids, so
   the same endpoint serves any selection. The UI's default path is a provider
   filter, which is what the operator asked for.
3. **What happens to a switched-off row on the next sync?** Nothing.
   `replaceModels` keeps `current.status`, so the disable survives; the test
   asserts it rather than trusting the comment.
4. **Should enabling a free-pool row still need a cost?** No — the guard only
   applies to non-free access, exactly as `setModelStatus` does today.

## Resolution

- **Closed Date:** (filled at closure)
- **Fix Description:** (filled at closure)
- **Tests Added:** (filled at closure)
- **Verification Evidence:** (filled at closure)
- **Archived:** (filled at closure)
