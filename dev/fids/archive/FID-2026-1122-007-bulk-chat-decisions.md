# FID-2026-1122-007 — Bulk chat decisions for a review-required provider

**Filename:** `FID-2026-1122-007-bulk-chat-decisions.md`
**ID:** FID-2026-1122-007
**Severity:** medium
**Status:** closed
**Created:** 2026-11-22 25:55
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Operator Report

> "It is not auto setting the type such as chat? and/or no quick way to change
> them. I have nearly 200 models, clicking an option 1 by 1 that many times is
> unrealistic."

## Problem Statement

A provider flagged `requires_model_review` publishes and serves nothing until an
operator records a dated `chat` decision for each upstream model
(`lib/providers/eligibility.ts:38`). The review panel renders one row per model
with three buttons — Chat, Unsupported, Unknown — and each press is its own
`PATCH /api/admin/providers/{slug}/eligibility` call that writes one row and runs
`reconcileRoutes` (`lib/storage/store/eligibility.ts:78-136`).

InferHub's first sync imported 277 rows. The operator's options today are 277
individual presses, or leaving the provider unable to publish. Nothing in the UI
can express "this whole catalog is chat", which is what the operator actually
knows after looking at it.

**Why it is not automatic.** The decision is deliberately human: a review-required
provider's catalog is exactly the thing not trusted to describe itself, and the
gate exists so that a mislabelled row cannot publish. Auto-approving during sync
would delete that gate. The defect is not the existence of the gate — it is that
the gate costs one request per model.

## Goals

- One gesture records `chat` for every row the operator means, with the count
  shown before it happens and the written/skipped counts reported after.
- The write is one transaction and one route republish, not N of each.
- Per-model decisions stay per-model rows, so provenance, dates and exceptions
  survive; the operator can still override any single row afterwards.
- A bulk call that names a model the provider does not serve is reported, not
  silently dropped.

## Non-Goals

- No change to what counts as eligible: still a dated `chat` decision, still an
  operator source, still required for publication and serving.
- No decision written by a sync, a price edit or a catalog read.
- No change to `router-cheap` evidence handling.

## Affected Components

- `lib/storage/store/eligibility.ts` — new `setModelEligibilityBulk`.
- `lib/store-facade/catalog.ts` — binding export.
- `app/api/admin/providers/[slug]/eligibility/route.ts` — accepts a list.
- `components/admin/provider-eligibility.tsx` — the bulk toolbar and counts.
- `tests/model-eligibility-bulk-postgres.test.mjs` — new suite.
- `docs/providers.md`, `CHANGELOG.md`, `SCOPE.md`.

## Proposed Solution

1. **Store.** `setModelEligibilityBulk(db, { providerSlug, upstreamIds, decision,
   source, note })`: one provider check, one `SELECT upstream_id ... WHERE
   upstream_slug = ? AND upstream_id IN (...)`, then one prepared upsert per id
   inside a transaction, then **one** `reconcileRoutes`. Returns
   `{ written, skipped }` where `skipped` names ids the provider does not serve.
   Caps the list at 1000 ids per call and refuses an empty list.
2. **Route.** `PATCH` accepts either the existing single shape or
   `{ upstreamIds: string[], decision, source?, note? }`. Unknown ids come back in
   `skipped` with `200`; an empty or oversized list is `400`.
3. **UI.** A toolbar above the table with three counted actions — "Set N undecided
   rows to chat", "Set all M rows to chat", "Set all M rows to unsupported" — each
   confirmed with its count and executed as one request. The per-row buttons stay
   for exceptions. A note states that the decision is the operator's signature and
   is not inferred from the vendor's catalog.
4. **Docs.** `docs/providers.md` records the bulk path beside the review rule.

## Risks & Mitigations

- **One gesture approving a bad catalog.** The count is shown and confirmed, the
  rows stay individually overridable, and the write is an operator-sourced
  decision per model — the same evidence standard, fewer gestures.
- **A 277-row transaction.** Writes are small upserts in one transaction; the
  standing ceiling on the request body already bounds the list.
- **Repeated reconciles.** The bulk path reconciles once, after the transaction.

## Verification Plan

| Gate | Command | Expectation |
| --- | --- | --- |
| Store | `node --test tests/model-eligibility-bulk-postgres.test.mjs` | writes, skips, durability, single republish |
| Regression | `node --test tests/router-cheap-provider.test.mjs` | single-decision path unchanged |
| Lint/types | `npm run lint`, `npm run typecheck` | clean |
| Full | `npm run verify` | 12/12 gates |

## Acceptance Criteria

1. A bulk call of 200 ids writes 200 decision rows in one transaction and returns
   `written: 200`.
2. An id the provider does not serve appears in `skipped` and writes nothing.
3. A decision survives a refetch and a delisting, exactly as a single one does.
4. The panel shows the three counts before the operator presses anything.
5. `npm run verify` passes with zero skipped tests.

## Loop 1 — RED / GREEN / AUDIT / ADVERSARIAL

- **RED:** 277 rows × (1 request + 1 reconcile) is the measured cost of the current
  panel; the operator's "unrealistic" is arithmetic, not preference.
- **GREEN:** One store function, one route branch, one toolbar; no schema change.
- **AUDIT:** `grep -rn "setModelEligibility" lib components app` names the single
  writer, its bulk sibling, the route and both call sites after the change.
- **ADVERSARIAL:** "Does bulk write something a single call would refuse?" No: the
  same `isEligibilityDecision` guard, the same provider and model existence
  checks, the same table and source notes.
- **CHANGE DELTA:** 0% — first convergence pass.

## Loop 2 — gates after implementation

- **`typecheck` TS2802 ×2.** `[...new Set(ids)]` and `for (const id of served)` do
  not compile under this target (`Set` iteration needs a downlevel target). Fixed
  by `Array.from(new Set(...))` for the request list and by iterating the `SELECT`
  result — `known` — for the writes, so `written` is the count of rows that exist
  in the catalog rather than a second set.
- **Prettier ×3.** The `BulkEligibilityResult` union reflowed to two lines; toolbar
  text rewrapped. Hand-formatted, no `--fix` on an unrelated file.
- **Quality ceiling breached.** `components/admin/provider-eligibility.tsx` reached
  463 lines against the 400 ceiling, so the review panel could not grow in place.
  The read-only evidence block moved to `components/admin/eligibility-evidence.tsx`
  (also exporting `dollars`/`usd`, which the table shares) and the toolbar to
  `components/admin/eligibility-bulk-actions.tsx`; the panel is now 380 lines and
  `npm run quality` reports PASS over 706 files.
- **Live route proof** (`.scratch/probe-bulk-eligibility.mjs`, real admin session,
  unfunded InferHub catalog): empty list → `400 "At least one upstream model id is
  required."`; `["does-not-exist"]` → `200 {written: 0, skipped: ["does-not-exist"]}`;
  `decision: "maybe"` → `400`; catalog then reported 281 rows with 1 `chat`
  decision — the operator's single click, which is the report. Nothing was approved
  by the probe (`written: 0`).

## Resolution

- **Closed Date:** 2026-11-22
- **Fix Description:** `setModelEligibilityBulk` in `lib/storage/store/eligibility.ts`
  dedupes and caps the request, refuses an unknown provider (`provider_not_found`)
  and an empty list (`empty`), resolves the served ids with one `SELECT … WHERE
  upstream_slug = ? AND upstream_id IN (…)`, writes one decision row per served id
  inside a single transaction, calls `reconcileRoutes` once, and returns
  `{ written, skipped }`. `PATCH /api/admin/providers/{slug}/eligibility` now takes
  either a single `upstreamId` or an `upstreamIds` list through the same decision
  validator. `components/admin/eligibility-bulk-actions.tsx` shows the undecided
  count and offers *All N undecided → chat*, *All M rows → chat* and *Undecided →
  unsupported*, each confirmed with its count and sent as one request; the per-row
  buttons stay for the exceptions. The read-only evidence block moved to
  `components/admin/eligibility-evidence.tsx` so the panel stays under the 400-line
  ceiling (463 → 380). No schema change; no decision is inferred.
- **Tests Added:** `tests/model-eligibility-bulk-postgres.test.mjs` (5 cases: a
  200-model call writes 200 dated operator rows, an unserved id is reported and
  nothing is written for it, a duplicate id is written once, empty/unknown-provider
  refusals, a later single decision overrides only its own row, a bulk decision
  survives a delisting). Suite total 1240 → 1245.
- **Verification Evidence:** `npm run verify` PASS — 12/12 gates, 1245/1245 tests, 0
  skipped, 177.8s (`.verify/summary.json`). Live against the running server with a
  real admin session: empty list `400`, unknown id `200 {written: 0, skipped:
  ["does-not-exist"]}`, `decision: "maybe"` `400`, catalog reading 281 rows with 1
  `chat` decision (the operator's single click) and nothing approved by the probe.
  Implementation commit `f66cc25`.
- **Archived:** 2026-11-22
