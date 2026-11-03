# FID: One catalog row per model with both access paths

**Filename:** `FID-2026-1102-117-plural-access-catalog-row.md`
**ID:** FID-2026-1102-117
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03 00:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

> Pre-implementation design record. It does not authorize or claim
> implementation beyond the steps below.

---

## Summary

After FID-116 the paid counterpart of a free-tier model is published, but the
public table lists it as a second row: `free/glm-5.3` and `glm-5.3` appear
side by side with no sign that they are the same model, and neither row offers
a way to buy anything. This FID pairs the variants into one row that shows the
model once with both purchase paths — the free tier and the metered rate.

## Environment

- **OS:** win32
- **Language/Runtime:** Node >=22.18.0, Next.js 16 (client component)
- **Commit/State:** `1bc8256` plus this change

## Detailed Description

### Problem

A customer reading `/models` sees the same model twice, cannot tell which row
to buy, and finds no credit or free-tier call to action in either.

### Expected Behavior

One row per model. The row names the model, shows the metered rate, and offers
every path that model has: free tier (console), prepaid credit (account), and
subscription (plans) when a plan covers it. The per-model detail page is still
reachable, and `/v1/models` still publishes each id separately because a
request body names exactly one.

### Root Cause

The table rendered `ModelSummary[]` one row per published id. Publication and
display were the same granularity, so the routing fix in FID-116 made the
duplicate visible instead of correcting the presentation.

### Evidence

- `components/catalog/model-catalog-table.tsx` — `models.map(...)` per row
- `app/models/page.tsx` — headline counts came from `data.stats`, which counts
  published rows
- `/v1/models` — machine consumers already receive both ids

## Impact Assessment

### Affected Components

- `lib/catalog-pairs.ts` (new pure projection)
- `components/catalog/model-catalog-table.tsx`
- `components/catalog/catalog-row.tsx` (new row renderer)
- `app/models/page.tsx` (headline counts)
- `tests/catalog-pairs.test.mjs`

### Risk Level

- [x] Medium: presentation of the public catalog; no billing change
- [ ] Low

## Proposed Solution

### Approach

Pair published rows by `canonicalModelKey(upstreamId)` — the same identity
routing uses — so the projection cannot invent a pairing the gateway would not
honour. The paid variant names the row and carries the price, benchmark and
comparison; the free variant contributes the weighted allowance and its group
chip. Every variant id stays visible as a link, so a customer can still call
`free/glm-5.3` explicitly.

Purchase paths reuse existing routes only: `/dashboard` (free tier, console),
`/account` (prepaid credit), `/plans` (subscription). No new checkout exists.

### Steps

1. Add `pairCatalogModels`, `catalogAccessPaths` and `pairedCatalogCounts` to
   `lib/catalog-pairs.ts`, with tests in `tests/catalog-pairs.test.mjs`.
2. Render a paired row from a new `components/catalog/catalog-row.tsx`; the
   table keeps state, filters, sorting and pagination.
3. Add a trailing "Get access" column with one link per available path.
4. Count models, not ids, in the `/models` headline.

### Verification

- `tests/catalog-pairs.test.mjs` covers pairing, display preference, identity
  separation, access paths and counts.
- Gates: typecheck, lint, quality, `npm test`, `npm run build`.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/catalog-pairs.test.mjs
- gate: quality — `npm run quality`
- gate: build — `npm run build`

### Verification Receipt

- verified: 2026-11-03T00:45Z
- focused: `node --test tests/catalog-pairs.test.mjs` exit 0 — 8/8
- test: `npm test` exit 0 — 860 tests, 859 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings (after `eslint . --fix` for four
  prettier and two prop-order findings in the new files)
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 537 files)
- build: `npm run build` exit 0
- not run: `npm run test:http`, `npm run test:recovery`, browser review

## Perfection Loop

### Loop 1 — RED

- **RED:** Duplicate rows, no purchase path, headline counts disagree with the
  table after pairing.
- **GREEN:** Pairing projection, paired row renderer, access column, counts.
- **AUDIT:** `lib/catalog-pairs.ts` adds `pairCatalogModels`,
  `catalogAccessPaths` and `pairedCatalogCounts`;
  `components/catalog/model-catalog-table.tsx` groups through it before
  filtering, sorting and pagination; `components/catalog/catalog-row.tsx`
  renders the row and its paths; `app/models/page.tsx` counts paired rows.
  `tests/catalog-pairs.test.mjs` passes 8/8, full suite 859/860, build 0.
- **ADVERSARIAL:** Could pairing merge two genuinely different models? No:
  identity is `canonicalModelKey`, which keeps version bumps and variants
  distinct. Could it hide a purchasable id? No: every variant id stays in the
  row and the detail route, and `/v1/models` is untouched.
- **CHANGE DELTA:** 0% before implementation.

### Missed Questions

1. Does the free row still need its own detail page entry point? Yes — its id
   remains a link in the row, and `/models/free/glm-5.3` still resolves.
2. What does sorting use for a paired row? The metered rows for price and
   comparison, the free weight for weight, and the union for capabilities.
3. Does a subscription variant pair with a paid one? Yes: both are access
 paths of the same model, so one row offers "Buy credit" and "See plans".

## Implementation Evidence

- **Commit SHA:** `ed97ae5`.
- **File:line ranges:** `lib/catalog-pairs.ts`,
  `components/catalog/model-catalog-table.tsx`,
  `components/catalog/catalog-row.tsx`, and `app/models/page.tsx`.
- **Gate output:** focused test 8/8, full `npm test` 859/860, typecheck, lint,
  quality, and build all exit 0 as recorded above.
- **Reproducibility:** `rg "pairCatalogModels|catalogAccessPaths|pairedCatalogCounts"`
  finds the production projection and callers.
- **Step statuses:** all four steps implemented.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** paired catalog rows with both purchase paths
- **Tests Added:** Yes — `tests/catalog-pairs.test.mjs`
- **Verification Evidence:** `node --test tests/catalog-pairs.test.mjs` 8/8;
  `npm test` 860 (859 pass, 1 skipped); typecheck, lint, quality and build all
  exit 0
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

Publication granularity and display granularity are separate decisions. A
routing fix that publishes both products must be followed by a presentation
that explains them.
