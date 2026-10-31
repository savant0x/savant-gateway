# FID: Apixo onboarding review and unpriced-import guard

**Filename:** `FID-2026-1031-080-apixo-provider-onboarding.md`
**ID:** FID-2026-1031-080
**Severity:** medium
**Status:** closed
**Created:** 2026-10-31 21:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The operator plans to add Apixo (`apixoai.online`) as a second upstream: 43 text
models on a dual-format API, a separate four-model image catalog, and a backup
source for models already sold. No account exists yet. This FID records the
review and closes the one defect the pairing exposes immediately: a provider
whose catalog publishes no prices imported every model as `active`, `in_catalog
= 1`, and `$0.00`, so the public catalog offered models that every call answered
`503 model_unpriced`. New unpriced rows now import disabled and are published
only after the operator sets a cost and activates them.

## Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node >= 22.18.0, Next.js 16.4.3, better-sqlite3 13.0.3
- **Commit/State:** `main` at the local quality pass (`3007e22`) plus this pass
- **Upstream state:** unauthenticated reads only; no Apixo credential exists

## Detailed Description

### Problem

`replaceModels` imported a new row with `current?.status ?? "active"`. A synced
catalog is the only source of new rows, and `buildSyncedModels` marks a row
`costSource: "unknown"` when the upstream publishes no price. Apixo's
`GET /v1/models` publishes no price, so a first sync produces 43 active rows with
zero cost and zero sell price.

`PUBLIC_MODEL_SCOPE` publishes `in_catalog = 1 AND status = 'active'`, and the
catalog projection renders the sell price. The result is a public listing of
paid models at `$0.00`; the call path then refuses them:

```ts
// lib/gateway.ts — paid branch
if (settleModel.sellInputMicros <= 0 && settleModel.sellOutputMicros <= 0) {
  return jsonError(503, `Model ${model.id} is not currently available for purchase.`, "model_unpriced");
}
```

`setModelStatus` already refuses to activate an unknown-cost model
(`cost_unknown`), so the operator could repair the row; the defect is that the
row is published before anyone does.

### Expected Behavior

A model that cannot be sold must not appear in the catalog a customer reads. It
should be visible in the admin catalog with its unknown cost, and become public
when it is priced and activated.

### Root Cause

The import path had one status for every new row. The "unknown cost" signal
existed (`cost_source`) and was enforced on the activation path, but not on the
import path, so the default `active` silently bypassed it.

### Evidence

Unauthenticated read, 2026-10-31:

```text
GET https://api.apixoai.online/v1/models → 200
{"object":"list","data":[{"id":"gpt-6-astra","object":"model","type":"model",
 "owned_by":"apixo","display_name":"GPT-6 Astra","context_window":1050000,
 "max_output_tokens":128000}, …]}   # 43 entries, no price field
```

Review record: `docs/research/apixo-provider-review.md`.

## Impact Assessment

### Affected Components

- `lib/providers/catalog.ts` — new `importedModelStatus` decision
- `lib/store/models.ts` — import uses it for new rows
- `tests/catalog-integrity.test.mjs` — covers the three cases

### Risk Level

- [x] Medium: the public catalog advertises a model that cannot be bought; a
  workaround (price then activate) exists but requires noticing first

## Proposed Solution

### Approach

Make the import status a function of what is known about the row, and keep it
next to the catalog builder so the rule is testable without a database. Free-pool
rows are priced by definition and stay active; priced rows stay active; a new
row whose cost is unknown starts disabled.

### Steps

1. `importedModelStatus({ costSource, isFree })` in `lib/providers/catalog.ts` —
   **implemented**.
2. `replaceModels` uses it for new rows; an existing row keeps whatever status it
   already has, so a sync never re-enables a model an operator disabled and never
   disables a model that is already published — **implemented**.
3. Cover the three cases — **implemented** (`tests/catalog-integrity.test.mjs`).
4. Record the provider review and the onboarding runbook —
   **implemented** (`docs/research/apixo-provider-review.md`).
5. Image lane (`POST /v1/images/generations`, per-image pricing, settlement,
   docs, catalog UI) — **deferred**, deliberately out of this pass. It is a new
   capability class and there is no account to verify it against.
6. Automatic failover / alias routing between providers — **deferred**. Today a
   public id resolves to one provider row; "backup" means the operator publishes
   `apixo/<id>` as its own row.
7. Import of Apixo text prices — **blocked**. `GET /v1/models` publishes none and
   the reseller price endpoint needs a purchased reseller token.

### Verification

`tests/catalog-integrity.test.mjs` asserts an unpriced non-free import is
`disabled`, a priced import is `active`, and an unpriced free-pool import is
`active`. The public projection is already covered by
`tests/catalog-integrity.test.mjs` plus the HTTP suite's catalog checks.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/catalog-integrity.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-31 (local tree)
- lint: exit 0, zero warnings (after one prettier `--fix` on the two edited files)
- typecheck: exit 0 (first run failed with TS2322 on `costSource: "manual"`; fixed by passing `model.costSource` for the new-row branch)
- test tests/catalog-integrity.test.mjs: exit 0 (8 pass)
- test (whole directory): exit 0
- test:http: exit 0 (750 checks plus the trial suite)
- quality: exit 0 (400-line ceiling, 355 files)
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** A new unpriced row imports active and public at `$0.00`.
- **GREEN:** `importedModelStatus` + `replaceModels` use it for new rows only.
- **AUDIT:** `lib/store/models.ts` computes `status` after `costSource` and
  `isFree`, and passes it to the upsert where `current?.status ?? "active"`
  stood.
- **ADVERSARIAL:** Could this hide a whole healthy catalog? Only new rows are
  affected; existing rows keep `in_catalog` and `status`, so a metadata outage
  on a later sync cannot delist a published catalog. The Savant public-metadata
  fetch already fails soft.
- **CHANGE DELTA:** 5%.

### Missed Questions

1. **Does a disabled row still cost the operator anything?** It stays in the
   admin catalog, keeps its prices and history, and is not charged. It is hidden
   from `/models` and from `/v1/models` because both use `PUBLIC_MODEL_SCOPE`.
2. **Can a customer still call a disabled row by id?** No. `handleChatCompletions`
   refuses `model.status !== "active"` with `503 model_unavailable` before any
   reservation.
3. **What about a free row with no price?** Free-pool rows are priced by group,
   so they stay active; `costSource` is `synced` for them anyway.
4. **Does the admin flow still work?** Yes: enter cost in `/admin/pricing`
   (`setModelCost` → `cost_source = 'manual'`) then activate; `setModelStatus`
   only rejects an unknown cost.
5. **Should the import also set an `apixo` price?** No. The upstream publishes
   none, and inventing one would be a fabricated cost.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `c1ddf7d4e8011af49da82fffadc62388ee411e2b`
- [x] **File:line ranges:** `lib/providers/catalog.ts` (importedModelStatus),
  `lib/store/models.ts` (status in `replaceModels`),
  `tests/catalog-integrity.test.mjs`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -n importedModelStatus lib/providers/catalog.ts
  lib/store/models.ts`
- [x] **Step statuses:** 1–4 implemented, 5–6 deferred (operator-visible plan,
  no code), 7 blocked on a purchased account

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: `syncProvider` → `replaceModels` →
  `listModels` → `/v1/models` and `/models`
- [x] FID status reflects the implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** The guard only helps if the operator can find the row. It is disabled
  in the admin catalog, which sorts disabled rows after active ones.
- **GREEN:** No code change: the admin catalog already renders status, cost source
  and the correction path, and `/admin/pricing` lists unpriced counts.
- **AUDIT:** `listAllModels` orders by `in_catalog`, then status; an unpriced row
  is still visible with `costSource: "unknown"`.
- **ADVERSARIAL:** A provider could publish a priced catalog but zero cost on
  purpose; `costSource` would be `synced` and the row active at $0.00. That is a
  truthful import of a published zero, and `defaultSellMicros(0)` leaves it
  unsellable — the call path still refuses it. Not addressed here.
- **CHANGE DELTA:** 0%.

### Loop 3 — Final convergence

- **RED:** The image catalog is a real capability gap, and this pass cannot close
  it without an account.
- **GREEN:** Documented as a non-goal with the exact request shape and prices, so
  the next pass starts from evidence rather than discovery.
- **AUDIT:** Review doc lists every endpoint observed, with the unauthenticated
  read that produced it.
- **ADVERSARIAL:** Upstream prices, ids and the image catalog can change before
  purchase; the review is dated and says so.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-10-31 (local; operator approval not required for
  documentation and the guard)
- **Commit:** `c1ddf7d4e8011af49da82fffadc62388ee411e2b`
- **Fix Description:** An unpriced import starts disabled, so the public catalog
  never advertises a model that answers `503 model_unpriced`.
- **Tests Added:** Yes — `tests/catalog-integrity.test.mjs`.
- **Verification Evidence:** receipt above.
- **Archived:** 2026-10-31 (`dev/fids/archive/`), recording commit
  `c1ddf7d4e8011af49da82fffadc62388ee411e2b`

## Lessons Learned

A capability the schema already models (`cost_source = 'unknown'`) must be
enforced on every path that creates a row, not only on the path an operator
uses to change one. Adding a provider that publishes no prices is the normal
case, not an edge case.
