# Savant Gateway

A Next.js gateway that puts a clean product layer in front of an
OpenAI-compatible upstream provider.

[![ECHO](https://img.shields.io/badge/ECHO-v0.2.0-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](ECHO.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?style=flat-square&logo=nextdotjs&logoColor=%2300fbff)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v3-%23000000?style=flat-square&logo=github&logoColor=%2300fbff)](https://www.heroui.com/)
[![License](https://img.shields.io/badge/License-MIT-%23000000?style=flat-square)](LICENSE)

The gateway does four things:

- syncs the upstream balance, subscription, model catalog, and public metadata;
- mints local consumer keys, stored only as SHA-256 hashes;
- routes the free pool through an OpenAI-compatible
  `POST /v1/chat/completions` endpoint, streaming or JSON;
- records weighted usage in SQLite, including the provider's free-pool units.

## Status

Local development. There is no customer authentication, billing, rate limiting,
or multi-key provider pool yet. The dashboard write endpoints are guarded by a
`Host` header check that is suitable for localhost only, not for public
exposure. See [SECURITY.md](SECURITY.md).

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
npm run dev
```

Open `http://localhost:3000`, press **Sync provider**, then create a consumer
key. The provider key stays on the server and is never sent to the browser.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `PROVIDER_KEY` | Yes | Upstream key. Sent as `Authorization: Bearer …`. Server-only. |
| `DB_PATH` | No | SQLite file. Defaults to `./data/gateway.db`. |
| `PROVIDER_BASE_URL` | No | Defaults to `https://api.apinex.bond/v1`. |
| `PROVIDER_PUBLIC_MODELS_URL` | No | Defaults to `https://apinex.bond/api/public/models`. |

Do not put `PROVIDER_KEY` in a `NEXT_PUBLIC_*` variable. `.env.local` is ignored
by Git.

## How it works

```text
browser / SDK
   │  Authorization: Bearer sk-…
   ▼
POST /v1/chat/completions
   │  hash key → active key + active user
   │  resolve model → free-pool check
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

The dashboard reads the same SQLite state: provider status, catalog, keys,
and recent usage.

### Model access rule

The upstream public metadata sets `allowFree` on paid models too, but those
models still return `402 Insufficient balance` on a zero-balance account. The
gateway therefore treats **only `free/*` models with `allowFree !== false`** as
free. Everything else is catalogued as `paid` or `subscription` and rejected
locally before an upstream call.

Free-pool usage is weighted. For example, `free/gpt-6-luna` has weight `3`, so
316 raw tokens consume 948 units of the provider's weighted pool. The dashboard
shows both raw and weighted counts.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | Consumer key | OpenAI-compatible chat, streaming or JSON. |
| `GET` | `/v1/models` | Consumer key | Catalog visible to the key holder. |
| `POST` | `/api/provider/sync` | Localhost only | Fetch balance, subscription, models, metadata. |
| `GET` | `/api/keys` | Localhost only | List masked keys. |
| `POST` | `/api/keys` | Localhost only | Create a key; returns the secret once. |
| `DELETE` | `/api/keys/:id` | Localhost only | Revoke a key. |
| `GET` | `/api/models` | Localhost only | Full catalog for the dashboard. |
| `GET` | `/api/usage` | Localhost only | Recent usage rows. |

Consumer keys use either header:

```http
Authorization: Bearer sk-...
x-api-key: sk-...
```

## Project layout

```text
app/
  api/                     local dashboard actions
  v1/chat/completions/     OpenAI-compatible gateway
  v1/models/               OpenAI-compatible model list
  page.tsx                 dashboard
components/
  dashboard/               dashboard sections and primitives
  navbar.tsx
  theme-toggle.tsx
lib/
  provider.ts              upstream client, metadata, catalog sync
  api-keys.ts              key generation and SHA-256 hashing
  db.ts                    SQLite schema and connection
  gateway.ts               auth, model routing, streaming, metering
  http.ts                  CORS, API-key extraction, local-host guard
  store/                   persistence split by responsibility
  types.ts                 shared serializable types
tests/                     Node test-runner suites
scripts/                   quality and attribution gates
dev/fids/                  FID records
templates/                 FID and session templates
```

## Governance

All non-trivial work follows [ECHO Protocol v0.2.0](ECHO.md) and the
[agent contract](AGENTS.md). FIDs live in `dev/fids/` and follow
[templates/FID-TEMPLATE.md](templates/FID-TEMPLATE.md). The current records are:

- [FID-2026-1029-001](dev/fids/FID-2026-1029-001-nextjs-gateway-rebuild.md) —
  historical rebuild record, verified but not closed (no commit existed when it
  was authored; it is superseded by FID-002 for the current tree).
- [FID-2026-1029-002](dev/fids/archive/FID-2026-1029-002-savant-gateway-bootstrap.md) —
  Savant Gateway identity, split, governance scaffold, and initial repository
  (closed against commit `bf3da9a`).

## Quality gates

```bash
npm run lint       # zero warnings
npm run typecheck  # tsc --noEmit
npm test           # node --test tests/
npm run quality    # 400-line file ceiling
npm run build      # next build
npm run verify     # all of the above
```

The pre-push hook runs the attribution guard plus these gates and fails closed.
CI runs the same set on every push and pull request, and a separate workflow
rejects coding-agent attribution anywhere in the commit history.

### Verification

Current tree: `npm run verify` passes; the live provider path was last
exercised on 2026-10-29 (45 models, 11 free-pool, non-streaming and streaming
`200`, missing/fake key `401`, paid model `402` locally). Those are historical
results recorded in [SCOPE.md](SCOPE.md); they are not re-run in CI.

## Current limits

- No customer sign-in or account ownership.
- No billing, top-ups, subscriptions, or paid-model access.
- No per-key rate limiting or concurrency control.
- One provider key and one shared free pool.
- No admin roles or audit log.
- SQLite is local development storage, not a multi-instance database.

## License

MIT — see [LICENSE](LICENSE).
