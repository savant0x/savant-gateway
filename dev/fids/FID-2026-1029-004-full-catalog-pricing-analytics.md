# FID: Full catalog, sell-price math, credits, and analytics

**Filename:** `FID-2026-1029-004-full-catalog-pricing-analytics.md`
**ID:** FID-2026-1029-004
**Severity:** high
**Status:** converged
**Created:** 2026-10-29 02:10 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

> Project application: npm, not Bun. Gates are the ones declared in
> `protocol.config.yaml`. Closure is checked against
> `templates/FID-TEMPLATE.md` plus the commit recorded here.

## Summary

The gateway imports 45 provider models but exposes and routes only the 11 free
ones. The other 34 rows keep the upstream cost in `input_price_micros` /
`output_price_micros`, have no sell price, and are rejected with `402
insufficient_quota`. There is no price editor, no margin arithmetic, no
credit ledger, and no revenue or cost analytics. The public catalog is a
six-card free-model grid, and the admin catalog has no pricing or pagination.

This FID turns the catalog into a complete, priced product surface: all active
models listed and routable, operator-editable sell prices with honest
cost/margin math, a credit ledger that funds paid calls, a full-catalog table
on the public site and in the console, and a revenue/cost/margin analytics
page. Font Awesome Free is added for the icon surface.

## Environment

- **OS:** Windows 11 (Git Bash), local development host.
- **Language/Runtime:** Node `v24.21.0`; package engine `>=22.18.0`;
  Next.js `16.4.3`; React `19.3.0`.
- **Tool Versions:** npm `12.2.1`, TypeScript `5.9.3`, HeroUI `3.2.7`,
  better-sqlite3 `13.0.3`.
- **Commit/State:** `f5d78e7` on `main`; clean working tree.

## Detailed Description

### Problem

1. `lib/store/models.ts` lists only active rows, and `lib/gateway.ts:214-231`
   rejects every model that is not in the free pool. The paid catalog is
   stored but unusable.
2. Upstream cost is stored in `models.input_price_micros` /
   `output_price_micros`. No sell price exists, so margin cannot be computed
   and a paid request cannot be billed.
3. `usage_events.cost_micros` is the only money column. It is derived from the
   upstream cost, so the gateway has no record of revenue or gross margin.
4. `getLandingData()` ships only `freeModels`; `/models` and a searchable
   full-catalog table do not exist. The console table lists every active row
   but not pricing.
5. Admin has provider sync, status toggles, keys, and usage, but no pricing
   surface and no analytics.
6. Font Awesome Free is not installed; the UI has no icon set.

### Expected Behavior

- Every active catalog row is visible on a public `/models` table with its
  sell price, context window, capabilities, provider, and access tier.
- The landing page previews the mixed catalog and links to `/models`; no
  surface claims the product is free-only.
- Admin has four first-class pages under the authenticated shell: overview,
  catalog, pricing, and analytics.
- Pricing shows upstream cost, our sell price, per-direction margin, and
  blended profit per 1M input + 1M output. Prices are editable inline in USD
  per 1M tokens; a global markup applies to auto-priced rows.
- A provider sync preserves operator disables, manual sell prices, and
  delisted rows instead of deleting and rebuilding the table.
- Paid calls require a funded credit balance. The gateway reserves an
  estimated hold, charges actual usage at the sell price, records upstream
  cost, and releases the remainder. Free-pool calls remain free but stay
  weighted-metered.
- Analytics reports revenue, upstream cost, gross margin, requests, tokens,
  latency, error rate, a daily series, and top models for 7/30/90 days.
- Font Awesome Free is installed and used in the public, console, and admin
  shells.

### Root Cause

The rebuild preserved the original free-pool-only product boundary. Pricing
was never modeled as a separate concept from upstream cost, and the inherited
catalog sync deletes and re-inserts rows, which made operator price edits
impossible to preserve.

### Evidence

```text
$ node -e "…select count(*) from models where allow_free=0 and input_price_micros>0"
{ c: 24 }
$ wc -l lib/types.ts lib/store/models.ts lib/gateway.ts
  ... ModelSummary has inputPricePer1M/outputPricePer1M only; no sell fields
$ grep -n "free pool\|free-model\|Send the request" components/landing/*.tsx
... free-only copy in hero.tsx, model-grid.tsx, quickstart.tsx, features.tsx
$ ls node_modules/@fortawesome
ls: cannot access 'node_modules/@fortawesome': No such file or directory
```

## Impact Assessment

### Affected Components

- `lib/db.ts` — additive migrations: sell prices, price source, catalog
  presence, tenant credit and holds, credit ledger, `usage_events.charged_micros`,
  `settings`.
- New `lib/pricing.ts` — pure arithmetic and token estimation.
- New `lib/store/settings.ts`, `lib/store/billing.ts`,
  `lib/store/analytics.ts`.
- `lib/types.ts`, `lib/store/shared.ts`, `lib/store/models.ts`,
  `lib/store/usage.ts`, `lib/store/overview.ts`, `lib/store.ts`.
- `lib/provider.ts` — cost fields on sync; no delete/reinsert.
- `lib/gateway.ts` — full-catalog routing, holds, settlement.
- `app/v1/models/route.ts`, `app/api/models/route.ts`, `app/api/usage/route.ts`,
  `app/api/admin/models/route.ts`; new `app/api/admin/pricing/route.ts` and
  `app/api/admin/credit/route.ts`.
- New `app/models/page.tsx`, `app/admin/(panel)/layout.tsx`,
  `app/admin/(panel)/catalog/page.tsx`, `app/admin/(panel)/pricing/page.tsx`,
  `app/admin/(panel)/analytics/page.tsx`; move `app/admin/page.tsx`.
- `components/catalog/*`, `components/admin/*`, `components/dashboard/*`,
  `components/landing/*`, `components/navbar.tsx`.
- `app/layout.tsx` (Font Awesome import), `styles/globals.css`,
  `config/site.ts`.
- Tests: new `tests/pricing.test.mjs`; existing suites must remain green.
- Records: `AGENTS.md`, `README.md`, `knowledge.md`, `SCOPE.md`,
  `CHANGELOG.md`, `VERSION`, `package.json`, session summary.

### Risk Level

- [x] High: money math and a new debit path touch every paid request. A
  rounding error, blocked hold, or double settlement misprices the product.
  Containment: pure pricing functions with unit tests, one SQLite transaction
  per settlement, a hold ceiling, and live HTTP receipts with real usage rows.
- The catalog upsert replaces a destructive sync, so a bug can hide rows or
  resurrect disabled ones. Containment: `in_catalog` is separate from
  `status`, and the receipt checks a sync across both.

## Proposed Solution

### Approach

Separate the three money concepts that were previously one: **upstream cost**
(existing `input_price_micros` / `output_price_micros`), **sell price** (new
`sell_input_micros` / `sell_output_micros`), and **charged revenue**
(`usage_events.charged_micros`). Keep integer micro-dollars end to end.

Price each catalog row from a global markup (default 30%) on sync, or from an
operator override marked `manual`. A bulk markup action rewrites auto rows;
per-row edits set `manual`. Free-pool rows stay at zero.

Fund paid calls from a single-tenant credit balance (`users.credit_micros`,
`users.held_micros`). Before a paid request, atomically reserve an estimated
hold (prompt estimate + output budget at sell price). After completion or
failure, one transaction releases the hold, debits the actual charge, and
writes the usage row with both charge and upstream cost. Streams settle on
close, cancel, and error.

Expose all active rows through one public model shape that carries sell prices
only. Admin gets an extended shape with cost, margin, and sync presence. Build
one searchable, sortable, paginated public table and a separate editable
pricing table; both are client components over server snapshots.

Analytics is a server-side range query over `usage_events`, not a new event
pipeline: daily revenue/cost/requests, top models by revenue, latency, and
error rate. The page is force-dynamic and no-store because it is financial
data.

### Steps

1. Add additive schema migrations and settings store (P1).
2. Add pure pricing arithmetic and token estimation with unit tests (P2, P8).
3. Replace the destructive sync with a status- and price-preserving upsert;
   add admin/public model shapes (P3).
4. Add credit hold/reserve/settle/ledger storage and admin credit grant (P4).
5. Route every active model; reject unpriced rows; reserve and settle paid
   calls; record charge and cost (P5).
6. Ship the public `/models` table and update landing copy, preview, stats,
   and navigation (P6).
7. Build the authenticated admin shell, catalog page, pricing page with
   inline edits and bulk markup, and analytics page (P7).
8. Install Font Awesome Free and apply icons (P7).
9. Run gates and live receipts, close records, commit, push (P8).

### Verification

- `tests/pricing.test.mjs`: markup defaults, micro-dollar conversion, margin
  edge cases (free, cost zero, sell below cost), hold and charge arithmetic,
  output budget clamps, token estimates.
- Existing `tests/http.test.mjs`, `tests/admin-session.test.mjs`,
  `tests/admin-rate-limit.test.mjs` remain green.
- Live: public `/models` lists paid and free rows with sell prices and no
  upstream cost string; `/admin/pricing` is admin-gated; a price PATCH changes
  the row and `/v1/models`; a sync preserves the manual price and a disable;
  analytics renders totals after a paid call.
- Live paid call with a seeded key and granted credit: HTTP 200, usage row has
  `charged_micros > 0` and `cost_micros > 0`, balance decreases by the charge,
  held returns to zero. An unfunded tenant gets `402`.
- `npm run verify` and the CI gate.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/pricing.test.mjs
- gate: test tests/http.test.mjs
- gate: test tests/admin-session.test.mjs
- gate: test tests/admin-rate-limit.test.mjs
- gate: quality
- gate: build
- gate: verify

## Perfection Loop

### Loop 1 — RED

- **RED:** Free-only routing, no sell price, no revenue column, destructive
  sync, no public full catalog, no pricing or analytics surface, no icon set.
- **GREEN:** Plan above: separate cost/sell/charge, credit holds, upsert sync,
  full tables, admin pages, analytics.
- **AUDIT:** `lib/gateway.ts:214-231` rejects non-free; `lib/store/models.ts`
  deletes every row on sync; `lib/types.ts` has no sell fields; `/v1/models`
  returns cost-derived prices; `components/landing/model-grid.tsx` filters
  free only.
- **ADVERSARIAL:** A paid request can start streaming before usage is known, so
  the hold must be conservative; a client disconnect must still settle; a
  provider without a usage frame must not result in a free call; a sync must
  not wipe manual prices; a public mapping must not leak cost. Mitigations:
  output budget cap, settle-on-cancel with estimates, explicit cost/charge
  split, upsert, two model shapes.
- **CHANGE DELTA:** baseline.

### Missed Questions

1. **Is the credit ledger in scope?** Yes. Routing a paid model without a
   debit would give away upstream spend. Credits are operator-granted in this
   slice; checkout and customer signup remain out of scope and are stated.
2. **What if a paid model has no sell price?** It stays visible to admin as
   unpriced and is rejected by the gateway with `503 model_unpriced`; sync
   assigns a default from cost so this should only happen for cost-zero rows.
3. **What about provider subscription models with zero marginal cost?** They
   can be priced by the operator; if unpriced they stay blocked. The gateway
   does not claim the provider subscription is active.
4. **What exactly is margin?** `(sell - cost) / sell` per direction. Blended
   profit is `(sellIn + sellOut) - (costIn + costOut)` for 1M input plus 1M
   output, displayed in dollars.
5. **Do free-pool calls consume credit?** No. They remain zero-charge and
   weighted-metered. The weighted free pool is a provider-side limit.
6. **What if usage is missing from the provider response?** Estimate prompt
   tokens from the request and completion tokens from response/stream text
   (4 chars/token) and charge the same formula. The row records `ok` with real
   charged micros; the approximation is documented.
7. **What if the hold is smaller than actual usage?** Charge is capped at the
   hold, and paid requests get an output budget (`max_tokens` or 4096,
   maximum 65536) so the hold covers the budget. Free requests are not capped.
8. **What happens to delisted models?** `in_catalog` goes to 0; rows, prices,
   and status are retained. Usage history keeps its model id.
9. **Does the public API expose upstream cost?** No. `ModelSummary` carries
   sell price only; `AdminModelSummary` adds cost and is used only behind the
   admin guard.
10. **Is analytics real-time?** It reads `usage_events` per request range; no
    rollup table or background job is introduced in this slice.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] Commit SHA
- [ ] File:line ranges
- [ ] Gate output
- [ ] Reproducibility
- [ ] Step statuses

### Code Verification Evidence

- [ ] Affected paths exist
- [ ] Code matches the proposed solution
- [ ] Gates pass with pasted output
- [ ] Production call graph verified
- [ ] FID status reflects the actual state

### Loop 2 — Independent audit and self-correction

- **RED:** Pending implementation audit.
- **GREEN:** Pending.
- **AUDIT:** Pending.
- **ADVERSARIAL:** Pending.
- **CHANGE DELTA:** Pending.

### Loop 3 — Final convergence

- **RED:** Pending final audit.
- **GREEN:** Pending.
- **AUDIT:** Pending.
- **ADVERSARIAL:** Pending.
- **CHANGE DELTA:** Pending.

## Resolution

- **Closed Date:** Pending.
- **Fix Description:** Pending.
- **Tests Added:** Pending.
- **Verification Evidence:** Pending.
- **Archived:** Pending.

## Lessons Learned

Pending.
