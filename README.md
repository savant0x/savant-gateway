# Savant Gateway

A Next.js gateway that puts a clean, priced product layer in front of an
OpenAI-compatible upstream provider.

[![ECHO](https://img.shields.io/badge/ECHO-v0.1.2_single--agent-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](dev/echo-v0.1.2-single-agent.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?style=flat-square&logo=nextdotjs&logoColor=%2300fbff)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v3-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](https://www.heroui.com/)
[![License](https://img.shields.io/badge/License-MIT-%23000000?style=flat-square)](LICENSE)

The gateway does seven things:

- syncs the upstream balance, subscription, model catalog, and public metadata;
- stores upstream cost, our sell price, and charged revenue as separate fields;
- creates customer accounts with scrypt password hashes and revocable,
  server-side sessions;
- mints account-owned consumer keys, stored only as SHA-256 hashes;
- routes every active catalog model through one OpenAI-compatible
  `POST /v1/chat/completions` endpoint once it is free or priced, streaming or
  JSON;
- reserves credit for paid calls, settles actual usage, and keeps a ledger;
- sells prepaid credit through Stripe Checkout, credits it only from a
  signature-verified webhook, and records weighted tokens, revenue, cost,
  latency, and status in SQLite.

## Surfaces

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page with live catalog counts and a request sample. |
| `/models` | Public | Searchable, sortable, paginated full catalog with sell prices. |
| `/docs` | Public | API reference: auth, model payload, provider/family/group, chat, errors. |
| `/signup` | Public | Create a customer account. |
| `/login` | Public | Customer sign-in. |
| `/account` | Customer session | Balance, top-ups, keys, usage, ledger, and quick start. |
| `/dashboard` | Operator console | Provider, catalog, local-tenant keys, tester, usage. |
| `/admin` | Admin session | Revenue, cost, margin, credit, provider status, recent usage. |
| `/admin/customers` | Admin session | Signup accounts, balances, request volume, and top-ups. |
| `/admin/catalog` | Admin session | Every row, including disabled and delisted models. |
| `/admin/pricing` | Admin session | Inline sell prices, markup, cost, margin, blended profit. |
| `/admin/analytics` | Admin session | 7/30/90-day revenue, cost, margin, tokens, latency, top models. |
| `/v1/*` | Consumer key | The OpenAI-compatible gateway. |

Customer accounts and the operator console are separate. Customer routes scope
every key, usage row, and ledger entry by the session user. In development,
operator `/api/*` actions accept a loopback request or a valid admin session.
In production the loopback bypass is disabled: `/dashboard` redirects to
`/admin/login`, and operator APIs require an admin session, so a spoofed `Host`
header cannot mint keys or read usage. See [SECURITY.md](SECURITY.md).

## Stack

- **Next.js 16** App Router and route handlers
- **HeroUI v3** with Tailwind CSS 4
- **Font Awesome Free** for the icon surface
- **SQLite** through `better-sqlite3`
- **TypeScript** strict, Node `>=22.18.0`
- **npm** for installs, tests, and gates

## Quick Start

```bash
npm install
cp .env.example .env.local
# put the upstream key in PROVIDER_KEY
# set ADMIN_PASSWORD (12+ chars) and ADMIN_SESSION_SECRET (32+ chars)
# optional: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SITE_URL
npm run dev
```

Open `http://localhost:3000` for the landing page, `/models` for the public
catalog, `/signup` for a customer account, `/dashboard` for the operator
console in development, and `/admin` for the password-protected panel. In a
production build, `/dashboard` requires the admin session too. Sync the
provider from the console or admin overview before using the catalog.

Generate an admin secret without writing it to a shell history file:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

A local `.env.local` is ignored by Git. The admin password is not stored in the
database; the session signing key is derived from the password and the session
secret, so rotating either invalidates existing sessions.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `PROVIDER_KEY` | Yes | Upstream key. Sent as `Authorization: Bearer …`. Server-only. |
| `ADMIN_PASSWORD` | For admin | 12+ characters. Compared in constant time. |
| `ADMIN_SESSION_SECRET` | For admin | 32+ characters. Signs the eight-hour admin cookie. |
| `STRIPE_SECRET_KEY` | For top-ups | Server-only Stripe key. Absent disables checkout with `503`. |
| `STRIPE_WEBHOOK_SECRET` | For top-ups | Signing secret for `/api/webhooks/stripe`. Checkout stays disabled without it. |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical origin for metadata and Stripe redirects. Defaults to `http://localhost:3000`. |
| `DB_PATH` | No | SQLite file. Defaults to `./data/gateway.db`. |
| `PROVIDER_BASE_URL` | No | Defaults to `https://api.apinex.bond/v1`. |
| `PROVIDER_PUBLIC_MODELS_URL` | No | Defaults to `https://apinex.bond/api/public/models`. |

Do not put any secret in a `NEXT_PUBLIC_*` variable.

## Catalog vocabulary

These three words mean different things and must not be collapsed:

- **Provider** — Savant Gateway. `/v1/models` publishes
  `owned_by: "savant-gateway"`.
- **Family** — the upstream model line: GPT, Claude, DeepSeek, Gemini, GLM,
  Kimi, Grok, and so on. It is the `family` field; the internal
  `models.provider` column stores this family label.
- **Group** — the price group: `free`, `paid`, or `subscription`. The UI
  serializes it as `access`; `/v1/models` publishes it as `group`.

## How it works

```text
browser / SDK
   │  Authorization: Bearer sk-…
   ▼
POST /v1/chat/completions
   │  hash key → active key + active user
   │  resolve model → active + in catalog
   │  free pool?  yes → weighted metering, zero charge
   │              no  → priced? → reserve credit hold
   ▼
upstream /v1/chat/completions
   │  Authorization: Bearer <PROVIDER_KEY>
   │  src: gate
   ▼
stream or JSON back to the caller
   │
   ▼
one transaction: release hold, debit actual charge,
write usage_events with revenue and upstream cost
```

The landing page, public catalog, console, and admin panel read the same
SQLite state. The public data functions deliberately return provider state,
active counts, and sell prices — never keys, upstream cost, or ledger rows.

### Model access

- **Free** = `allowFree` is true **and** the provider gives the row a positive
  `tokenWeight`. Only these rows are zero-charge. They are metered in the
  provider's weighted units; `free/gpt-6-luna` at weight 3 consumes 948 units
  for 316 raw tokens. `free/` is the price-group scope, not the family.
- **Subscription** = a `free/*` row the provider does not actually grant on the
  free pool. It is visible in the catalog but blocked unless the operator sets
  a sell price and the upstream account is entitled to it.
- **Paid** = every other catalog row. It is routable once priced and the tenant
  has available credit.

Disabled models are excluded from the public catalog and the gateway. The
state survives a provider sync. A model that vanishes upstream is marked
`in_catalog = 0` rather than deleted, so its pricing and usage history remain.

### Pricing and settlement

All money is stored as integer micro-dollars (`1_000_000 = $1.00`). Prices are
edited in **USD per 1M tokens**.

```text
auto sell price   = ceil(cost × (1 + markup))
input margin      = (sell_in  − cost_in)  ÷ sell_in
output margin     = (sell_out − cost_out) ÷ sell_out
blended profit    = (sell_in + sell_out) − (cost_in + cost_out)
```

The default markup is 30%. A sync prices new rows from cost; existing manual
rows keep their price. The bulk markup action can reprice auto rows only, or
every catalog row when overwrite is enabled. Editing one row marks it
`manual`. Free-pool rows are always zero.

A paid request reserves an estimated hold (prompt estimate plus output budget
at the sell price) against `users.credit_micros`. On completion, failure, or
stream close, one transaction releases the hold, debits the actual charge, and
writes the usage row with both revenue and upstream cost. The hold is admission
control, not a price ceiling: if the provider reports more usage than
estimated, the actual charge is debited and the balance can go negative. The
next paid call is then rejected with `402 insufficient_quota` until credit is
granted. Paid requests default to a 4,096-token output budget and accept up to
65,536.

## Admin session

- Password login at `/admin/login`; failed attempts are limited to five per
  client per ten minutes in memory.
- Cookie: `sg_admin`, `HttpOnly`, `SameSite=Strict`, `Path=/`, eight hours,
  `Secure` in production.
- The token is `v1.<expiry>.<epoch>.<nonce>.<HMAC>`; the epoch lives in SQLite,
  so signing out revokes every issued token, not just the browser copy.
- State-changing admin requests with a foreign `Origin` return `403`.
- Admin pages and APIs send `Cache-Control: no-store` and are `noindex`.

## Customer accounts and top-ups

Signup creates a `users` row with a scrypt password hash (per-password salt,
`N=16384`, `r=8`, `p=1`, constant-time verification) and a server-side session.
The browser receives an opaque 32-byte token in the `sg_session` cookie; only
its SHA-256 hash is stored in `customer_sessions`. The cookie is `HttpOnly`,
`SameSite=Lax`, `Path=/`, seven days, and `Secure` in production. Sign-out sets
`revoked_at`, so the same token cannot be replayed.

Every customer action is scoped by the session user: `/api/account/keys` lists,
creates, and revokes only that customer's keys; `/api/account/topup` creates a
checkout for that customer; the account page queries only that user's usage,
ledger, and top-ups. Mutations reject a foreign `Origin`.

The purchase path is deliberately one-way:

```text
POST /api/account/topup  ($5–$500, server-validated)
   │  insert pending top-up row
   ▼
Stripe Checkout (hosted; card data never reaches this app)
   │  success_url only navigates back — it grants nothing
   ▼
POST /api/webhooks/stripe  (raw body + stripe-signature)
   │  verify signature, require payment_status=paid
   │  match amount and currency to the stored top-up
   ▼
one transaction: mark paid, credit balance, write ledger row
```

`topups.provider_ref` is unique. A replay of a signed event finds the row
already paid and returns `200` without a second ledger entry. If Stripe is not
configured, checkout returns `503` and no synthetic credit path exists. The
success redirect is advisory only; the signed webhook is the sole credit path.

Local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET and restart
```

Email verification, password reset, and invoicing are not implemented. Those
are follow-ups, not claimed capabilities.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | Consumer key | OpenAI-compatible chat, streaming or JSON. |
| `GET` | `/v1/models` | Consumer key | Active catalog with `owned_by`, `family`, `group`, and sell prices. |
| `POST` | `/api/auth/signup` | Public, same-origin | Create a customer and session. |
| `POST` | `/api/auth/login` | Public, same-origin | Sign in; sets `sg_session`. |
| `POST` | `/api/auth/logout` | Session | Revoke the session and clear the cookie. |
| `GET` | `/api/auth/me` | Session | Current customer and account summary. |
| `GET` | `/api/account/keys` | Session | The signed-in customer's keys. |
| `POST` | `/api/account/keys` | Session, same-origin | Create a key; returns the secret once. |
| `DELETE` | `/api/account/keys/:id` | Session, same-origin | Revoke one key owned by the customer. |
| `POST` | `/api/account/topup` | Session, same-origin | Create a Stripe Checkout Session for $5–$500. |
| `POST` | `/api/webhooks/stripe` | Stripe signature | Idempotent paid-checkout fulfillment. |
| `POST` | `/api/admin/session` | Password | Sign in; sets the admin cookie. |
| `DELETE` | `/api/admin/session` | Same-origin | Sign out and bump the session epoch. |
| `GET` | `/api/admin/models` | Admin session | Full catalog, including disabled and delisted rows. |
| `PATCH` | `/api/admin/models` | Admin session | `{ id, status }` where status is `active` or `disabled`. |
| `GET` | `/api/admin/pricing` | Admin session | Catalog with cost, sell price, margin, and summary. |
| `PATCH` | `/api/admin/pricing` | Admin session | `{ id, inputPricePer1M, outputPricePer1M }`. |
| `POST` | `/api/admin/pricing` | Admin session | `{ markupBps, applyToAll }` bulk repricing. |
| `GET` | `/api/admin/credit` | Admin session | Tenant balance, holds, and recent ledger. |
| `POST` | `/api/admin/credit` | Admin session | `{ amountUsd, note }` operator credit grant. |
| `POST` | `/api/provider/sync` | Admin (loopback in dev) | Fetch balance, subscription, models, metadata. |
| `GET` | `/api/keys` | Admin (loopback in dev) | List masked local-tenant keys. |
| `POST` | `/api/keys` | Admin (loopback in dev) | Create a local-tenant key; returns the secret once. |
| `DELETE` | `/api/keys/:id` | Admin (loopback in dev) | Revoke a local-tenant key. |
| `GET` | `/api/models` | Admin (loopback in dev) | Active catalog for the operator console. |
| `GET` | `/api/usage` | Admin (loopback in dev) | Recent local-tenant usage. |

Consumer keys use either header:

```http
Authorization: Bearer sk-...
x-api-key: sk-...
```

## Project layout

```text
app/
  page.tsx                 public landing
  models/                  public full catalog
  signup/, login/          customer authentication
  account/                 customer balance, keys, usage, top-ups
  dashboard/               operator console
  admin/(panel)/           authenticated overview, customers, catalog,
                           pricing, analytics
  admin/login/             admin sign-in
  api/auth/                signup, login, logout, me
  api/account/             scoped keys and Stripe checkout
  api/webhooks/stripe/     signature-verified top-up fulfillment
  api/admin/               session, catalog, pricing, and credit management
  api/                     console actions (loopback or admin)
  v1/chat/completions/     OpenAI-compatible gateway
  v1/models/               OpenAI-compatible model list
components/
  landing/                 public landing sections
  catalog/                 public model table
  account/                 auth forms, customer header, keys, top-up, history
  dashboard/               console sections and shared UI primitives
  admin/                   admin shell, tables, pricing editor, analytics
  ui/                      shared primitives
lib/
  provider.ts              upstream client, metadata, catalog sync
  pricing.ts               pure micro-dollar, markup, margin, and estimate math
  gateway.ts               auth, routing, reservation, response handling
  gateway-stream.ts        streaming relay and settlement on close
  gateway-settle.ts        usage parsing, cost/charge, settlement
  api-keys.ts              key generation and SHA-256 hashing
  customer.ts              email, name, and password validation
  password.ts              scrypt hashing and constant-time verification
  customer-session.ts      opaque session tokens and cookie options
  customer-auth.ts         customer page/API guards and cookies
  stripe.ts                Stripe config, client, and redirect origin
  topup-amount.ts          exact $5–$500 amount parsing
  admin-session.ts         token signing, password and origin checks
  admin-auth.ts            server-only guards and cookie helpers
  admin-rate-limit.ts      fixed-window limiters
  db.ts                    SQLite schema and additive migrations
  store/                   persistence split by responsibility
  types.ts                 shared serializable types
assets/                    source logos and favicons
public/                    served brand assets and web manifest
tests/                     Node test-runner suites
scripts/                   quality and attribution gates
dev/                       FIDs, session summaries, single-agent protocol
templates/                 FID and session templates
coding-standards/          language standards referenced by the protocol
```

## Governance

This is a single-agent repository. The governing contract is
[dev/echo-v0.1.2-single-agent.md](dev/echo-v0.1.2-single-agent.md), reached
through [ECHO-single-agent.md](ECHO-single-agent.md); [ECHO.md](ECHO.md) is the
canonical harness reference. Non-trivial work follows a FID and the Perfection
Loop before code. FIDs live in `dev/fids/` and use
[templates/FID-TEMPLATE.md](templates/FID-TEMPLATE.md).

Current records:

- [FID-2026-1029-001](dev/fids/FID-2026-1029-001-nextjs-gateway-rebuild.md) —
  historical rebuild record, superseded by FID-002 for the current tree.
- [FID-2026-1029-002](dev/fids/archive/FID-2026-1029-002-savant-gateway-bootstrap.md) —
  identity, split, governance scaffold, and initial repository (closed against
  `bf3da9a`).
- [FID-2026-1029-003](dev/fids/archive/FID-2026-1029-003-landing-admin-and-protocol-port.md) —
  landing page, admin panel, and canonical protocol import (closed against
  `508d443`).
- [FID-2026-1029-004](dev/fids/archive/FID-2026-1029-004-full-catalog-pricing-analytics.md) —
  full catalog, sell-price math, credit settlement, public table, admin
  pricing, and analytics (closed against `2623912`).
- [FID-2026-1029-005](dev/fids/archive/FID-2026-1029-005-provider-family-group-semantics.md) —
  provider identity, model family, and price-group normalization (closed
  against `ecc15ac`).
- [FID-2026-1029-006](dev/fids/archive/FID-2026-1029-006-customer-accounts-and-credit-topups.md) —
  customer signup, account ownership, scoped keys and usage, Stripe Checkout
  top-ups, and webhook-confirmed credit (closed against `455ddb5`).

## Quality gates

```bash
npm run lint       # zero warnings
npm run typecheck  # tsc --noEmit
npm test           # node --test "tests/*.test.mjs"
npm run quality    # 400-line file ceiling
npm run build      # next build
npm run verify     # all of the above
```

The pre-push hook runs the attribution guard plus these gates and fails closed.
CI runs the same set on every push and pull request, and a separate workflow
rejects coding-agent attribution anywhere in the commit history.

### Verification

FID-2026-1029-006 records the current receipt: `npm run verify` exit 0 with 48
tests, quality PASS over 122 files, and a 32-route production build. On a
disposable database: two signups returned `201`, a duplicate returned `409`, a
wrong password returned `401`, the `sg_session` cookie is `HttpOnly`,
`SameSite=Lax`, `Secure`, seven days, customer B could not revoke customer A's
key (`404`), a foreign `Origin` returned `403`, each account saw only its own
usage, unconfigured top-ups returned `503`, a signed paid webhook credited
$25.00 exactly once, replay credited nothing, an unpaid session and an invalid
signature were ignored or rejected, logout made the old session `401`, and
`/admin/customers` showed both accounts. A production build also returned
`307` for signed-out `/dashboard` and `403` for a spoofed-Host operator API,
while an admin session restored both. FID-2026-1029-004 holds the pricing and
paid-routing receipt; FID-2026-1029-005 holds the provider/family/group
receipt.

A live Stripe card payment was not completed: no live Stripe keys were
available. The fulfillment path was exercised with a Stripe-signed test event
against a pending top-up on a disposable database. Real paid upstream
inference could not be completed because the provider account itself has no
paid balance. Those limitations are recorded in the FID rather than presented
as completed payments or completed paid-provider calls.

## Current limits

- Email verification and password reset are not implemented; there is no
  transactional email provider.
- A real Stripe card payment has not been run with live keys. Signed-webhook
  crediting is tested; hosted checkout creation requires operator keys and a
  public HTTPS origin.
- Subscription-tier rows are catalogued but only routable when the operator
  prices them and the upstream account is entitled to them.
- No per-key rate limiting or concurrency control. Signup, login, and top-up
  limits are in-memory fixed windows and reset on restart.
- One provider key and one shared provider pool.
- The local console tenant (`user_dev`) remains operator-granted and separate
  from customer accounts. Its loopback bypass is development-only; production
  requires an admin session.
- SQLite is local single-instance storage, not a multi-instance database.

## License

MIT — see [LICENSE](LICENSE).
