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
- **`/api/*` accepts loopback or an admin session.** `guardLocalOrAdmin` first
  rejects a foreign `Origin`, then allows a loopback request, then verifies the
  admin cookie. The loopback branch still trusts the `Host` header and is
  spoofable by a non-browser client; it is a development convenience, not a
  public boundary. The admin panel does not depend on it.
- **Admin sessions are signed and revocable.** The cookie is
  `v1.<expiry>.<epoch>.<nonce>.<HMAC>`; the epoch lives in
  `admin_state.session_epoch`. `DELETE /api/admin/session` bumps the epoch, so
  every issued token stops verifying, not just the browser copy.
- **The signing key is derived from `ADMIN_SESSION_SECRET` and
  `ADMIN_PASSWORD`.** Rotating either invalidates existing sessions. Both are
  required; the panel shows a setup card when they are missing or too short.
- **A disabled model stays disabled across a sync.** `replaceModels` captures
  disabled ids before deleting the catalog and re-inserts them as disabled.
- **SQLite is local state.** `data/*.db*` is ignored and not part of the
  deliverable. Deleting it and syncing again is the reset path.
- **There is no billing.** Paid models are catalogued but rejected locally with
  `402`; the upstream is never called for them.
- **The provider key is server-only.** `PROVIDER_KEY` is read through
  `lib/provider.ts`; never place it in `NEXT_PUBLIC_*` or any client component.

## Current layout

- `app/page.tsx` — public landing at `/`.
- `app/dashboard` — operator console; the old `/` dashboard moved here.
- `app/admin` — password-protected panel; `app/admin/login` is the only
  unauthenticated admin page.
- `app/api/admin/*` — session and admin-only catalog management.
- `app/api/*` — console actions (loopback or admin session).
- `app/v1/chat/completions` — the gateway entry point.
- `app/v1/models` — authenticated catalog.
- `lib/provider.ts` — upstream client, metadata, sync.
- `lib/gateway.ts` — auth, routing, SSE, metering.
- `lib/admin-session.ts` — pure token, password, cookie, and origin logic.
- `lib/store/*` — persistence split by responsibility.
- `components/landing/*`, `components/dashboard/*`, `components/admin/*` — UI.
- `assets/` — source brand files; served copies live in `public/`.

## Verification

`npm run verify` is the full local gate. Live provider checks require
`PROVIDER_KEY` and are not run in CI. The admin flow has a live HTTP receipt in
FID-2026-1029-003; unit tests cover token tampering, expiry, password rotation,
epoch revocation, cookie flags, origin checks, and the login limiter.
