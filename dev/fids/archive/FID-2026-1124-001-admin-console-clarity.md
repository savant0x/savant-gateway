# FID: Admin console clarity, attention signals and payload

**Filename:** `FID-2026-1124-001-admin-console-clarity.md`
**ID:** FID-2026-1124-001
**Severity:** medium
**Status:** closed
**Created:** 2026-11-24 19:20

## Summary

A read-only review of every `/admin` route
([audit baseline](../audit/2026-11-24-admin-surface-review.md)) found seven items:
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
3. A provider row and the overview state how many imported rows have no `chat`
   decision when the provider requires model review, because that count is what
   stands between "enabled" and "serving".
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
- `lib/provider-catalog.ts`, `lib/storage/store/provider-catalog.ts` (add a
  needs-chat-decision count)
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
3. Add a per-provider count of imported in-catalog rows with no `chat` decision
   (final name `needsChatDecisionCount`, including rows recorded `unsupported`),
   show it on the providers row, and add one line per provider in the overview
   sync card when any provider has a backlog. Tests: a review-required provider with three undecided rows reports 3, a
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

- verified: 2026-11-24, `npm run verify` PASS — 12/12 gates, 1267/1267 tests,
  0 skipped, 177.6s (`.verify/summary.json`).
- verified: `node .scratch/probe-admin-pages.mjs` — `/admin/showcase` 200 (was
  404), `/admin/pricing` 347,304 B (was 1,104,372 B), `/admin` 84,627 B.
- verified: `/admin/pricing` renders `Page 1 of 21` and `Page 1 of 30`; the page
  still lists 272 priced models.
- verified: `/admin/providers` — InferHub row reads `273` with `5 need a chat
  decision`, router.cheap `83` with `83 need a chat decision`; `/admin` sync card
  repeats the sentence per provider.
- verified: `tests/provider-catalog-summary.test.mjs` 3/3; the two legacy
  `providerCatalogSummaryIn` suites still pass with the fixture extended to the
  real schema (`models.upstream_id`, `providers.requires_model_review`,
  `model_eligibility`).
- verified: lint zero warnings, `npm run quality` PASS (718 files).

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

### Loop 2 — Implementation audit

- **RED (measured after the first build attempt):** `npm run typecheck` failed
  twice — `Button` has no `title` prop in HeroUI v3
  (`components/admin/providers-panel.tsx`), and `ProviderSummary` has no
  `needsChatDecisionCount` because the count belongs to the catalog summary, not
  the provider record.
- **GREEN:** the Delete explanation moved to the paragraph that already renders
  beneath the row (a `title` would never show on a disabled button anyway), and
  the providers page joins `listProviderCatalogSummary()` by slug instead of
  widening `ProviderSummary`.
- **AUDIT:** `npm run quality` failed twice — `lib/types.ts` 423 lines and
  `components/admin/pricing-recommendations.tsx` 416 lines. Resolved by
  extraction, not compression: `PricingModelRow` moved next to its only
  projector (`lib/pricing-view.ts`), and the recommendation row became
  `components/admin/pricing-recommendation-row.tsx`. A third ceiling breach
  (`providers-panel.tsx` 404) was resolved the same way:
  `components/admin/provider-actions.tsx` now owns the action cell, including the
  default-provider Delete notice.
- **ADVERSARIAL:** the new count could have been named for what it does not
  measure. `awaitingDecisionCount` was wrong — a row recorded `unsupported` has a
  decision and still cannot serve. Renamed to `needsChatDecisionCount`, and the
  test asserts that an `unsupported` row keeps counting.
- **CHANGE DELTA:** +4 files (`pricing-recommendation-row.tsx`,
  `provider-actions.tsx`, `pricing-view.ts` already existed,
  `tests/provider-catalog-summary.test.mjs`), −1 duplicated money chart, −731 kB
  of pricing HTML.

### Loop 3 — Boundary checks

- **A row not in the catalog is not a backlog item.** `in_catalog = 0` is
  excluded from the count, and a test pins it: delisting one of three undecided
  rows reports 2.
- **A provider that does not require review never reports a backlog,** even with
  eligibility rows present, and a test pins that too.
- **The count is a read.** It is computed in the summary select the providers
  page and the overview already call; no new query, no new write, no guard.
- **The pricing payload is trimmed at the server boundary,** so no client
  component can reach a field it does not render; `toPricingRows` is the only
  producer of `PricingModelRow`.
- **The showcase page keeps its real behaviour.** It says the feature is off, how
  to turn it on and what it would show; it does not pretend to be a build list.
- **A-7 is resolved for the one figure that was renamed twice.** The 30-day total
  is `Total revenue` on `/admin` and `/admin/analytics`. `/admin/economics` keeps
  `Customer contribution` because it is a different quantity — settled credit
  spend and plan invoices excluding upstream cost, not revenue — and its own
  copy defines it. Renaming it to `Total revenue` would make two different
  figures share a name, which is the fault A-7 reports.

## Resolution

- **Closed Date:** 2026-11-24
- **Implementation commit:** `2e59b69`.
- **Fix Description:** A rail entry that could not open now explains itself
  instead of 404ing; the overview tiles name the quantities they count; a
  review-required provider's decision backlog appears on its row, in the sync
  card and on the providers table; `/admin/pricing` pages both tables and ships
  only the pricing fields (1,104 kB → 347 kB); the realized-money chart has one
  home (`/admin/analytics`) and the 30-day total one name (`Total revenue`).
- **Tests Added:** `tests/provider-catalog-summary.test.mjs` (3) — the count
  tracks decisions, ignores providers that do not require review, and ignores
  delisted rows; `tests/provider-catalog.test.mjs` fixture extended to the real
  schema.
- **Verification Evidence:** `npm run verify` PASS 12/12, 1267/1267;
  `.scratch/admin-pages.json` before/after byte counts; `Page 1 of 21` /
  `Page 1 of 30` in the rendered pricing page.
- **Archived:** 2026-11-24 → `dev/fids/archive/`
