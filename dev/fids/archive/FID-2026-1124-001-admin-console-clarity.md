# FID: Admin console clarity, attention signals and payload

**Filename:** `FID-2026-1124-001-admin-console-clarity.md`
**ID:** FID-2026-1124-001
**Severity:** medium
**Status:** converged
**Created:** 2026-11-24 19:20

## Summary

A read-only review of every `/admin` route
([audit baseline](audit/2026-11-24-admin-surface-review.md)) found seven items:
two are mislabelled numbers on the landing page, one is a rail entry that
answers 404, one is a missing admission fact (a review-required provider's
decision backlog), one is a 1,078 kB page, and two are duplicated money
surfaces. This FID owns the six changes that follow from them. None of them
moves money, changes a billing rule or touches a settlement path.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `80454fe` on `main`

## Detailed Description

### Problem

The console is honest about its definitions but not about its quantities:

| Finding | Evidence |
| --- | --- |
| A-1 rail → 404 | `/admin/showcase` returns 404 while `admin-nav.tsx` lists it unconditionally |
| A-2 credit card shows a margin | rendered `Available credit $0.00 · 20.0% average input margin` |
| A-3 "Catalog 116" vs "470 rows" | value is `PUBLIC_MODEL_SCOPE` count; detail cites rows and disables |
| A-4 decision backlog invisible | summary has no awaiting-decision count; InferHub 273 synced, 116 serving |
| A-5 unpaginated pricing | 422 `<tr>`, 1,078 kB, 602 kB inline payload |
| A-6 two `Daily money` homes | `AnalyticsChart` on analytics and pricing |
| A-7 one figure, three names | `30d revenue` / `Total revenue` / `Customer contribution` |

### Expected Behavior

1. A rail entry always opens a page; a disabled feature says it is disabled.
2. Every overview tile's label names the quantity its value is, and its detail
   describes the same quantity.
3. A provider row and the overview state how many imported rows await a decision
   when the provider requires model review, because that count is what stands
   between "enabled" and "serving".
4. `/admin/pricing` lists prices in pages, and the client receives only the
   fields it renders.
5. One `Daily money` surface, and one name for the 30-day total.

### Root Cause

The overview was built while the console was small: `AdminPanel` grew by
accretion, so a margin detail ended up attached to a credit tile and the catalog
tile kept its first label after its query was narrowed to the published scope
(`PUBLIC_MODEL_SCOPE`). Provider eligibility is enforced in the store but
summarised only inside the review modal, so the admission fact never reached a
page. Each surface independently re-projected the same settled rows.

### Evidence

```text
$ node .scratch/probe-admin-pages.mjs
/admin/pricing   200  1218ms 1104372B
/admin/showcase  404   351ms   23434B
```

## Impact Assessment

### Affected Components

- `components/admin/admin-nav.tsx`, `app/admin/(panel)/showcase/page.tsx`
- `components/admin/admin-panel.tsx` (tiles), `components/admin/provider-eligibility.tsx`
- `lib/provider-catalog.ts`, `lib/storage/store/provider-catalog.ts`,
  `lib/provider-catalog` summary select (add an awaiting-decision count)
- `app/admin/(panel)/pricing/page.tsx`, `components/admin/pricing-table.tsx`,
  `components/admin/pricing-chart.tsx`, `components/admin/pricing-recommendations.tsx`
- `app/admin/(panel)/analytics/page.tsx` (single `Daily money` home)
- docs: `docs/operator-first-run.md` if a step changes.

### Risk Level

- [x] Medium: presentation and one added read. The awaiting-decision count is a
      read-only aggregate; no guard, price, hold or settlement changes.

## Proposed Solution

### Steps

1. Nav: pass whether visual builds are enabled from the panel layout, and either
   omit the item or render the page's disabled notice with a link to
   `docs/` instead of `notFound()`.
2. Overview tiles: rename the catalog tile to the quantity it counts and rewrite
   the credit tile's detail to the credit facts (granted, held, available); move
   the margin detail to the pricing snapshot card that already shows margin.
3. Add `awaitingDecisionCount` to the provider catalog summary (rows of a
   `requires_model_review` provider without a `chat` decision), show it on the
   providers row, and add one overview line when any provider has a backlog.
   Tests: a review-required provider with three undecided rows reports 3, a
   decided row leaves the count, a non-review provider always reports 0.
4. Pricing: page the table (same `Pagination` primitive as the catalog) and pass
   a trimmed row shape to the client components (id, name, family, group, cost,
   sell, access, status).
5. Remove the realized-money block from `/admin/pricing` and keep it on
   `/admin/analytics`; leave the pricing copy pointing there.
6. Use one name for the 30-day total across `/admin`, `/admin/analytics` and
   `/admin/economics`.

### Non-goals

- No change to any price, markup, guard or settlement rule.
- No new page and no new nav section: the rail keeps its current inventory minus
  the entry that cannot open.
- No visual redesign. The review did not attempt a look-and-feel audit.

### Verification

`npm run verify`; the provider-summary test; a re-run of the page probe showing
`/admin/showcase` no longer 404, `/admin/pricing` under 400 kB, and the overview
tiles naming one quantity each.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-catalog-groups.test.mjs
- gate: quality
- gate: verify

### Verification Receipt

- verified: not started.

## Perfection Loop

### Loop 1 — RED

- **RED:** measured above; `/admin/showcase` 404, the credit tile's margin
  detail, the 1,078 kB pricing page, and no awaiting-decision count anywhere in
  the summary.
- **GREEN:** steps 1–6.
- **AUDIT:** to be recorded with gate output at implementation.
- **ADVERSARIAL:** the strongest objection is that renaming tiles and moving one
  chart is churn. The answer is A-3: a tile whose label, value and detail name
  three different quantities is a decision hazard on the page an operator opens
  first, and the fix is two strings.
- **CHANGE DELTA:** 0% — first convergence pass.

### Missed Questions

1. **Is the 1 MB payload a rendering problem or a data problem?** Data: the same
   470-row array is passed to three client components. Paging the table alone
   would not shrink it, so step 4 trims the prop as well.
2. **Should the pending-decision count block enabling a provider?** No. Enabling
   is a configuration act; serving is the admission rule, and eligibility already
   refuses per row at call time. The count is information, not a new gate.
3. **Does removing money from `/admin/pricing` remove a fact the operator needs
   there?** It removes a duplicate. The page keeps cost, sell, margin and the
   formulas it applies; the outcome stays one link away and already carries its
   own definitions there.

## Resolution

- **Closed Date:** not started
- **Fix Description:** not started
- **Tests Added:** none yet
- **Verification Evidence:** the measurements in the audit baseline
- **Archived:** not started
