# FID: Comparable pricing against an asymmetric list

**Filename:** `FID-2026-1029-026-blended-price-comparison.md`
**ID:** FID-2026-1029-026
**Severity:** high
**Created:** 2026-10-30 04:10
**Automation level:** 3
**YAGNI-Compliance:** Verified — one derived field, one column, no new page, no new
data source.

---

## Summary

The `vs list` pill compared our flat per-token rate against OpenRouter's prompt
rate only. Because the upstream relay publishes one rate for both directions while
the public list prices prompt and completion independently, that comparison
reported GLM 5.3 at **+179%** and Deepseek V4.1 Flash at **+73.3%** — both dearer
than list — while the completion direction on the same models is 86.1% and 84.4%
cheaper. The pill now reports a 3:1 prompt-to-completion blend, and the tooltip
carries both directions so neither number can stand alone.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16
- **Commit/State:** `ab73f5a` + working tree

## Detailed Description

### Problem

The upstream catalog (`https://apinex.bond/api/public/models`, 44 rows) publishes
`dollarsPer1M` and `outputDollarsPer1M` with the **same** value on every priced
row, so the gateway sells one rate per token in both directions. The public
benchmark does not: `z-ai/glm-5.3` lists $0.0699 prompt against $1.4000
completion, and `deepseek/deepseek-v4.1-flash` lists $0.0450 against $0.5000.

Comparing a flat rate to only the prompt half of that pair produced a pill that
read "+179%" and "+73%" on a page whose median row is 74% below list. A reader
reasonably concludes we are the expensive option on those two models, which is
true for prompt tokens and false for the request as a whole.

### Expected Behavior

- The pill reports a single number that reflects a realistic request mix.
- Both directions remain one hover away, because the blend is a convention and
  the direction is the fact.
- The `/models` summary reports the same headline as the table, next to the
  prompt and completion figures it is derived from.

### Root Cause

`buildCatalogComparison` produced only `inputDeltaBps` and `outputDeltaBps`, and
the pill renderer picked `inputDeltaBps`. The choice was arbitrary at the time
the benchmark was added (FID-2026-1029-020) and became load-bearing once the
catalog's flat-rate pricing met an asymmetric list.

### Evidence

Live figures at the time of the finding, per 1M tokens:

```text
model                   ours    list in   list out    in Δ      out Δ     3:1 Δ
glm-5.3                 0.1950   0.0699     1.4000   +179.0%    −86.1%    −51.5%
deepseek-v4.1-flash     0.0780   0.0450     0.5000    +73.3%    −84.4%    −50.9%
deepseek-v4-flash       0.0650   0.0910     0.1820    −28.6%    −64.3%    −42.9%
```

Across the 18 matched paid rows, the median prompt delta is −74.0% and the median
blended delta is −87.0%; all 18 are cheaper on the blend.

## Impact Assessment

### Affected Components

- `lib/price-comparison.ts` — blend constants, `blendedPer1M`, `blendedDeltaBps`,
  `summarizeComparison().blended`
- `components/catalog/model-catalog-table.tsx` — pill value, tooltip, footnote,
  header count
- `app/models/page.tsx` — four summary cards instead of three
- `tests/price-comparison.test.mjs` — blend coverage

### Risk Level

Low. Additive field; the two existing directions are unchanged and still
published in the tooltip and the summary cards.

## Proposed Solution

### Approach

A 3:1 input-to-output blend is the standard convention for a representative
request, and it is the only single figure that cannot be gamed by picking the
favourable direction. It is deliberately *conservative* for us: measured gateway
traffic is far more prompt-heavy than 3:1 (the one free request on record was
314 prompt tokens against 4 completion tokens), and prompt is where we are
weakest. The blend therefore understates our advantage rather than overstating it.

### Steps

1. Export `BLEND_INPUT_WEIGHT = 3`, `BLEND_OUTPUT_WEIGHT = 1` and
   `blendedPer1M`, so the weighting is named rather than inlined.
2. Add `blendedDeltaBps` to `PriceComparison` and `blended` to
   `ComparisonSummary`.
3. Render the pill from `blendedDeltaBps`; keep both direction deltas in the
   tooltip, labelled "prompt tokens" / "completion tokens".
4. Update the header count, the footnote, and the `/models` cards to say what
   the number means.

### Verification

- `node --test tests/price-comparison.test.mjs` — 10/10, including a fixture
  that asserts the GLM 5.3 shape: dearer on input, cheaper on blend.
- `npx tsc --noEmit` clean.
- `npm test` 171/171.
- Rendered `/models` on `localhost:3000`: `glm-5.3` carries
  `blendedDeltaBps: -5154` and `deepseek-v4.1-flash` `-5087`, with
  `inputDeltaBps: 17897` and `7333` preserved for the tooltip.

## Verification Gates

- `npx tsc --noEmit` — pass
- `node --test tests/price-comparison.test.mjs` — 10/10
- `npm test` — 171/171
- `npx prettier --check` on the touched files — pass

### Verification Receipt

```text
✔ the blend weighs three prompt tokens to one completion token
✔ a flat rate against an asymmetric list reads dearer on input and cheaper on blend
✔ summary ignores missing deltas and reports the median
ℹ tests 10  ℹ pass 10  ℹ fail 0

npm test  ℹ tests 171  ℹ pass 171  ℹ fail 0
npx tsc --noEmit  exit 0
```

## Resolution

The pill, the header count, the footnote and the `/models` headline all report
the blended delta; the tooltip and the two extra summary cards disclose the
per-direction figures.

## Lessons Learned

A comparison between a flat rate and a split rate is not a pricing fact until the
two sides are measured on the same basis. Where the basis is a convention, say so
in the interface and keep the raw numbers one hover away — the "+179%" was
arithmetically correct and still misleading.
