# FID: Catalog expansion and OpenRouter price comparison

**Filename:** `FID-2026-1029-020-catalog-price-comparison.md`
**ID:** FID-2026-1029-020
**Severity:** medium
**Created:** 2026-10-29 19:40
**Automation level:** 3
**YAGNI-Compliance:** Verified — one pure matcher, one cached public fetch, no
database table and no price history.

---

## Summary

The public `/models` page renders a 36rem-tall table with six columns and no
external benchmark, so a visitor cannot tell whether a Savant price is
competitive. This FID widens the page, adds tool/vision and weight detail, and
adds an OpenRouter comparison column built from OpenRouter's public
`/api/v1/models` list, matched by exact upstream id and cached for six hours.
Unmatched models say so instead of implying a comparison.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16
- **Commit/State:** `f691848`

## Detailed Description

### Problem

The catalog is the pricing surface, but it states only our rates. There is no
displayed basis for "is this cheap?", no tool/vision column, and the table is
capped at 44 rows inside a 36rem scroll area on a 7xl container.

### Expected Behavior

- `/models` uses the full page width and a taller table.
- Rows show family, context, group, tools/vision, weight, our input/output
  price, OpenRouter input/output price, and the delta.
- A model with no exact OpenRouter counterpart shows `—` and is excluded from
  the "cheaper than OpenRouter" count.
- The page states the source, fetch date, and matching rule.
- An OpenRouter outage never breaks the catalog.

### Root Cause

The table was built as a minimal internal catalog view before pricing became a
public selling point.

### Evidence

```text
app/models/page.tsx      max-w-7xl, pageSize = all rows
model-catalog-table.tsx  max-h-[36rem], columns: Model, Family, Context, Group,
                         Input, Output
Live OpenRouter /api/v1/models: 456 entries, 18 of 44 active rows matched by
exact upstream id before stripping the free/ prefix.
```

## Impact Assessment

### Affected Components

- `lib/price-comparison.ts` (new, pure)
- `lib/openrouter-prices.ts` (new, cached fetch)
- `app/models/page.tsx`
- `components/catalog/model-catalog-table.tsx`
- `.env.example` (`OPENROUTER_MODELS_URL`)

### Risk Level

- [x] Medium: public price claims must be accurate and must not break when the
  upstream benchmark is unavailable.

## Proposed Solution

### Approach

`lib/price-comparison.ts` parses OpenRouter's per-token string prices into USD
per 1M, strips a leading `free/` from our upstream id, ignores `:batch` and `~`
variants, matches on exact slug, and computes basis-point deltas
(`(ours - theirs) / theirs`). `lib/openrouter-prices.ts` fetches the public list
with a four-second timeout, caches it in-process for six hours, deduplicates
concurrent fetches, and returns an empty list on any failure. The page computes
the comparison server-side and passes a record to the client table; nothing is
fetched from the browser.

### Steps

1. Pure parse/match/delta module with tests. — implemented
2. Cached, fail-open fetch module. — implemented
3. Page widens to `max-w-[96rem]` and passes comparisons. — implemented
4. Table adds tools/vision, weight, OpenRouter, and delta columns plus a matched
   summary and source footnote. — implemented

### Verification

`tests/price-comparison.test.mjs` covers per-token parsing, free-prefix
stripping, batch/variant exclusion, exact matching, no-match behavior, and delta
sign, plus zero/undefined price handling.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/price-comparison.test.mjs
- gate: quality
- gate: build

### Verification Receipt

```text
npm run lint        0 errors, 0 warnings
npm run typecheck   pass
npm test            143 tests, 143 pass
npm run build       pass
GET /models         200
browser @1440px     table 1258px inside a 1335px column, document overflow 0
browser @1024px     table scrolls inside its region (1248 in 930), page overflow 0
headline            18 matched paid rows, median input −74.0%,
                    median output −93.8%, coverage 34 of 44
```

Follow-up in the same session:

- Hero widened to the catalog's `max-w-[96rem]` so the heading and the table
  share one column.
- Three positioning cards state the median input delta, the median output
  delta, and exact-id coverage. `summarizeComparison` in
  `lib/price-comparison.ts` computes them from the matched paid rows only, using
  a median so one cheap upstream cannot set the headline.
- Subscription-only rows printed `Subscription` twice; the sell cell now renders
  one label when both rates are zero and not a paid row.
- The footnote now says the delta compares our sell rate with the OpenRouter
  list rate, not with our upstream cost.
- Table scroll region raised from 52rem to 68rem.

## Perfection Loop

### Loop 1 — RED

- **RED:** No external benchmark, no tools/vision or weight column, cramped
  table.
- **GREEN:** Pure comparison module, cached fetch, expanded table.
- **AUDIT:** Comparison is computed only for exact slug matches; unmatched rows
  are `—` and excluded from the count.
- **ADVERSARIAL:** OpenRouter prices can include cache/web-search components the
  flat prompt/completion figures omit; the footnote states the comparison uses
  list prompt/completion rates only.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should free models show a comparison? → Yes, against their paid upstream
   equivalent, because that is the price a customer would pay elsewhere.
2. What if OpenRouter lists two entries with the same slug? → Batch and
   variant ids are excluded; the first remaining entry by id wins and the rule
   is documented.
3. Does the comparison affect billing? → No. It is display data from a separate
   module; `getModelForGateway` is untouched.
4. What about a stale benchmark? → Six-hour cache with the fetch date shown;
   failure renders the catalog without the column.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] Commit SHA
- [ ] File:line ranges
- [ ] Gate output
- [ ] Reproducibility
- [ ] Step statuses

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** `/models` uses the full width, names the benchmark source
  and fetch time, and shows a per-row OpenRouter comparison plus a median
  headline for the matched paid rows.
- **Tests Added:** Yes — `tests/price-comparison.test.mjs` (parse, match, delta
  sign, summary median with and without nulls, even-length rounding).
- **Verification Evidence:** Gate receipt above.
- **Archived:** pending

## Caveat carried forward

The catalog was synced from the upstream feed at 2026-10-29T21:15Z. That feed
priced 40 of 45 rows identically on input and output and used only 15 distinct
price points, which is not how a real per-model catalog prices completion
tokens. The deltas are therefore correct arithmetic over seed-like costs. Before
any savings figure is used in public marketing, the upstream prices must be
confirmed against the provider's real rate card.

## Lessons Learned

A comparison is a claim. It needs a source, a date, a matching rule, and a
visible "not listed" state, or it becomes marketing rather than evidence.
