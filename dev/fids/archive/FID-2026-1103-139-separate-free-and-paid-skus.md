# FID: Separate free and paid catalog SKUs

**Filename:** `FID-2026-1103-139-separate-free-and-paid-skus.md`
**ID:** FID-2026-1103-139
**Severity:** high
**Created:** 2026-11-03
**Status:** converged
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The public catalog folds a free allocation and its paid counterpart into one row
with two access chips. The row is titled and priced by the paid variant, so the
free product has no name of its own and clicking the combined row can only open
the paid detail page. Free and paid are separate products with separate ids,
admission rules and settlement; the catalog must present them as separate SKUs.

## Impact Assessment

- **Affected components:** `lib/catalog-pairs.ts` and its tests,
  `components/catalog/*`, `app/models/page.tsx`, the model detail page,
  `lib/openai-model.ts`, catalog counts and copy.
- **Risk:** high: the catalog currently presents one product where the gateway
  sells two, and the free product's detail page is unreachable from its row.

## Detailed Description

### Problem

A model published as both `free/glm-5.3` and `glm-5.3` renders as one catalog
row with a Free chip and a Paid chip. The row links to the paid id and shows the
paid price. The free id exists and is published, but the UI gives the reader no
row to click and no name that identifies the free SKU.

### Expected Behavior

Each published purchase path is its own catalog row and detail page:

| SKU | Display name | Billing | Detail |
| --- | --- | --- | --- |
| `free/glm-5.3` | `GLM 5.3 (Free)` | daily weighted free pool | free price, free copy, free actions |
| `glm-5.3` | `GLM 5.3` | prepaid credit | paid price, paid copy, add-credit action |
| subscription row | `GLM 5.3 (Subscription)` | plan allowance | plan price, plan actions |

The `id` remains the SKU. No routing id is renamed: existing keys, request
bodies, usage rows and route groups keep working. The free prefix is already
the public differentiator.

### Root Cause

`pairCatalogModels` groups rows by `canonicalModelKey(upstreamId || id)`, which
deliberately folds the `free/` prefix for model identity. That is correct for
fingerprinting and routing and wrong for catalog presentation: it also folds
two billing tiers into one product. `CatalogRow` then renders every variant's
chip, prices from `row.primary` (paid first), and links to `row.primary.id`.

## Proposed Solution

1. **implemented:** replace model-identity pairing with SKU rows keyed by
   `billingMode:canonicalModelKey`. Same-tier provider rows still merge; free,
   paid and subscription never do.
2. **implemented:** add `catalogSkuName`: free rows get ` (Free)`, subscription
   rows get ` (Subscription)`, paid rows keep their name.
3. **implemented:** render one access chip, one price, one access path and one
   exact-id detail link per row; update counts and copy from models to SKUs.
4. **implemented:** use the same SKU name in the model detail title and the
   OpenAI-compatible `name` field so the API list and the catalog agree.
5. **implemented:** replace the pairing tests with SKU separation, same-tier
   merge, naming, access-path and count tests.

## Verification Gates

- `node --test tests/catalog-skus.test.mjs tests/model-retrieve.test.mjs` — 21/21
- `npm run lint` — zero warnings
- `npm run typecheck` — 0
- `npm run verify` — 904 tests, 903 pass, 1 skipped, 0 fail; build, HTTP and
  recovery drill PASS
- `npm run quality` — PASS (570 files)

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** one row carries both chips, the free product has no distinct name,
  and the free detail page cannot be reached from the row.
- **GREEN:** SKU rows split by billing tier; free and subscription names carry
  their access; each row links to its own id.
- **AUDIT:** trace every catalog row from `listModels()` through the table,
  detail page and `/v1/models` object; no remaining `row.primary` fallback may
  decide what a free reader sees.
- **ADVERSARIAL:** two providers publishing the same paid model must stay one
  SKU; a free-only model must not invent a paid path; a subscription row must
  not show a credit action; search and sorting must use the visible SKU name;
  existing ids and route elections must not change.
- **CHANGE DELTA:** 12%; converged.

### Missed Questions

1. **Are new database ids required?** No. The free row already has a distinct
   id (`free/...`), and changing ids would break live keys and usage history.
2. **Should the paid name also say Paid?** No. Paid is the default product; the
   free and subscription variants are the ones that need qualification.
3. **Does `is_primary` need to change?** No. FID-116 already publishes one row
   per billing tier; this FID fixes how those published rows are grouped in the
   UI.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** complete. The catalog now renders one row per SKU; a free
  row is titled `(Free)`, links to `free/<id>`, and shows the free-pool action.
  The paid row keeps its name and credit action. Same-tier provider rows still
  merge, so the change does not invent duplicate vendor rows.
- **Evidence:** focused catalog and retrieve tests 21/21; full `npm run verify`
  904 tests (903 pass, 1 skipped, 0 fail), build, HTTP and recovery PASS. Local
  `/models` shows 12 free and 23 paid rows; `/models/free/glm-5.3` returns 200
  with free-pool copy; `/models/glm-5.3` returns 200 with paid copy.
- **Commit:** `59dce6d`.
- **Archived:** yes.
