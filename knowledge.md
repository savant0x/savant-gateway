# Project Knowledge

## What this is

A local-first gateway in front of one or more upstream providers, speaking
OpenAI Chat Completions or Anthropic Messages. It syncs each provider catalog,
mints local consumer keys, routes models through one streaming endpoint (free
rows immediately, non-free rows once priced), prices paid calls in integer
micro-dollars, settles them against tenant credit, and records revenue,
upstream cost, and usage in SQLite.

## Facts that are easy to get wrong

- **Provider, family, and group are different words.** A provider is an
  upstream account in the registry; the public owner is always Savant Gateway
  (`owned_by: "savant-gateway"`). The family is the model line (GPT,
  Claude, DeepSeek, …), serialized as `family`; the legacy `models.provider`
  column stores that family label. A group is a first-class billing tier with
  a stable slug, editable label, sort order, and a billing mode of `free`,
  `paid`, or `subscription`. UI data calls the mode `access`; `/v1/models`
  keeps `group` for compatibility and adds `group_slug`, `group_label`, and
  `group_billing_mode`. Never store or emit `"Free"` as a family.
- **The group billing mode decides free versus paid.** A model is free only
  when its assigned group's `billing_mode` is `free`; both sell prices are
  forced to zero and the gateway takes no credit hold. Provider flags
  (`allowFree`, `tokenWeight`, the `free/` id prefix) only choose the default
  group during sync. A manual `group_source = 'manual'` assignment survives
  sync. This is why a zero-cost free model can be moved to a custom paid group
  and charged. `accessFor` in `lib/store/shared.ts`, `isFreeCall` in
  `lib/gateway.ts`, and `recordUsage` in `lib/store/usage.ts` must agree on the
  group's billing mode.
- **Legacy `provider='Free'` rows are repaired on boot.**
  `normalizeLegacyFamilies` in `lib/db.ts` infers the family from the id and
  rewrites the row. `lib/model-family.ts` is the single source for that
  mapping.
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
- **Usage is weighted only for free-group calls.** `weighted_tokens` is
  `total × max(1, weight)` when the assigned group bills as free, and zero for
  paid and subscription groups — including a zero-cost model moved to a paid
  group. Each provider has its own free-pool remainder; usage rows carry
  `provider_slug` and a `group_slug` snapshot, and the per-user daily allowance
  is global.
- **Free calls pass an admission gate before dispatch.**
  `reserveFreeCall` in `lib/store/free-pool.ts` checks the user’s daily
  weighted allowance, the effective provider remaining (last synced remaining
  minus weighted usage since that sync minus live reservations), and the
  serving provider’s `subscription.allowed` flag. It inserts a reservation in
  the same immediate transaction as the decision; settlement releases it and
  records actual weighted usage. Limits: `FREE_DAILY_WEIGHTED_TOKENS` (default
  500,000), `FREE_PROVIDER_REMAINING_FLOOR` (1,000,000),
  `FREE_PROVIDER_ALERT_THRESHOLD` (2,000,000). A blocked call returns `429`
  with `Retry-After` and, for the per-user allowance, `X-RateLimit-Reset`.
- **Operator `/api/*` requires an admin session in production.**
  `ALLOW_LOOPBACK_CONSOLE` in `lib/admin-auth.ts` enables the loopback branch
  only outside production, and `/dashboard` redirects to `/admin/login` in a
  production build. The loopback branch trusts the `Host` header and is
  spoofable by a non-browser client; it must never gate privileged actions on
  an internet-facing server. The admin panel uses `guardAdminApi` /
  `requireAdminPage`, which never depended on loopback.
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
- **Customer identity is server-side and revocable.** `POST /api/auth/signup`
  writes a scrypt hash; login issues a 32-byte opaque token in the
  `sg_session` cookie, and only its SHA-256 hash is stored in
  `customer_sessions`. Sign-out sets `revoked_at`. Do not replace this with a
  signed stateless token: revocation is a requirement.
- **Customer data is scoped by the session user.** `/api/account/keys`,
  `listCustomerUsage`, `listCustomerTopups`, and `getAccountSummary(userId)`
  all take the authenticated id. The old local-tenant wrappers
  (`listApiKeys`, `listUsage`, `getAccountSummary()` without an id) are for the
  operator console only; never use them in a customer route.
- **Only the Stripe webhook may credit a top-up.** The success redirect is
  advisory. `fulfillTopup` requires a pending row, a matching amount and
  currency, a unique `provider_ref`, and one transaction that marks the row
  paid and writes the ledger. Replays return `already_paid` with no second
  credit. Stripe configuration requires both `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`; otherwise checkout returns `503` and no fake credit
  path exists.
- **Top-up amounts are exact.** `lib/topup-amount.ts` parses dollars without
  floating point, enforces $5–$500, and returns cents plus micro-dollars.
  Stripe receives cents; the database receives micros.
- **A zero balance still works on free-group models.** Paid requests are the
  only ones that reserve credit. A zero-cost model moved to a paid group is a
  paid request and needs credit.
- **Provider keys are server-only.** Each provider row names an environment
  variable (`PROVIDER_KEY`, `COMMANDCODE_API_KEY`); `lib/providers/request.ts`
  reads the value at request time. Never place a key in `NEXT_PUBLIC_*`, the
  database, an admin response, or a client component.
- **Font Awesome Free is imported once.** `app/layout.tsx` imports
  `@fortawesome/fontawesome-free/css/all.min.css`; components use
  `<i className="fa-solid fa-…" />`.

## Current layout

- `app/page.tsx` — public landing at `/`.
- `app/models` — public full catalog with sell prices.
- `app/docs` — public API reference for external consumers.
- `app/signup`, `app/login`, `app/account` — customer authentication and
  account console.
- `app/dashboard` — operator console.
- `app/admin/(panel)` — authenticated shell; overview, customers, catalog,
  providers, pricing, analytics. `app/admin/login` is the only unauthenticated
  admin page.
- `app/api/auth/*` — signup, login, logout, and current-customer endpoints.
- `app/api/account/*` — scoped keys and Stripe checkout creation.
- `app/api/webhooks/stripe` — signature-verified, idempotent fulfillment.
- `app/api/admin/*` — session, catalog status, provider registry, pricing, and
  credit endpoints.
- `app/api/*` — console actions (loopback or admin session).
- `app/v1/chat/completions` — the gateway entry point.
- `app/v1/models` — authenticated catalog with provider owner, family,
  group, and sell prices.
- `lib/providers/` — provider registry, provider-scoped sync, OpenAI and
  Anthropic adapters. `lib/provider.ts` is a compatibility re-export.
- `lib/schema/` — provider schema and shared migration helpers.
- `lib/pricing.ts` — pure pricing and estimation arithmetic.
- `lib/gateway.ts` — auth, routing, reservation, response handling.
- `lib/gateway-stream.ts` — SSE relay and settle-on-close.
- `lib/gateway-settle.ts` — usage parsing and settlement.
- `lib/store/billing.ts` — credit grants, ledger, holds.
- `lib/store/customer.ts` — customer identity, sessions, admin summaries.
- `lib/store/account.ts` — customer keys, usage, and account composition.
- `lib/store/topups.ts` — pending top-ups and idempotent fulfillment.
- `lib/store/analytics.ts` — revenue/cost/margin queries.
- `lib/customer.ts`, `lib/password.ts`, `lib/customer-session.ts`,
  `lib/customer-auth.ts` — validation, scrypt, opaque sessions, guards.
- `lib/stripe.ts`, `lib/topup-amount.ts` — Stripe config/client and exact
  amount parsing.
- `lib/admin-session.ts` — pure token, password, cookie, and origin logic.
- `lib/store/*` — persistence split by responsibility.
- `components/landing/*`, `components/catalog/*`, `components/docs/*`,
  `components/dashboard/*`, `components/admin/*` — UI.
- `assets/` — source brand files; served copies live in `public/`.

## Verification

`npm run verify` is the full local gate. FID-2026-1029-006 records its
2026-10-29 closure receipt: 48 tests, quality PASS over 122 files, and a
32-route build at that time, plus live HTTP checks on a disposable database (scoped keys and usage,
cross-account revoke denied, unconfigured checkout `503`, signed webhook
credited once, replay no-op, logout revoked). FID-2026-1029-004 holds the
pricing and paid-routing receipt; FID-2026-1029-005 holds the
provider/family/group correction. Live provider checks require `PROVIDER_KEY`
and are not run in CI. Unit tests cover scrypt hashing, customer validation,
exact top-up parsing, opaque session shape and cookie flags, admin token
tampering, expiry, password rotation, epoch revocation, origin checks, the
login limiter, HTTP key extraction, pricing arithmetic, and family
normalization, provider-registry validation, provider-scoped catalog identity,
and Anthropic request/response/stream translation. The current tree builds 39
routes, runs 79 tests, and scans 152 files. FID-2026-1029-010 adds the
multi-provider receipt: the additive migration preserved 45 existing Savant
models, seeded CommandCode as unconfigured, and added the provider columns. A
real Stripe card payment and real paid upstream inference remain unverified;
the provider account has no paid balance, and CommandCode has no configured
credential.
