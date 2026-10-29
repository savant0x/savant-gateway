# Savant Gateway

A Next.js gateway that puts a clean, priced product layer in front of one or
more upstream providers, whether they speak OpenAI Chat Completions or
Anthropic Messages.

[![ECHO](https://img.shields.io/badge/ECHO-v0.1.2_single--agent-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](dev/echo-v0.1.2-single-agent.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?style=flat-square&logo=nextdotjs&logoColor=%2300fbff)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v3-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](https://www.heroui.com/)
[![License](https://img.shields.io/badge/License-MIT-%23000000?style=flat-square)](LICENSE)

The gateway does eight things:

- syncs each provider's balance, subscription, model catalog, and public
  metadata without letting one sync hide another provider's models;
- stores upstream cost, our sell price, and charged revenue as separate fields;
- creates customer accounts with scrypt password hashes and revocable,
  server-side sessions;
- mints account-owned consumer keys, stored only as SHA-256 hashes;
- routes every active catalog model through one OpenAI-compatible
  `POST /v1/chat/completions` endpoint once it is free or priced, streaming or
  JSON, translating to each provider's wire protocol;
- reserves credit for paid calls, settles actual usage, and keeps a ledger;
- sells prepaid credit through Stripe Checkout, credits it only from a
  signature-verified webhook, and records weighted tokens, revenue, cost,
  latency, and status in SQLite;
- sells subscription plans with a snapshotted model entitlement, metered
  weighted-token allowance, and an explicit block-or-credit overage policy,
  reconciled from signed Stripe recurring-invoice events.

## Surfaces

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page with live catalog counts and a request sample. |
| `/models` | Public | Searchable, sortable, paginated full catalog with sell prices. |
| `/docs` | Public | API reference: auth, model payload, provider/family/group, chat, errors. |
| `/plans` | Public | Active subscription plans, included models, allowance, and overage policy. |
| `/signup` | Public | Create a customer account. |
| `/login` | Public | Customer sign-in. |
| `/account` | Customer session | Balance, plan, top-ups, keys, usage, ledger, and quick start. |
| `/dashboard` | Operator console | Provider, catalog, local-tenant keys, tester, usage. |
| `/admin` | Admin session | Revenue, cost, margin, credit, provider status, recent usage. |
| `/admin/customers` | Admin session | Signup accounts, balances, request volume, and top-ups. |
| `/admin/catalog` | Admin session | Every row, including disabled and delisted models; move a model between groups. |
| `/admin/groups` | Admin session | Create, rename, reprice, and delete custom groups; system groups are protected. |
| `/admin/plans` | Admin session | Author plans, included groups/models, prices, allowances, overage, and status. |
| `/admin/subscriptions` | Admin session | Subscribers, usage, invoices, grants, extend, revoke, sync, and entitlement refresh. |
| `/admin/providers` | Admin session | Upstream registry: credentials variable names, capabilities, enable, test, sync. |
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
# put the upstream key in PROVIDER_KEY; COMMANDCODE_API_KEY is optional
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
| `PROVIDER_KEY` | Yes | Default upstream key. Server-only. |
| `COMMANDCODE_API_KEY` | For CommandCode | Second upstream key. The registry stores only the variable name. Server-only. |
| `ADMIN_PASSWORD` | For admin | 12+ characters. Compared in constant time. |
| `ADMIN_SESSION_SECRET` | For admin | 32+ characters. Signs the eight-hour admin cookie. |
| `STRIPE_SECRET_KEY` | For billing | Server-only Stripe key. Absent disables top-up and subscription checkout with `503`. |
| `STRIPE_WEBHOOK_SECRET` | For billing | Signing secret for `/api/webhooks/stripe`; verifies top-ups, subscriptions, and invoices. Checkout stays disabled without it. |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical origin for metadata and Stripe redirects. Defaults to `http://localhost:3000`. |
| `DB_PATH` | No | SQLite file. Defaults to `./data/gateway.db`. |
| `PROVIDER_BASE_URL` | No | Seeds the default provider's base URL on first boot. Defaults to `https://api.apinex.bond/v1`. |
| `PROVIDER_PUBLIC_MODELS_URL` | No | Defaults to `https://apinex.bond/api/public/models`. |

Do not put any secret in a `NEXT_PUBLIC_*` variable.

## Catalog vocabulary

These three words mean different things and must not be collapsed:

- **Provider** — an upstream account registered in Admin → Providers. The
  public owner is always Savant Gateway (`owned_by: "savant-gateway"`);
  upstream identity is internal routing metadata.
- **Family** — the upstream model line: GPT, Claude, DeepSeek, Gemini, GLM,
  Kimi, Grok, and so on. It is the `family` field; the internal
  `models.provider` column stores this family label.
- **Group** — a first-class billing tier with a stable slug, an editable
  label, a billing mode (`free`, `paid`, or `subscription`), and ordered model
  membership. The UI and `access` field expose the billing mode;
  `/v1/models` keeps `group` as that compatible field and adds `group_slug`,
  `group_label`, and `group_billing_mode`.

Groups are operator data, not a derived label. The three system groups
(`free`, `paid`, `subscription`) keep their slugs and billing modes; their
labels and order are editable. Custom groups can use any billing mode and can
be deleted only after an explicit reassignment. A manual assignment survives a
provider sync; rows without one follow the provider-derived default.

### Provider registry

A provider is a row, not an environment triple. Admin → Providers stores the
slug, label, wire protocol (`openai`, `anthropic`, or `both`), base URL,
credential **variable name**, static headers, capability flags, enabled flag,
and runtime status. The credential value never enters SQLite, an API response,
a log, or the browser.

- Sync is scoped: rows are keyed by `(upstream_slug, upstream_id)`, and a sync
  only marks that provider's vanished models `in_catalog = 0`.
- Identity is scoped: the default provider keeps raw model ids; other providers
  publish `{slug}/{upstream_id}`. `/v1/models` still says
  `owned_by: "savant-gateway"`.
- Protocol is chosen per model. A `both` provider uses the model's
  `supported_endpoints` (Claude → `messages`, OpenAI-style → `chat`); models
  with no servable endpoint are not catalogued.
- Paid rows without a known upstream cost are `cost_source = 'unknown'` and
  cannot be enabled until an operator enters both costs. Manual costs survive
  every sync.
- Disabling a provider hides its models from the public catalog and returns
  `503 model_unavailable` for calls, without deleting rows.

## How it works

```text
browser / SDK
   │  Authorization: Bearer sk-…
   ▼
POST /v1/chat/completions
   │  hash key → active key + active user
   │  resolve model → provider + protocol + active + in catalog
   │  past-due plan? → 402 before any billing path
   │  model covered by the active plan snapshot?
   │     yes → allowance fits → reserve subscription hold
   │           exhausted → block (402) or credit overage (hold + markup)
   │     no  → free pool? yes → allowance + provider floor
   │                      no  → priced? → reserve credit hold
   ▼
upstream (the model's provider)
   │  openai kind:    POST /chat/completions, Bearer <key variable>
   │  anthropic kind: POST /messages, x-api-key <key variable>
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

The assigned group's **billing mode** decides routing and charging. Provider
flags only choose the default group for a new or auto-owned row: weighted
`free/` rows default to `free`, other `free/` rows to `subscription`, and the
rest to `paid`.

- **Free** = the model is in a group whose billing mode is `free`. Both sell
  prices are forced to zero, no credit hold is taken, and the call is metered
  in the provider's weighted units when a weight is present (weight 1 when it
  is not). Free calls pass admission first: a per-user daily weighted
  allowance, the effective provider remaining, and `subscription.allowed`. A
  refusal is `429` with `Retry-After`; limits are the `FREE_*` variables in
  `.env.example`.
- **Subscription** = a plan-gated tier. A row is routable only when an active
  plan snapshot includes its model id. Included usage reserves weighted tokens
  against the open plan period and does not touch credit. An exhausted
  allowance either blocks (`402 subscription_limit_reached`) or bills overage
  from credit at the list price plus the plan markup. With no covering plan,
  the call returns `403 subscription_required`.
- **Paid** = a credit-billed group. It is routable once at least one sell price
  is non-zero and the tenant has available credit.

A zero-cost model can therefore be charged: move it from a free group to a
paid or subscription group, then set its sell price on Admin → Pricing. Moving
back to a free group zeroes both prices again; moving out leaves them at zero
until the operator sets a price.

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
`manual`. Rows in a free group are always zero, including a zero-cost row moved
there; move the row to another group to charge for it.

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

Email verification and password reset are not implemented. Those are
follow-ups, not claimed capabilities.

## Subscriptions

A plan is operator-authored: name, immutable slug, price, monthly/yearly
interval, included weighted-token allowance, overage policy (`block` or
`credit` plus markup), groups, and optional individual models. A plan must
include at least one catalog model before it can be active. Free groups cannot
be included because those calls are already free.

A subscription is a **snapshot**, not a live pointer. At activation the row
stores the plan name, price, interval, allowance, overage policy, and the exact
model ids the customer is entitled to. Editing the plan later changes future
checkouts; it does not rewrite an existing purchase. An explicit **Refresh**
action on Admin → Subscriptions replaces only that subscription's model ids
from the current plan.

```text
POST /api/account/subscription
   │  one active/past-due subscription max
   │  create local incomplete row + purchased snapshot
   ▼
Stripe Checkout (mode=subscription, hosted card page)
   │  success_url grants nothing
   ▼
checkout.session.completed → attach Stripe customer/subscription ids
invoice.paid               → record invoice, activate, open allowance period
invoice.payment_failed     → past_due; included calls return 402
customer.subscription.*    → reconcile status, period end, cancel flag
```

Every webhook event is claimed in `billing_events` by Stripe event id. A replay
returns `{ replay: true }` without re-crediting, re-opening a period, or
extending access. A failed invoice retried and later paid updates the same
invoice row and activates once.

Included usage records `billing_source = 'subscription'`, zero charge, the
actual `included_weighted_tokens`, and the subscription/period ids. Calls past
the allowance under `credit` record `billing_source = 'credit'` and the normal
settled charge; under `block` they never reach the provider. Cancel is at
period end for customers, immediate for an admin revocation. Manual grants are
one-period, do not auto-renew, and can be extended, refreshed, or revoked in
the admin panel.

Real Stripe Checkout, a Stripe-delivered recurring invoice, and a live paid
subscription are not part of the local receipt because no funded Stripe test
account is configured. This is recorded as a limitation, not as verified
recurring billing.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | Consumer key | OpenAI-compatible chat, streaming or JSON. |
| `GET` | `/v1/models` | Consumer key | Active catalog with `owned_by`, `family`, billing `group`, group slug/label, and sell prices. |
| `POST` | `/api/auth/signup` | Public, same-origin | Create a customer and session. |
| `POST` | `/api/auth/login` | Public, same-origin | Sign in; sets `sg_session`. |
| `POST` | `/api/auth/logout` | Session | Revoke the session and clear the cookie. |
| `GET` | `/api/auth/me` | Session | Current customer and account summary. |
| `GET` | `/api/account/keys` | Session | The signed-in customer's keys. |
| `POST` | `/api/account/keys` | Session, same-origin | Create a key; returns the secret once. |
| `DELETE` | `/api/account/keys/:id` | Session, same-origin | Revoke one key owned by the customer. |
| `POST` | `/api/account/topup` | Session, same-origin | Create a Stripe Checkout Session for $5–$500. |
| `GET` | `/api/plans` | Public | Active plans with price, interval, allowance, groups, and model count. |
| `GET` | `/api/account/subscription` | Session | Current or last subscription, allowance, entitlement count, and invoices. |
| `POST` | `/api/account/subscription` | Session, same-origin | `{ planSlug }`; creates a Stripe subscription checkout. |
| `POST` | `/api/account/subscription/cancel` | Session, same-origin | Schedule cancellation at period end. |
| `POST` | `/api/account/subscription/resume` | Session, same-origin | Clear a pending cancellation. |
| `POST` | `/api/account/subscription/portal` | Session, same-origin | Return a Stripe Billing Portal URL. |
| `POST` | `/api/webhooks/stripe` | Stripe signature | Idempotent top-up, subscription, and invoice reconciliation. |
| `POST` | `/api/admin/session` | Password | Sign in; sets the admin cookie. |
| `DELETE` | `/api/admin/session` | Same-origin | Sign out and bump the session epoch. |
| `GET` | `/api/admin/models` | Admin session | Full catalog, including disabled and delisted rows. |
| `PATCH` | `/api/admin/models` | Admin session | `{ id, status?, groupSlug?, costInputPer1M?, costOutputPer1M? }`. |
| `GET` | `/api/admin/groups` | Admin session | Groups with billing mode, system flag, order, and model count. |
| `POST` | `/api/admin/groups` | Admin session | `{ slug, label, billingMode, description?, sortOrder? }`. |
| `PATCH` | `/api/admin/groups` | Admin session | `{ slug, label, billingMode, description?, sortOrder? }`; system billing modes are fixed. |
| `DELETE` | `/api/admin/groups` | Admin session | `{ slug, reassignTo }`; system groups and the same-group destination are rejected. |
| `GET` | `/api/admin/plans` | Admin session | All plans with inclusions, counts, and subscribers. |
| `POST` | `/api/admin/plans` | Admin session | Create a draft, active, or archived plan with groups/models. |
| `PATCH` | `/api/admin/plans` | Admin session | Edit plan values, status, and inclusions; slug is immutable. |
| `DELETE` | `/api/admin/plans` | Admin session | Delete an unused draft/archived plan; otherwise `409 plan_in_use`. |
| `GET` | `/api/admin/subscriptions` | Admin session | Subscribers with snapshot, status, usage, invoices, and entitlements. |
| `POST` | `/api/admin/subscriptions` | Admin session | `grant`, `extend`, `revoke`, `sync`, or `refresh_entitlements`. |
| `GET` | `/api/admin/pricing` | Admin session | Catalog with cost, sell price, margin, and summary. |
| `PATCH` | `/api/admin/pricing` | Admin session | `{ id, inputPricePer1M, outputPricePer1M }`. |
| `POST` | `/api/admin/pricing` | Admin session | `{ markupBps, applyToAll }` bulk repricing. |
| `GET` | `/api/admin/credit` | Admin session | Tenant balance, holds, and recent ledger. |
| `POST` | `/api/admin/credit` | Admin session | `{ amountUsd, note, userId? }` operator credit grant; `userId` targets a customer. |
| `GET` | `/api/admin/providers` | Admin session | Providers with status, capabilities, and model counts. |
| `POST` | `/api/admin/providers` | Admin session | Register a provider; accepts a credential variable name, never a secret. |
| `PATCH` | `/api/admin/providers/:slug` | Admin session | Label, URL, headers, capabilities, enabled, sort order. |
| `DELETE` | `/api/admin/providers/:slug` | Admin session | Remove a provider that owns no catalog rows. |
| `POST` | `/api/admin/providers/:slug/test` | Admin session | Credential and `/models` probe. |
| `POST` | `/api/admin/providers/:slug/sync` | Admin session | Sync one provider. |
| `POST` | `/api/admin/providers/sync` | Admin session | Sync every enabled provider. |
| `POST` | `/api/provider/sync` | Admin (loopback in dev) | Legacy alias for syncing every enabled provider. |
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
  plans/                   public subscription plans
  signup/, login/          customer authentication
  account/                 customer balance, plan, keys, usage, top-ups
  dashboard/               operator console
  admin/(panel)/           authenticated overview, customers, catalog, groups,
                           plans, subscriptions, providers, pricing, analytics
  admin/login/             admin sign-in
  api/auth/                signup, login, logout, me
  api/account/             scoped keys, top-ups, and subscription lifecycle
  api/plans/               public active-plan listing
  api/webhooks/stripe/     signature-verified billing reconciliation
  api/admin/               session, catalog, groups, plans, subscriptions,
                           providers, pricing, credit
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
  providers/               registry, scoped sync, OpenAI and Anthropic adapters
  model-groups.ts          pure group validation, defaults, and price rules
  plans.ts                 pure plan validation, entitlements, allowance, overage
  plan-lifecycle.ts        calendar periods and Stripe status mapping
  schema/                  provider, group, and subscription schema
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
  stripe-subscriptions.ts   Stripe customer, plan checkout, portal, period sync
  topup-amount.ts          exact $5–$500 amount parsing
  admin-session.ts         token signing, password and origin checks
  admin-auth.ts            server-only guards and cookie helpers
  admin-rate-limit.ts      fixed-window limiters
  db.ts                    SQLite bootstrap and additive migrations
  store/                   persistence split by responsibility, including groups
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

- [FID-2026-1029-008](dev/fids/archive/FID-2026-1029-008-subscription-plans-and-entitlements.md) —
  closed customer subscriptions: priced plans, included groups and models,
  entitlement snapshots, weighted-token allowances, recurring Stripe
  lifecycle, overage policy, and admin/customer controls (closed against
  `a945789`).
- [FID-2026-1029-010](dev/fids/archive/FID-2026-1029-010-multi-provider-registry.md) —
  closed provider registry: per-provider credentials, scoped sync and model
  identity, OpenAI and Anthropic adapters, manual cost mapping,
  provider-scoped free pool, and admin controls (closed against `957430c`).
- [FID-2026-1029-007](dev/fids/archive/FID-2026-1029-007-model-group-control.md) —
  closed first-class model groups: custom groups, operator assignment,
  sync-safe membership, group-aware billing and pricing, and a Groups admin
  surface (closed against `161ddcc`).
- [FID-2026-1029-001](dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md) —
  historical rebuild record, closed against `bf3da9a`; the current tree was
  established by FID-002.
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

Audit report: [D1–D50 audit report](dev/audits/2026-10-29-d1-d50-audit-report.md)
— the fifty legacy findings with severity, current status, evidence, and a
remediation index.

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

FID-2026-1029-006 records its 2026-10-29 closure receipt: `npm run verify` exit
0 with 48 tests, quality PASS over 122 files, and a 32-route production build at
that time. The current tree builds 51 routes, runs 99 tests, and scans 185
files. On a
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
receipt; FID-2026-1029-010 holds the multi-provider registry receipt, including
the additive migration on a disposable database. FID-2026-1029-008 holds the
subscription receipt: active-plan CRUD, draft exclusion, a zero-charge included
call, snapshot stability across a plan edit, explicit refresh, 403 for an
uncovered plan-only model, 402 for an exhausted block plan, 9-micro credit
overage with markup, duplicate-checkout and deletion conflicts, foreign-origin
rejection, manual extend/revoke, one signed-invoice activation with a replay
no-op, and a signed top-up credited once. Live CommandCode inference is not run
because no second-upstream credential is configured.

A live Stripe card payment was not completed: no live Stripe keys were
available. The fulfillment path was exercised with a Stripe-signed test event
against a pending top-up on a disposable database. Real paid upstream
inference could not be completed because the provider account itself has no
paid balance. Those limitations are recorded in the FID rather than presented
as completed payments or completed paid-provider calls.

## Current limits

- Email verification and password reset are not implemented; there is no
  transactional email provider.
- A real Stripe card payment, a real subscription checkout, and a
  Stripe-delivered recurring invoice have not been run with funded keys.
  Signed-webhook crediting and activation are tested locally; hosted checkout
  and recurring delivery require operator keys and a public HTTPS origin.
- Subscription access is one plan per customer. There is no stacking, proration,
  tax calculation, refund automation, or dunning policy beyond what Stripe
  itself performs. An admin can revoke access, but a refund stays a Stripe
  dashboard operation.
- No per-key rate limiting or concurrency control. Signup, login, and top-up
  limits are in-memory fixed windows and reset on restart.
- No automatic failover or load balancing: each model has one provider, and
  a failed provider fails its own models.
- CommandCode does not publish machine-readable pricing, so its costs are
  operator-entered; free-pool admission still enforces each provider's own
  remaining figure and the global per-user daily allowance.
- The local console tenant (`user_dev`) remains operator-granted and separate
  from customer accounts. Its loopback bypass is development-only; production
  requires an admin session.
- SQLite is local single-instance storage, not a multi-instance database.

## License

MIT — see [LICENSE](LICENSE).
