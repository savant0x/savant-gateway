# FID: Full catalog, sell-price math, credits, and analytics

**Filename:** `FID-2026-1029-004-full-catalog-pricing-analytics.md`
**ID:** FID-2026-1029-004
**Severity:** high
**Status:** closed
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
  per settlement, a bounded output budget, and live HTTP receipts with real
  usage rows. The hold is admission control, not a price ceiling; an actual
  charge above the estimate can leave the tenant balance negative and block
  the next paid call until it is funded.
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
7. **What if the hold is smaller than actual usage?** The hold is admission
   control, not a cap: settlement charges the provider-reported actual usage.
   Paid requests get an output budget (`max_tokens` or 4096, maximum 65536) to
   keep the estimate close, but a provider that counts more prompt tokens than
   estimated can still overrun it. That overrun is debited, may make the
   tenant balance negative, and the next paid call is rejected with `402`
   until credit is granted. Free requests are not budget-capped. This was
   corrected during Loop 2 after the first implementation capped the charge at
   the hold and underbilled a 33-micro call reserved at 15 micros.
8. **What happens to delisted models?** `in_catalog` goes to 0; rows, prices,
   and status are retained. Usage history keeps its model id.
9. **Does the public API expose upstream cost?** No. `ModelSummary` carries
   sell price only; `AdminModelSummary` adds cost and is used only behind the
   admin guard.
10. **Is analytics real-time?** It reads `usage_events` per request range; no
    rollup table or background job is introduced in this slice.

### Verification Receipt

- verified: 2026-10-29T06:47:00Z (local 2026-10-29 02:47 EDT)
- tree: `2623912` plus the closure copy and documentation changes in the
  closing docs commit
- `npm run lint`: exit 0, no warnings
- `npm run typecheck`: exit 0
- `npm test`: exit 0, 26 tests / 26 pass / 0 fail (158 ms)
- `npm run quality`: exit 0, PASS (400-line ceiling, 91 files scanned)
- `npm run build`: exit 0, Next 16.4.3, 20 routes
- `npm run verify`: exit 0 (full chain above)

```text
quality: PASS (400-line ceiling, 91 files scanned)
✓ Compiled successfully in 889ms
✓ Generating static pages using 15 workers (2/2)
VERIFY_EXIT=0
```

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `2623912` — `feat(catalog): sell the full catalog with
      credits, pricing math, and analytics (FID-2026-1029-004)`. The closure
      records and this receipt land in the following docs commit.
- [x] **File:line ranges:**
  - `lib/pricing.ts:1-160` — markup, margin, blended profit, token cost,
    holds, estimates, input validation.
  - `lib/store/settings.ts:1-42` — durable default markup.
  - `lib/store/billing.ts:1-212` — credit grants, ledger, atomic reserve,
    expiry sweep, release.
  - `lib/store/models.ts:52-222` — manual pricing, additive sync, bulk markup.
  - `lib/store/usage.ts:37-105` — one transaction for hold release, debit, and
    usage row.
  - `lib/gateway.ts:62-135` — free classification and paid reservation.
  - `lib/gateway.ts:135-298` — full-catalog routing, budget limits, settlement.
  - `lib/gateway-stream.ts:13-129` — streaming metering and settle-on-close.
  - `lib/gateway-settle.ts:123-152` — cost/charge calculation and settlement.
  - `lib/store/analytics.ts:71-165` — range totals, daily series, top models.
  - `app/api/admin/pricing/route.ts:22-95` — price PATCH and markup POST.
  - `app/api/admin/credit/route.ts:1-60` — credit GET/POST.
  - `app/admin/(panel)/layout.tsx:1-31` — one authenticated admin shell.
  - `app/admin/(panel)/pricing/page.tsx:1-124` — pricing math surface.
  - `app/admin/(panel)/analytics/page.tsx:1-164` — revenue/cost/margin.
  - `app/models/page.tsx:1-102` — public full catalog.
  - `components/catalog/model-catalog-table.tsx:40-210` — search, filter,
    sort, pagination over every active model.
  - `components/admin/pricing-table.tsx:25-262` — inline edits and live margin.
  - `lib/db.ts:128-220` — additive sell-price, credit, ledger, usage, and
    settings migrations.
  - `app/layout.tsx:1` — Font Awesome Free stylesheet import.
- [x] **Gate output:** pasted in Verification Receipt above; raw log kept at
      `/tmp/sg-verify.log` during the session. Exit 0 on every gate.
- [x] **Reproducibility:** grep finds every anchor, e.g.
      `grep -n "export function reserveCreditHold" lib/store/billing.ts` →
      `148`; `grep -n "export function getAnalyticsData"
      lib/store/analytics.ts` → `71`; `grep -n "export async function
      handleChatCompletions" lib/gateway.ts` → `135`.
- [x] **Step statuses:**
  1. Additive schema and settings store — **implemented** (`lib/db.ts`,
     `lib/store/settings.ts`).
  2. Pure pricing arithmetic and tests — **implemented** (`lib/pricing.ts`,
     `tests/pricing.test.mjs`, 10 tests).
  3. Additive upsert sync and two model shapes — **implemented**
     (`lib/store/models.ts`, `lib/types.ts`).
  4. Credit holds, settlement, ledger, admin grant — **implemented**
     (`lib/store/billing.ts`, `lib/store/usage.ts`,
     `app/api/admin/credit/route.ts`).
  5. Full-catalog routing with reservation and settlement — **implemented**
     (`lib/gateway.ts`, `lib/gateway-stream.ts`, `lib/gateway-settle.ts`).
  6. Public catalog table and landing copy — **implemented** (`app/models`,
     `components/catalog`, landing components).
  7. Authenticated admin shell, catalog, pricing, analytics, icons —
     **implemented** (`app/admin/(panel)/*`, `components/admin/*`,
     Font Awesome Free).
  8. Gates, live receipts, records, commit — **implemented** (this receipt).

### Code Verification Evidence

- [x] Files referenced in Affected Components exist; `npm run build` resolved
      all 20 routes.
- [x] Implementation matches the Proposed Solution, with one deliberate
      correction recorded in Loop 2: settlement is no longer capped at the
      reservation.
- [x] Typecheck, lint, tests, quality, and build pass with pasted output above.
- [x] Production call-graph evidence: live `POST /api/provider/sync` imported
      45 models (11 free, 24 paid, 10 subscription-only); `/api/models`
      returned 45 public rows with sell-price fields and no cost fields;
      `/api/admin/pricing` returned the manual `gpt-6.1-sol` row at cost
      `$0.30` / sell `$0.40` / margin `2500` bps; unauthenticated `/admin`
      returned `307` to `/admin/login`; all four admin pages returned `200`
      with a real session; a foreign-origin PATCH returned `403`. A final smoke
      on the rebuilt bundle after the copy fix returned `200` for `/`,
      `/models`, `/dashboard`, and all four admin pages; the pricing API still
      reported 24 priced / 10 unpriced / 11 free with `gpt-6.1-sol` at 2500 bps.
- [x] FID status reflects the actual state: closed against `2623912` after the
      gates and receipts above.

### Loop 2 — Independent audit and self-correction

- **RED:** The first settlement implementation capped the debit at the hold. A
  synthetic paid call reserved 15 micros but the provider reported 33 micros
  of usage, so the gateway would have underbilled by 18 micros. The analytics
  footnote still described the removed cap. A stale `allowFree`-only free test
  would also have treated zero-margin subscription rows as free.
- **GREEN:** Settlement now debits the actual charge; the hold only gates
  admission. An overrun can leave the balance negative and blocks the next
  paid call. The public and admin copy was corrected. Free classification is
  `allowFree && tokenWeight > 0`, matching the provider’s weighted free pool.
- **AUDIT:** Disposable-DB receipt: a paid hold settled 33 micros on actual
  usage; a streaming call settled 322,000 micros with zero holds left; an
  unpriced row returned `503 model_unpriced`; a 70k output budget returned
  `400`; an underfunded actual charge produced a negative balance and the next
  paid call returned `402`. Final-tree live smoke: `/models` 200 with a table,
  admin pages 200 with a session, `/api/models` 45 rows and no cost keys.
- **ADVERSARIAL:** A client can still consume upstream output after
  disconnecting; the stream path settles on close with estimated delivered
  tokens. The estimate is approximate and flagged; it is not a promise of
  exact provider accounting. Operator price edits can set a sell price below
  cost; the UI shows negative margin rather than blocking a deliberate loss
  leader. Refunds and multi-tenant signup remain out of scope and are stated.
- **CHANGE DELTA:** 14% (settlement semantics, copy, and receipts).

### Loop 3 — Final convergence

- **RED:** Final audit risks: stale docs claiming free-only product access;
  cost leaking through a public shape; a sync destroying manual prices or
  operator disables; admin pages not actually gated; unbounded output budgets;
  an icon import that never reaches the client.
- **GREEN:** Docs and copy now describe paid access, credits, and margins.
  Public `ModelSummary` has no cost fields; the live `/api/models` response
  matched. The sync is an upsert with `in_catalog` separate from `status`.
  Admin layout calls `requireAdminPage()` and unauthenticated `/admin`
  redirects. Output budgets are clamped at 65,536. Font Awesome classes render
  on the public page.
- **AUDIT:** Sync receipt preserved manual `gpt-6.1-sol` pricing and a disabled
  `deepseek-v4-flash` row; the model was re-enabled afterward. Quality gate
  scanned 91 files with no file above 400 lines. Build listed all 20 routes.
- **ADVERSARIAL:** Remaining structural limit: one local tenant (`user_dev`),
  no customer signup or checkout, SQLite single-instance storage, and one
  provider key. The UI states these limits; they are not presented as finished
  multi-tenant billing.
- **CHANGE DELTA:** 2% (final copy and record corrections; no functional
  change after the gate run).

## Resolution

- **Closed Date:** 2026-10-29 02:45 EDT
- **Fix Description:** The gateway now exposes and routes every active catalog
  model. Upstream cost, sell price, and charged revenue are separate integer
  micro-dollar fields. Operators edit sell prices inline, apply a global
  markup, and see per-direction and blended margin. Paid calls reserve a
  credit hold, settle actual usage in one transaction, and write revenue and
  cost on the same usage row. A public `/models` table lists the full catalog
  with sell prices only; admin has authenticated overview, catalog, pricing,
  and analytics pages. Analytics reports revenue, upstream cost, gross margin,
  requests, tokens, latency, error rate, a daily series, and top models over
  7/30/90 days. Font Awesome Free supplies the icon surface. Sync is additive
  and preserves manual prices, disables, and delisted rows.
- **Tests Added:** Yes — `tests/pricing.test.mjs` covers price conversion,
  markup defaults and clamping, margin edge cases, blended profit, holds,
  token cost, estimation, output budgets, input validation, and average
  margin. Total suite: 26 tests, all passing.
- **Verification Evidence:** `npm run verify` exit 0; live production smoke
  receipts above; disposable-DB money path receipts above.
- **Archived:** 2026-10-29 02:45 EDT — moved to `dev/fids/archive/` with this
  receipt.

## Lessons Learned

A reservation is not a price. The pre-flight hold protects the balance from
obvious overspend, but only provider-reported usage is revenue; capping the
charge at the estimate silently gives away the difference. Test the overrun
path deliberately with a hold smaller than actual usage, not only the happy
path. Also keep public and admin model shapes separate from the start: the
cheapest way to prevent a cost leak is to make the cost key impossible to
serialize into the public response. Finally, an additive sync is a product
requirement, not a refactor: deleting and rebuilding rows would erase the
operator’s prices and disables on every sync.
