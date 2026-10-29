# Savant Gateway

A Next.js gateway that puts a clean product layer in front of an
OpenAI-compatible upstream provider.

[![ECHO](https://img.shields.io/badge/ECHO-v0.1.2_single--agent-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](dev/echo-v0.1.2-single-agent.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?style=flat-square&logo=nextdotjs&logoColor=%2300fbff)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v3-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](https://www.heroui.com/)
[![License](https://img.shields.io/badge/License-MIT-%23000000?style=flat-square)](LICENSE)

The gateway does four things:

- syncs the upstream balance, subscription, model catalog, and public metadata;
- mints local consumer keys, stored only as SHA-256 hashes;
- routes the free pool through an OpenAI-compatible
  `POST /v1/chat/completions` endpoint, streaming or JSON;
- records weighted usage in SQLite, including the provider's free-pool units.

## Surfaces

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page with live catalog counts and a request sample. |
| `/dashboard` | Local console | Operator view: provider, catalog, keys, tester, usage. |
| `/admin` | Admin session | Provider sync, model enable/disable, key management, usage. |
| `/v1/*` | Consumer key | The OpenAI-compatible gateway. |

The console's `/api/*` actions accept a loopback request or a valid admin
session. The admin panel is independent of the `Host` header check, but the
loopback bypass itself is still a development convenience, not a public
security boundary. Deploying the console publicly requires replacing it.
See [SECURITY.md](SECURITY.md).

## Stack

- **Next.js 16** App Router and route handlers
- **HeroUI v3** with Tailwind CSS 4
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

Open `http://localhost:3000` for the landing page, `/dashboard` for the console,
and `/admin` for the password-protected panel.

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

## How it works

```text
browser / SDK
   │  Authorization: Bearer sk-…
   ▼
POST /v1/chat/completions
   │  hash key → active key + active user
   │  resolve model → active + free-pool check
   ▼
upstream /v1/chat/completions
   │  Authorization: Bearer <PROVIDER_KEY>
   │  src: gate
   ▼
stream or JSON back to the caller
   │
   ▼
usage_events: raw tokens, weighted tokens, cost, latency, status
```

The landing page, console, and admin panel read the same SQLite state. The
landing data function deliberately returns only provider state, active counts,
and the free-model list — never keys or usage rows.

### Model access rule

The upstream public metadata sets `allowFree` on paid models too, but those
models still return `402 Insufficient balance` on a zero-balance account. The
gateway therefore treats **only `free/*` models with `allowFree !== false`** as
free. Everything else is catalogued as `paid` or `subscription` and rejected
locally before an upstream call.

Free-pool usage is weighted. For example, `free/gpt-6-luna` has weight `3`, so
316 raw tokens consume 948 units of the provider's weighted pool. The dashboard
shows both raw and weighted counts.

Admins can disable a model. Disabled models are excluded from the public
catalog and the gateway, and the state survives a provider sync.

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
| `GET` | `/v1/models` | Consumer key | Catalog visible to the key holder. |
| `POST` | `/api/admin/session` | Password | Sign in; sets the admin cookie. |
| `DELETE` | `/api/admin/session` | Same-origin | Sign out and bump the session epoch. |
| `GET` | `/api/admin/models` | Admin session | Full catalog, including disabled rows. |
| `PATCH` | `/api/admin/models` | Admin session | `{ id, status }` where status is `active` or `disabled`. |
| `POST` | `/api/provider/sync` | Loopback or admin | Fetch balance, subscription, models, metadata. |
| `GET` | `/api/keys` | Loopback or admin | List masked keys. |
| `POST` | `/api/keys` | Loopback or admin | Create a key; returns the secret once. |
| `DELETE` | `/api/keys/:id` | Loopback or admin | Revoke a key. |
| `GET` | `/api/models` | Loopback or admin | Active catalog for the console. |
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
  dashboard/               operator console
  admin/                   admin sign-in and panel
  api/admin/               session and admin-only management
  api/                     console actions (loopback or admin)
  v1/chat/completions/     OpenAI-compatible gateway
  v1/models/               OpenAI-compatible model list
components/
  landing/                 public landing sections
  dashboard/               console sections and primitives
  admin/                   admin sections and login
  navbar.tsx               console header
  provider-sync.tsx        shared sync control
lib/
  provider.ts              upstream client, metadata, catalog sync
  api-keys.ts              key generation and SHA-256 hashing
  admin-session.ts         token signing, password and origin checks
  admin-auth.ts            server-only guards and cookie helpers
  admin-rate-limit.ts      fixed-window login limiter
  db.ts                    SQLite schema and connection
  gateway.ts               auth, model routing, streaming, metering
  http.ts                  CORS, API-key extraction, loopback check
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
  historical rebuild record, verified but not closed (no commit existed when it
  was authored; superseded by FID-002 for the current tree).
- [FID-2026-1029-002](dev/fids/archive/FID-2026-1029-002-savant-gateway-bootstrap.md) —
  identity, split, governance scaffold, and initial repository (closed against
  `bf3da9a`).
- [FID-2026-1029-003](dev/fids/FID-2026-1029-003-landing-admin-and-protocol-port.md) —
  landing page, admin panel, and canonical protocol import.

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

Current tree: `npm run verify` passes. The live HTTP receipt for the landing,
admin login, model toggle (including status preservation across a provider
sync), key creation/revocation, cross-origin rejection, logout revocation, and
login limiting is recorded in FID-2026-1029-003 and
[SCOPE.md](SCOPE.md). Provider inference itself was last exercised before this
change; those historical results remain historical.

## Current limits

- No customer sign-in or account ownership; one local developer tenant.
- No billing, top-ups, subscriptions, or paid-model access.
- No per-key rate limiting or concurrency control.
- One provider key and one shared free pool.
- The console's loopback bypass is not a public security boundary.
- The admin rate limiter is in-memory and resets on restart; the session epoch
  is durable.
- SQLite is local development storage, not a multi-instance database.

## License

MIT — see [LICENSE](LICENSE).
