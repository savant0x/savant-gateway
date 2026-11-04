# Highest-impact modeled price-change receipt

**Date:** 2026-11-03
**FID:** FID-2026-1103-157
**Status:** implementation evidence; report-only, no price changed

The sandbox pricing report now carries a `priceChanges` projection ranked by
absolute modeled profit movement and a matching Markdown section. This run
regenerated the report against the hosted catalog snapshot in read-only mode.

## Observation

| Item | Value |
| --- | --- |
| Catalog rows | 44 |
| Classification | 11 free, 10 subscription, 23 safe, 0 review-required, 0 blocked |
| Ranked changes | 10 |
| Top modeled delta | Claude Fable 5.1, +$0.714286 per 1M-in + 1M-out row |
| Report schema | 2 |
| Database writes | none |

The ranking is a scenario model, not realized revenue. Safe rows are included
because the table answers "what moves the economics"; the review queue still
answers "what needs approval". Unchanged recommendations are excluded.

## Files

- `pricing-report.md` — rendered report, including the new section.
- `pricing-report.json` — machine-readable report with `schema: 2` and
  `priceChanges`.

No provider, price, decision, catalog or customer row was written. The database
connection string and credentials are not present in these files.
