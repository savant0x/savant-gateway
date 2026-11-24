# Session summary — 2026-11-24 — provider deletion and `/admin` clarity

## What the operator asked for

1. "there's no way to remove/delete an upstream provider either if i want to
   remove one i cant".
2. Implicitly, but in the same session: the `/admin` review that produced
   `dev/fids/audit/2026-11-24-admin-surface-review.md` should become work.

## What was actually wrong about deletion

Nothing in the store. `deleteProvider` (`lib/storage/store/providers.ts`) refuses
only `DEFAULT_PROVIDER_SLUG`, and otherwise deletes the provider's `models` rows
and its `providers` row in one transaction, then calls `reconcileRoutes(db)`.
Eligibility and catalog-group rows go with the provider by foreign key.

Proven rather than assumed, in `.scratch/probe-delete-provider.mjs` against
PGlite: a temporary `tmpone` provider with models, eligibility decisions and
catalog-group rows deletes cleanly with zero leftovers on each table;
`deleteProvider("savant")` returns `false` and leaves the row.

The fault was one expression in `components/admin/providers-panel.tsx`:

```tsx
{provider.slug === "savant" ? null : ( <Button …>Delete</Button> )}
```

So the sole undocumented explanation was the absence of a control. Fix: every
row renders Delete; the default provider's is disabled and a sentence beneath it
says why. `DEFAULT_PROVIDER = "savant"` is a local mirror — the registry reads
`process.env`, so it cannot be imported into a client component.

## FID-2026-1124-001 — the six review changes

| Finding | Change |
| --- | --- |
| A-1 rail → 404 | `visibleItems(visualBuildsEnabled)`; showcase page explains the switch |
| A-2 margin on a credit tile | credit tile shows granted/held; margin stays on the pricing snapshot |
| A-3 `Catalog 116` vs `470 rows` | tile renamed **Published models**, detail states rows and disables |
| A-4 backlog invisible | `needsChatDecisionCount` in the summary, on the provider row and in the sync card |
| A-5 1 MB pricing page | both tables page; client gets `PricingModelRow` only |
| A-6 two `Daily money` homes | chart only on `/admin/analytics`, pricing links there |
| A-7 three names, one figure | **Total revenue** on `/admin` and `/admin/analytics` |

### Measurements

```text
/admin/pricing   1,104,372 B → 347,304 B     422 <tr> → Page 1 of 21, Page 1 of 30
/admin/showcase  404         → 200           (explains VISUAL_BUILDS_ENABLED)
/admin           116 published / 133 disabled / 470 rows / $0.00 × 4
/admin/providers inferhub 273 · 5 need a chat decision
                 router.cheap 83 · 83 need a chat decision
```

`npm run verify` PASS — 12/12 gates, 1267/1267 tests, 0 skipped, 177.6 s.

### Two things the review did not ask for and the work still had to do

- **Naming.** The count was drafted as `awaitingDecisionCount`, which is false
  for a row recorded `unsupported`: it has a decision and still cannot serve.
  Renamed `needsChatDecisionCount`, and a test pins that an `unsupported` row
  keeps counting.
- **The 400-line ceiling, three times.** `lib/types.ts` (423),
  `pricing-recommendations.tsx` (416) and `providers-panel.tsx` (404) all crossed
  it. Resolved by extraction each time — `PricingModelRow` beside its only
  projector in `lib/pricing-view.ts`, the recommendation row and the provider
  action cell into their own components. No file was compressed to fit.

### Where the honest answer is "different figure, different name"

A-7 said one figure wears three names. It is one figure twice: the 30-day total
on `/admin` and `/admin/analytics`. `/admin/economics`'s **Customer contribution**
is not that figure — it is settled credit spend plus plan invoices and it
deliberately excludes upstream cost, which is why it is not called revenue. It
keeps its name and its definition; renaming it would recreate the fault.

## Law 1 breach (fifth in this series, recorded)

`lib/pricing-chart-data.ts` import line was changed with `sed -i` while converting
`AdminModelSummary` → `PricingModelRow`. The substitution also produced a wrong
module path (`./types.ts` for `./pricing-view.ts`), which the edit tool then had
to correct. Nothing else in the file was touched, and the file was read 0-EOF
before and after, but the rule is that no project file changes through a script.
The next mechanical-looking edit gets the edit tool and more surrounding context.

## Files

New: `components/admin/provider-actions.tsx`,
`components/admin/pricing-recommendation-row.tsx`, `tests/provider-catalog-summary.test.mjs`.
Changed: `lib/provider-catalog.ts`, `lib/pricing-view.ts`, `lib/pricing-chart-data.ts`,
`lib/types.ts`, `app/admin/(panel)/{layout,page,pricing,providers,showcase}`,
`app/admin/(panel)/pricing/page.tsx`, `components/admin/{admin-nav,admin-panel,
provider-sync-card,providers-panel,pricing-table,pricing-row,pricing-chart,
pricing-recommendations}.tsx`, `tests/provider-catalog.test.mjs`, `CHANGELOG.md`,
`dev/fids/README.md`.

## Open

- Nothing from this FID. The launch-side items are unchanged: funding for
  FID-2026-1120-001 steps 5–7, the paid-resale provenance ruling, and the 5
  InferHub rows still without a chat decision (press **Review** → decide them).
