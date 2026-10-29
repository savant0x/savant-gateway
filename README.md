# Savant Gateway

A Next.js gateway that puts a clean, priced product layer in front of an
OpenAI-compatible upstream provider.

[![ECHO](https://img.shields.io/badge/ECHO-v0.1.2_single--agent-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](dev/echo-v0.1.2-single-agent.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?style=flat-square&logo=nextdotjs&logoColor=%2300fbff)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v3-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](https://www.heroui.com/)
[![License](https://img.shields.io/badge/License-MIT-%23000000?style=flat-square)](LICENSE)

The gateway does six things:

- syncs the upstream balance, subscription, model catalog, and public metadata;
- stores upstream cost, our sell price, and charged revenue as separate fields;
- mints local consumer keys, stored only as SHA-256 hashes;
- routes every active catalog model through one OpenAI-compatible
  `POST /v1/chat/completions` endpoint once it is free or priced, streaming or
  JSON;
- reserves credit for paid calls, settles actual usage, and keeps a ledger;
- records weighted tokens, revenue, cost, latency, and status in SQLite.

## Surfaces

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page with live catalog counts and a request sample. |
| `/models` | Public | Searchable, sortable, paginated full catalog with sell prices. |
| `/dashboard` | Local console | Operator view: provider, catalog, keys, tester, usage. |
| `/admin` | Admin session | Revenue, cost, margin, credit, provider status, recent usage. |
| `/admin/catalog` | Admin session | Every row, including disabled and delisted models. |
| `/admin/pricing` | Admin session | Inline sell prices, markup, cost, margin, blended profit. |
| `/admin/analytics` | Admin session | 7/30/90-day revenue, cost, margin, tokens, latency, top models. |
| `/v1/*` | Consumer key | The OpenAI-compatible gateway. |

The admin panel is independent of the `Host` header check. The console's
`/api/*` actions accept a loopback request or a valid admin session; the
loopback bypass is a development convenience, not a public security boundary.
Deploying the console publicly requires replacing it. See
[SECURITY.md](SECURITY.md).

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
npm run dev
```

Open `http://localhost:3000` for the landing page, `/models` for the public
catalog, `/dashboard` for the console, and `/admin` for the password-protected
panel. Sync the provider from the console or admin overview before using the
catalog.

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
| `ADMIN_SESSION_SECRET` | For admin | 32+ characters. Signs the eight-hour session cookie. |
| `DB_PATH` | No | SQLite file. Defaults to `./data/gateway.db`. |
| `PROVIDER_BASE_URL` | No | Defaults to `https://api.apinex.bond/v1`. |
| `PROVIDER_PUBLIC_MODELS_URL` | No | Defaults to `https://apinex.bond/api/public/models`. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical origin for metadata. Defaults to `http://localhost:3000`. |

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

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | Consumer key | OpenAI-compatible chat, streaming or JSON. |
| `GET` | `/v1/models` | Consumer key | Active catalog with `owned_by`, `family`, `group`, and sell prices. |
| `POST` | `/api/admin/session` | Password | Sign in; sets the admin cookie. |
| `DELETE` | `/api/admin/session` | Same-origin | Sign out and bump the session epoch. |
| `GET` | `/api/admin/models` | Admin session | Full catalog, including disabled and delisted rows. |
| `PATCH` | `/api/admin/models` | Admin session | `{ id, status }` where status is `active` or `disabled`. |
| `GET` | `/api/admin/pricing` | Admin session | Catalog with cost, sell price, margin, and summary. |
| `PATCH` | `/api/admin/pricing` | Admin session | `{ id, inputPricePer1M, outputPricePer1M }`. |
| `POST` | `/api/admin/pricing` | Admin session | `{ markupBps, applyToAll }` bulk repricing. |
| `GET` | `/api/admin/credit` | Admin session | Tenant balance, holds, and recent ledger. |
| `POST` | `/api/admin/credit` | Admin session | `{ amountUsd, note }` operator credit grant. |
| `POST` | `/api/provider/sync` | Loopback or admin | Fetch balance, subscription, models, metadata. |
| `GET` | `/api/keys` | Loopback or admin | List masked keys. |
| `POST` | `/api/keys` | Loopback or admin | Create a key; returns the secret once. |
| `DELETE` | `/api/keys/:id` | Loopback or admin | Revoke a key. |
| `GET` | `/api/models` | Loopback or admin | Active public catalog for the console. |
| `GET` | `/api/usage` | Loopback or admin | Recent usage rows. |

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
  dashboard/               operator console
  admin/(panel)/           authenticated overview, catalog, pricing, analytics
  admin/login/             admin sign-in
  api/admin/               session, catalog, pricing, and credit management
  api/                     console actions (loopback or admin)
  v1/chat/completions/     OpenAI-compatible gateway
  v1/models/               OpenAI-compatible model list
components/
  landing/                 public landing sections
  catalog/                 public model table
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
  admin-session.ts         token signing, password and origin checks
  admin-auth.ts            server-only guards and cookie helpers
  admin-rate-limit.ts      fixed-window login limiter
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

FID-2026-1029-004 records the current receipt: `npm run verify` exit 0 with 26
tests, quality PASS over 91 files, and a 20-route production build. Live
production smoke on that tree: `/models` and the admin pages return `200`,
unauthenticated `/admin` returns `307` to login, `/api/models` returns 45
public rows with no cost fields, `/api/admin/pricing` reports the manual
`gpt-6.1-sol` row at cost `$0.30` / sell `$0.40` / 25% input margin, a
foreign-origin PATCH returns `403`, and a provider sync preserves a manual
price and a disabled model.

The paid money path was exercised on a disposable database: actual usage
settled above the hold, streaming settled with no hold left behind, an unpriced
row returned `503`, an over-limit output budget returned `400`, and an
underfunded overrun left a negative balance that blocked the next call with
`402`. Provider inference for free models was verified live earlier; real paid
upstream inference could not be completed because the provider account itself
has no paid balance. That limitation is recorded in the FID rather than
presented as a completed paid-provider call.

## Current limits

- One local tenant (`user_dev`); no customer signup, account ownership, or
  checkout.
- Credits are operator-granted; there is no top-up or payment integration.
- Subscription-tier rows are catalogued but only routable when the operator
  prices them and the upstream account is entitled to them.
- No per-key rate limiting or concurrency control.
- One provider key and one shared provider pool.
- The console's loopback bypass is not a public security boundary.
- The admin rate limiter is in-memory and resets on restart; the session epoch
  is durable.
- SQLite is local single-instance storage, not a multi-instance database.

## License

MIT — see [LICENSE](LICENSE).
