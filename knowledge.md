# Project Knowledge

## What this is

A local-first gateway in front of an OpenAI-compatible upstream provider. It
syncs the provider catalog, mints local consumer keys, routes only the free
pool, streams responses, and records weighted usage in SQLite.

## Facts that are easy to get wrong

- **The free signal is the `free/*` pool, not `allowFree`.** The provider's
  public metadata marks paid models with `allowFree: true`; those still return
  `402 Insufficient balance` on a zero-balance account. `lib/provider.ts`
  therefore classifies only `free/*` (or provider `Free`) with
  `allowFree !== false` as free.
- **Usage is weighted.** The provider charges the free pool in weighted units.
  `free/gpt-6-luna` has weight 3, so 316 raw tokens consume 948 units.
  `usage_events` stores raw and weighted counts separately.
- **Keys are hashed.** `api_keys.secret_hash` is SHA-256; the full `sk-…` secret
  is returned once at creation and never stored.
- **The dashboard write endpoints are localhost-guarded by a `Host` header
  check.** That check is spoofable by a client that can reach the server. It is
  a development convenience, not a security boundary. The `/v1/*` routes are
  consumer-key authenticated and can be exposed; the `/api/*` routes should not
  be exposed without adding real auth.
- **SQLite is local state.** `data/*.db*` is ignored and not part of the
  deliverable. Deleting it and syncing again is the reset path.
- **There is no billing.** Paid models are catalogued but rejected locally with
  `402`; the upstream is never called for them.
- **The provider key is server-only.** `PROVIDER_KEY` is read through
  `lib/provider.ts`; never place it in `NEXT_PUBLIC_*` or any client component.

## Current layout

- `app/api/*` — dashboard actions (local only).
- `app/v1/chat/completions` — the gateway entry point.
- `app/v1/models` — authenticated catalog.
- `lib/provider.ts` — upstream client, metadata, sync.
- `lib/gateway.ts` — auth, routing, SSE, metering.
- `lib/store/*` — persistence split by responsibility.
- `components/dashboard/*` — dashboard sections.

## Verification

`npm run verify` is the full local gate. Live provider checks require
`PROVIDER_KEY` and are not run in CI.
