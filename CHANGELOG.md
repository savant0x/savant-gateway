# Changelog

All notable changes are recorded here. Entries name the FID that drove them and
distinguish verified behavior from unverified claims.

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
