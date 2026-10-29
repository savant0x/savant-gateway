# Changelog

All notable changes are recorded here. Entries name the FID that drove them and
distinguish verified behavior from unverified claims.

## 2026-10-29 — Subscription revenue analytics

- **FID-2026-1029-011 — medium — Subscription plan revenue in admin analytics.**
  The admin overview and analytics page now show credit revenue
  (`usage_events.charged_micros`, recognized at settlement) separately from plan
  revenue (paid `subscription_invoices`, recognized at `paid_at`), plus total
  revenue, total margin, paid-invoice count, active/past-due/canceling/manual
  subscriber counts, and MRR. A per-plan table reports range invoice revenue and
  current run-rate; the daily chart plots credit, plan, and upstream cost as
  grouped bars; the top-models table is explicitly credit-only. MRR counts
  active Stripe subscriptions that are not set to cancel, normalizes yearly
  prices to a month, and excludes manual comps and past-due plans. The query
  layer moved to `lib/analytics.ts` with an injectable database handle and clock
  so Node tests execute the real SQL; `lib/revenue.ts` holds the pure run-rate
  and margin math. An additive `(status, paid_at)` invoice index supports the
  range scan. Billing, routing, invoice recording, and Stripe handling are
  unchanged. Refunds and credit notes are not tracked, so a paid invoice stays
  in recorded cash after a refund; plan revenue is cash-basis while cost is
  usage-basis. Tests: `tests/revenue.test.mjs` (5) and
  `tests/analytics.test.mjs` (3). Gates: `npm run verify` exit 0, 107/107 tests,
  quality PASS over 189 files, 51-route build. A disposable-database receipt
  rendered $163.00 total revenue ($3.00 credit + $160.00 plans), $1.50 cost,
  +$161.50 total margin, $20.00 MRR, 4 active/1 past-due/1 canceling/1 manual
  subscribers, and plan rows of $120.00, $40.00, and $0.00; anonymous analytics
  redirected 307 to login, a wrong password returned 401, and the authenticated
  page returned 200. Committed as `ba233c6`; FID-011 is closed against that
  commit and archived.

## 2026-10-29 — Subscription plans and entitlements

- **FID-2026-1029-008 — high — Customer subscription plans, entitlement
  snapshots, and recurring billing.** Added an operator-authored plan catalog
  (price, month/year interval, included groups and individual models, included
  weighted-token allowance, `block` or `credit` overage with markup), plus an
  additive schema for plans, subscriptions, entitlement snapshots, allowance
  periods, subscription holds, invoices, and billing-event idempotency. A
  subscription snapshots the plan values and exact model ids; later plan edits
  do not change a purchase, and refresh is explicit. The gateway now picks one
  billing source per call: included plan usage reserves weighted tokens and
  charges zero, exhausted `block` plans return `402 subscription_limit_reached`,
  exhausted `credit` plans charge from prepaid credit with markup, past-due
  plans return `402 subscription_past_due`, and uncovered subscription-group
  models return `403 subscription_required`. Stripe Checkout in subscription
  mode, Billing Portal, cancel/resume, signed `invoice.paid` activation,
  payment failure, subscription reconciliation, and top-up dispatch share the
  webhook with event-id idempotency. Customer surfaces add `/plans` and an
  account subscription card with allowance, invoices, cancel, resume, and
  portal; admin surfaces add **Plans** and **Subscriptions** with create, edit,
  archive, delete, manual grant/extend/revoke, Stripe sync, and entitlement
  refresh. `/v1/models` adds `requires_subscription`; provider quota copy now
  says upstream. Tests: `tests/plans.test.mjs` (10 cases). Gates: `npm run
  verify` exit 0, 99/99 tests, quality PASS over 186 files, 51-route build. A
  disposable-database HTTP receipt proved active-plan CRUD and draft exclusion,
  a zero-charge included call with 6 weighted tokens, snapshot stability
  through a $5→$6 and group edit, explicit refresh 23→24 models, 403 on an
  uncovered plan-only model, 402 on an exhausted block plan, 9-micro credit
  overage with 5000-bps markup, duplicate checkout 409, foreign-origin 403,
  manual extend/revoke, one signed-invoice activation with a replay no-op, and
  a $5.00 top-up credited once. Real Stripe checkout/recurring delivery and a
  funded live subscription remain unverified (B4). Committed as `a945789`;
  FID-008 is closed against that commit and archived.

## 2026-10-29 — First-class model groups

- **FID-2026-1029-007 — high — First-class model groups with operator
  assignment.** Groups are now durable rows in `model_groups` with a stable
  slug, editable label, description, sort order, billing mode, and a protected
  system flag. The migration seeds `free`, `paid`, and `subscription` and
  backfills every existing model from its old provider-derived access, so
  behavior does not change on boot. Models carry `group_slug` and
  `group_source`; a manual assignment survives provider sync, while auto rows
  follow the provider-derived default. The admin panel adds
  **Groups** (`/admin/groups`) with create, edit, delete-with-reassignment,
  system-group protection, and model counts, plus group selectors in the
  catalog and pricing tables and a dynamic group filter in the public catalog.
  Billing follows the group: a `free` group forces both sell prices to zero and
  skips credit holds; `paid` and `subscription` groups use the existing credit
  path. A zero-cost model can now be moved to a paid group and charged. Usage
  rows snapshot `group_slug`, and `/v1/models` keeps `group` while adding
  `group_slug`, `group_label`, and `group_billing_mode`.
  Tests: `tests/model-groups.test.mjs` covers validation, reserved slugs,
  price reset, access mapping, and reassignment. Gates: `npm run verify` exit
  0, 89/89 tests, quality PASS over 160 files, 41-route build. A disposable copy
  of `data/gateway.db` migrated with all 45 models preserved; the receipt
  created a custom paid group, moved a zero-cost `free/` model into it, priced
  it, confirmed a provider sync preserved the manual group, and made a live
  gateway call that charged 160 micros with `group_slug = paid`. Closed against
  `161ddcc`; FID-007 is archived.

## 2026-10-29 — D6/D50 remediation and provider-registry design

- **FID-2026-1029-009 — high (D50), low (D6) — Sanitize client errors and
  enforce free-pool admission control.** `sanitizeError` in `lib/http.ts` logs
  local exception detail server-side and returns fixed text on the public
  provider-fetch path, the admin credit grant (now `500`), and provider sync.
  Free calls now reserve weighted tokens before dispatch against a per-user
  UTC-daily allowance and the effective provider remaining, returning `429`
  with `Retry-After` and `X-RateLimit-Reset` on refusal. Reservations settle in
  the usage transaction; new tables are `free_pool_usage` and
  `free_pool_reservations`. Limits are `FREE_DAILY_WEIGHTED_TOKENS`,
  `FREE_PROVIDER_REMAINING_FLOOR`, and `FREE_PROVIDER_ALERT_THRESHOLD`.
  Closed against `4782ce1`. Gates: `npm run verify` exit 0, 62/62 tests,
  quality PASS over 127 files, 33-route build. Tests:
  `tests/free-pool.test.mjs` plus sanitizer cases in `tests/http.test.mjs`.
- **FID-2026-1029-010 — high — Multi-provider registry.** Implemented the
  `providers` entity: per-provider protocol, base URL, credential variable
  name, static headers, capability flags, enabled state, and runtime status.
  Models are now scoped by `(upstream_slug, upstream_id)` with their own
  `family`, wire `protocol`, and `cost_source`; a sync only delists that
  provider's vanished rows. `lib/providers/` holds the registry, scoped sync,
  and OpenAI Chat Completions and Anthropic Messages adapters (request,
  response, stream mapping, usage, and error translation). Paid rows without a
  known cost cannot be enabled; operators enter manual costs that survive
  sync. Free-pool admission uses the serving provider's remaining figure while
  the daily allowance stays per user. Admin → Providers registers, edits,
  enables, disables, deletes, tests, and syncs upstreams; the legacy
  `POST /api/provider/sync` remains an alias for syncing every enabled
  provider. Existing Savant models, ids, keys, balances, and usage rows are
  untouched by the additive migration, and CommandCode is seeded unconfigured.
  Tests: `tests/providers.test.mjs`, `tests/provider-catalog.test.mjs`, and
  `tests/anthropic-translate.test.mjs`. Gates: `npm run verify` exit 0, 79/79
  tests, quality PASS over 152 files, 39-route build. A disposable-database
  boot kept all 45 existing models on `savant`, seeded both providers, and
  added the `provider_slug` columns. Live CommandCode inference is not run:
  no credential or second-upstream account is configured. Closed against
  `957430c`; archived at
  `dev/fids/archive/FID-2026-1029-010-multi-provider-registry.md`.

## 2026-10-29 — Rebuild closure and record reconciliation

- **FID-2026-1029-001 — high — Rebuild the gateway on Next.js 16 + HeroUI v3.**
  Closed against `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first commit
  containing the rebuilt tree. The production loopback bypass recorded as an
  open Host-header finding is disabled in production builds, and FID-006's
  receipt recorded a spoofed `Host: localhost` request returning `403`; the
  usage-row copy finding was removed with the rebuilt dashboard; cancelled
  streams now settle provider usage or a streamed-character estimate instead of
  zero. Closure gates: `npm run verify` exit 0, 48/48 tests, quality PASS over
  125 files, 33-route build. Archived at
  `dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md`.
- **FID-2026-1029-006 — record correction, no behavior change.** The archived
  record's status was corrected from `converged` to `closed`; its 2026-10-29
  closure receipt and `455ddb5` implementation commit are unchanged.

## 2026-10-29 — Customer accounts and prepaid credit top-ups

- **FID-2026-1029-006 — high — Sell paid models to outside customers.** Adds
  email/password signup with scrypt hashes, opaque server-side sessions
  (`sg_session`, HttpOnly, SameSite=Lax, seven days, Secure in production),
  and sign-out revocation. Customer keys, usage, ledger, and top-up history are
  scoped by the session user; a second account cannot revoke or read the
  first's data. Adds `/signup`, `/login`, and `/account`, plus
  `/api/auth/*`, `/api/account/keys`, `/api/account/topup`, and an admin
  Customers page. Prepaid credit is sold in $5–$500 increments through Stripe
  Checkout; credit is granted only by a signature-verified webhook whose
  amount and currency match a pending top-up. `topups.provider_ref` is unique
  and fulfillment transitions and ledgers in one transaction, so replay is a
  no-op. Checkout returns `503` while Stripe is unconfigured — no fake credit
  path. Also hardens the operator boundary: the loopback console bypass is
  disabled and `/dashboard` requires the admin session in production builds.
  Tests: 48 total (18 new password, customer, session, and top-up tests).
  Live disposable-DB receipt: 201 signup, 409 duplicate, 401 wrong password,
  cross-account revoke 404, foreign Origin 403, per-account usage isolation,
  503 unconfigured top-up, signed paid webhook credited $25.00 once, replay
  credited nothing, unpaid event ignored, logout revoked the session, and
  `/admin/customers` returned 200. A live Stripe card payment remains
  unverified because no live keys were available; fulfillment was tested with
  a Stripe-signed event. Closed against `455ddb5`; archived at
  `dev/fids/archive/FID-2026-1029-006-customer-accounts-and-credit-topups.md`.

## 2026-10-29 — Provider, family, and price-group semantics

- **FID-2026-1029-005 — medium — Separate the provider identity from the model
  family and price group.** The catalog had stored the upstream `"Free"`
  sentinel as the model provider for 21 rows, and `/v1/models` published
  `owned_by: "Free"`. Savant Gateway is now the provider (`owned_by:
  "savant-gateway"`); the model family (GPT, Claude, DeepSeek, …) is serialized
  as `family`; and free/paid/subscription is the price group (`group` in
  `/v1/models`, `access` in UI data). Legacy `provider='Free'` rows are
  repaired at boot from the model id, syncs can no longer reintroduce the
  sentinel, and the public catalog, admin tables, and analytics use Family and
  Group labels. Adds `lib/model-family.ts` and `tests/model-family.test.mjs`
  (4 tests; 30 total).

## 2026-10-29 — Full catalog, sell-price math, credits, and analytics

- **FID-2026-1029-004 — high — Sell the full provider catalog with credit
  settlement and pricing analytics.** All 45 active provider rows are public
  instead of only the free pool; free rows route immediately and non-free rows
  route once priced. Adds separate upstream-cost and
  sell-price fields, a 30% default markup, inline per-row pricing, bulk
  repricing, and per-direction plus blended margin. Paid calls reserve an
  estimated credit hold, settle actual usage in one transaction, and write
  revenue and cost to the usage row; free-pool calls stay zero-charge and
  weighted-metered. Adds a public `/models` table with search, sort, filters,
  and pagination; an authenticated admin shell with overview, catalog, pricing,
  and analytics pages; operator credit grants and a ledger; 7/30/90-day
  revenue, cost, margin, token, latency, error-rate, and top-model reporting;
  and Font Awesome Free. Provider sync is now an additive upsert that preserves
  manual prices, operator disables, and delisted rows. Settlement deliberately
  charges actual usage rather than capping at the hold, so the pre-flight
  reservation cannot underbill an overrun; an unfunded overrun leaves a
  negative balance and the next paid call returns `402`. Tests: 26 total (10
  new pricing tests). Closed against `2623912`; archived at
  `dev/fids/archive/FID-2026-1029-004-full-catalog-pricing-analytics.md`.

## 2026-10-29 — Landing page, admin panel, and canonical protocol

- **FID-2026-1029-003 — high — Public landing, authenticated admin panel, and
  canonical protocol import.** `/` is now a public landing page with the
  supplied brand assets and live active/free catalog counts; the existing
  console moved to `/dashboard`. Adds a password-protected `/admin` panel with
  provider sync, model enable/disable, key creation/revocation, and usage.
  Model statuses survive a provider sync. Admin sessions are HMAC-signed
  HttpOnly cookies with a durable epoch: sign-out revokes issued tokens, not
  just the browser copy. Login is rate-limited and cross-origin mutations are
  rejected. The existing `/api/*` routes now accept loopback or an admin
  session and keep their loopback development behavior. Replaces the condensed
  ECHO summary with the canonical `ECHO.md`, the single-agent protocol and
  marker, coding standards, templates, and an npm-configured
  `protocol.config.yaml`. Adds brand favicons, web manifest, and source assets.
  Tests: 16 (session, limiter, HTTP helpers). Closed against
  `508d4431524b26606e4b94a7b95e0b3ccc22a2c3`; archived at
  `dev/fids/archive/FID-2026-1029-003-landing-admin-and-protocol-port.md`.

## 2026-10-29 — Savant Gateway repository bootstrap

- **FID-2026-1029-002 — high — Establish the Savant Gateway identity and
  repository scaffold.** The product surface is renamed from the resale
  scaffold to Savant Gateway; `lib/apinex.ts` becomes `lib/provider.ts`;
  provider endpoint variables become `PROVIDER_BASE_URL` and
  `PROVIDER_PUBLIC_MODELS_URL` with the existing upstream defaults. The
  929-line dashboard and 471-line store are split into responsibility-scoped
  modules under the 400-line ceiling. Adds AGENTS/ECHO/protocol governance,
  FID and session templates, the attribution guard, quality gate, Node test
  suite, git hooks, and CI. No provider behavior, key format, free-pool rule,
  or metering rule changed. Closed against commit
  `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`; the FID is archived at
  `dev/fids/archive/FID-2026-1029-002-savant-gateway-bootstrap.md`.
