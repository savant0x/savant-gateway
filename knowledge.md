# Project Knowledge

## What this is

A local-first gateway in front of an OpenAI-compatible upstream provider. It
syncs the provider catalog, mints local consumer keys, routes models through
one streaming endpoint (free rows immediately, non-free rows once priced),
prices paid calls in integer micro-dollars,
settles them against tenant credit, and records revenue, upstream cost, and
usage in SQLite.

## Facts that are easy to get wrong

- **Free means `allowFree && tokenWeight > 0`.** The provider marks some
  subscription rows with `allowFree`, but only weighted free-pool rows are
  zero-charge. `accessFor` in `lib/store/shared.ts` and `isFreeCall` in
  `lib/gateway.ts` must stay in agreement.
- **Cost, sell price, and charge are three different numbers.**
  `models.input_price_micros` / `output_price_micros` are upstream cost;
  `models.sell_input_micros` / `sell_output_micros` are our price;
  `usage_events.charged_micros` is revenue for that call and
  `usage_events.cost_micros` is the upstream cost at call time. Never collapse
  them.
- **Money is integer micro-dollars.** `1_000_000` micros = `$1.00`; prices are
  entered and displayed as USD per 1M tokens. Use `lib/pricing.ts`; do not
  introduce floating-point arithmetic in the settlement path.
- **A hold is admission control, not a price ceiling.** `recordUsage`
  releases the reserved hold and debits the actual charge. If the provider
  reports more usage than estimated, the balance may become negative and the
  next paid request gets `402 insufficient_quota`. The first implementation
  capped the charge at the hold and silently underbilled; do not reintroduce
  that.
- **Paid calls need a sell price and credit.** An unpriced non-free row returns
  `503 model_unpriced`. A funded tenant is required; the reservation is
  atomic and expired holds are swept before a new reservation.
- **Usage is weighted only for free-pool calls.** `weighted_tokens` is
  `total × weight` when the model is free with a positive weight, and zero
  otherwise. The provider free pool is shared across the one provider key.
- **`/api/*` accepts loopback or an admin session.** `guardLocalOrAdmin` first
  rejects a foreign `Origin`, then allows a loopback request, then verifies the
  admin cookie. The loopback branch trusts the `Host` header and is spoofable
  by a non-browser client; it is a development convenience, not a public
  boundary. The admin panel uses `guardAdminApi` / `requireAdminPage`, which do
  not depend on loopback.
- **Admin sessions are signed and revocable.** The cookie is
  `v1.<expiry>.<epoch>.<nonce>.<HMAC>`; the epoch lives in
  `admin_state.session_epoch`. `DELETE /api/admin/session` bumps the epoch, so
  every issued token stops verifying, not just the browser copy.
- **The signing key is derived from `ADMIN_SESSION_SECRET` and
  `ADMIN_PASSWORD`.** Rotating either invalidates existing sessions. Both are
  required; the panel shows a setup card when they are missing or too short.
- **Sync is additive, not destructive.** `replaceModels` upserts, preserves
  manual prices and operator disables, and marks vanished rows
  `in_catalog = 0`. It never deletes a row. `in_catalog` is separate from
  `status`; a delisted model can still have usage history and a price.
- **The public shape never carries cost.** `ModelSummary` has sell prices
  only; `AdminModelSummary` adds cost, margin, price source, and catalog
  presence. Keep the split when adding fields.
- **Analytics reads `usage_events` directly.** There is no rollup table or
  background job. Ranges are 7, 30, or 90 days; empty days are zero-filled in
  UTC. A failed upstream call writes a zero-charge error row.
- **SQLite is local state.** `data/` is ignored and not part of the
  deliverable. Deleting it and syncing again is the reset path.
- **The provider key is server-only.** `PROVIDER_KEY` is read through
  `lib/provider.ts`; never place it in `NEXT_PUBLIC_*` or any client component.
- **Font Awesome Free is imported once.** `app/layout.tsx` imports
  `@fortawesome/fontawesome-free/css/all.min.css`; components use
  `<i className="fa-solid fa-…" />`.

## Current layout

- `app/page.tsx` — public landing at `/`.
- `app/models` — public full catalog with sell prices.
- `app/dashboard` — operator console.
- `app/admin/(panel)` — authenticated shell; overview, catalog, pricing,
  analytics. `app/admin/login` is the only unauthenticated admin page.
- `app/api/admin/*` — session, catalog status, pricing, and credit endpoints.
- `app/api/*` — console actions (loopback or admin session).
- `app/v1/chat/completions` — the gateway entry point.
- `app/v1/models` — authenticated catalog with access tier and sell prices.
- `lib/provider.ts` — upstream client, metadata, sync.
- `lib/pricing.ts` — pure pricing and estimation arithmetic.
- `lib/gateway.ts` — auth, routing, reservation, response handling.
- `lib/gateway-stream.ts` — SSE relay and settle-on-close.
- `lib/gateway-settle.ts` — usage parsing and settlement.
- `lib/store/billing.ts` — credit grants, ledger, holds.
- `lib/store/analytics.ts` — revenue/cost/margin queries.
- `lib/admin-session.ts` — pure token, password, cookie, and origin logic.
- `lib/store/*` — persistence split by responsibility.
- `components/landing/*`, `components/catalog/*`, `components/dashboard/*`,
  `components/admin/*` — UI.
- `assets/` — source brand files; served copies live in `public/`.

## Verification

`npm run verify` is the full local gate. FID-2026-1029-004 records the current
receipt (26 tests, quality PASS over 91 files, 20-route build) and the live
production smoke. Live provider checks require `PROVIDER_KEY` and are not run
in CI. Unit tests cover admin token tampering, expiry, password rotation, epoch
revocation, cookie flags, origin checks, the login limiter, HTTP key
extraction, and pricing arithmetic. The paid money path has a disposable-DB
receipt; the provider account has no paid balance, so real paid upstream
inference remains unverified.
