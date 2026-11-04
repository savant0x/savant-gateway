# FID: Highest-impact modeled price-change table in the sandbox pricing report

**Filename:** `FID-2026-1103-157-highest-impact-price-change-table.md`
**ID:** FID-2026-1103-157
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one ranking helper, one report section, one option.

## Summary

`npm run report:pricing` exports every catalog row with a recommended price and
an `impactMicros` ranking value, but the Markdown receipt only renders a review
queue filtered to `review-required`. A safe row whose modeled profit moves
several dollars therefore never appears in the operator's first table, and the
JSON payload carries no ranked projection at all. The report needs a
highest-impact modeled price-change table built from the same deterministic
recommendations, ordered by absolute modeled profit movement, covering every
eligible row whose price actually changes.

## Environment

- **OS:** win32
- **Language/Runtime:** Node 22.x, TypeScript strict
- **Commit/State:** `b8bbd19` plus the working tree
- **Evidence:** `scripts/sandbox-pricing-report.mjs` section list; `lib/pricing-report.ts` `reviewQueue`.

## Detailed Description

### Problem

The report ranks review work by `impactMicros` only after filtering to
`review-required`. An operator cannot see the largest modeled changes among
`safe` rows, and no compact ranked table is emitted for the JSON receipt.

### Expected Behavior

The report carries a ranked `priceChanges` array and a Markdown table of the
same rows: model, route, classification, current sell, recommended sell, relative
move, modeled scenario profit now → after, and signed delta. Rows with no
recommendation or no actual price movement are excluded. The ranking is by
absolute modeled profit change so a profit-reducing change is as visible as a
profit-increasing one.

### Root Cause

`buildPricingReport` computes `impactMicros` per row but never projects a ranked
change list; the CLI only knows `reviewQueue`.

### Evidence

```text
priceChanges: absent from lib/pricing-report-types.ts
reviewQueue(): .filter(classification === "review-required").sort(impact).slice
```

## Impact Assessment

### Affected Components

- `lib/pricing-report.ts`, `lib/pricing-report-types.ts`
- `scripts/sandbox-pricing-report.mjs`
- `tests/pricing-report.test.mjs`

### Risk Level

- [x] Low: read-only report output; no price is written.

## Proposed Solution

### Approach

Add a pure `rankPriceChanges(rows, limit)` projection, call it once inside
`buildPricingReport`, store the result on the report as `priceChanges`, and render
it as a dedicated Markdown section. Bump the report schema to 2 because the
payload gains a top-level field.

### Steps

1. Define `PricingReportChange` and `priceChanges` on `PricingReport`; schema 2.
2. Implement `rankPriceChanges`: eligible recommendation, direction not
   `unchanged`, sort by `impactMicros` descending then name, bounded by limit.
3. Compute `priceChanges` in `buildPricingReport` with a `priceChangeLimit`
   option defaulting to 10.
4. Render `## Highest-impact modeled price changes` with signed delta formatting
   and an explicit empty state.
5. Cover ranking, exclusion, limit and signed delta in tests.

### Verification

- `node --test tests/pricing-report.test.mjs`
- `npm run check`, `npm run quality`, `npm run build`
- Regenerate the report receipt against a disposable catalog snapshot and
  confirm the section is populated or honestly empty.

## Verification Gates

- gate: test tests/pricing-report.test.mjs
- gate: lint
- gate: typecheck
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-03
- test tests/pricing-report.test.mjs: exit 0 (11/11)
- lint: exit 0 (zero errors; six pre-existing warnings in `lib/launch-receipt.ts`)
- typecheck: exit 0
- quality: exit 0 (400-line ceiling, 597 files)
- build: exit 0 (part of the full verify run)
- full verify through FID-159: all ten gates PASS, 976/976 unit tests, 0 skipped

## Perfection Loop

### Loop 1 — RED

- **RED:** the largest modeled price changes are invisible unless the row is
  review-required, and the JSON receipt cannot name them without re-deriving.
- **GREEN:** `rankPriceChanges` and the Markdown section implemented; schema 2.
- **AUDIT:** ranking uses the same `impactMicros` already used by the review
  queue; no new pricing formula is introduced. The hosted snapshot produced 44
  rows and 10 ranked changes, top `Claude Fable 5.1` at +$0.714286.
- **ADVERSARIAL:** unchanged rows excluded; rows without a recommendation
  excluded; a negative delta remained negative and ranked second; a zero limit
  returned an empty list.
- **CHANGE DELTA:** 12%; converged.

### Loop 2 — Independent audit and self-correction

- **RED:** the focused test failed with `schema: 1` while the type declared 2.
- **GREEN:** the runtime literal in `buildPricingReport` was corrected to 2.
- **AUDIT:** `node --test tests/pricing-report.test.mjs` then passed 11/11.
- **ADVERSARIAL:** a real hosted report run confirmed the section is populated,
  not merely unit-shaped; the file was written read-only.
- **CHANGE DELTA:** 2%; converged.

### Missed Questions

1. **Should `safe` rows appear?** Yes. The table is about modeled impact, not
   approval state; the classification column keeps the distinction visible.
2. **Should the table replace the review queue?** No. One is ranked economics,
   the other is approval work; both serve different operator questions.
3. **Is a price decrease an impact?** Yes, and it can remove profit. Rank by
   absolute movement and print the sign.

## Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `5fbc8b1` (implementation slice); closure evidence in the
  following commit.
- [x] **File:line ranges:** `lib/pricing-report-types.ts:35`
  (`PricingReportChange`), `:129` (`priceChanges`, schema 2);
  `lib/pricing-report.ts:220` (report projection), `:233`
  (`rankPriceChanges`); `scripts/sandbox-pricing-report.mjs:147`
  (`signedUsd`), `:182` (new section); `tests/pricing-report.test.mjs`
  (ranking/exclusion/limit test).
- [x] **Gate output:** focused 11/11; lint 0 errors; typecheck 0; quality PASS;
  full verify 976/976, all ten gates PASS on generated PostgreSQL.
- [x] **Reproducibility:** `rg "rankPriceChanges|Highest-impact" lib scripts`
  finds the projection and section; the receipt is at
  `dev/receipts/2026-11-03-price-changes/`.
- [x] **Step statuses:** steps 1–5 `implemented`.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** the sandbox pricing report now exports and renders a
  `priceChanges` table ranked by absolute modeled profit movement, covering safe
  and review-required rows and excluding unchanged recommendations. Schema 2
  carries the projection in JSON.
- **Tests Added:** `tests/pricing-report.test.mjs` — ranking, unchanged-row
  exclusion, ineligible-row exclusion, signed delta and limit.
- **Verification Evidence:** commit `5fbc8b1`; focused 11/11; full verify all ten
  gates PASS, 976/976 unit tests, 0 skipped; regenerated 44-row hosted receipt
  with 10 ranked changes at `dev/receipts/2026-11-03-price-changes/`.
- **Archived:** 2026-11-03 — `dev/fids/archive/FID-2026-1103-157-highest-impact-price-change-table.md`.

## Lessons Learned

A report that only tables approval work hides the economics the operator is
approving. Rank the consequence, then the workflow.
