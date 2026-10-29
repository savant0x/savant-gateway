# Session Summary: 2026-10-29 04:06 EDT

**Session ID:** 2026-10-29-customer-e2e-verification
**Duration:** 2026-10-29 04:00 — 04:10 EDT
**Status:** interrupted — handed off

---

## Initial State

### Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node v24.21.0, npm 12.2.1
- **Branch:** `main`
- **Last Commit:** `af9a015` — `docs(api): add an external API reference`
- **Remote:** `origin/main` at `af9a015`; working tree clean
- **Production server:** not running. `data/prod-server.pid` contains `59564`,
  but no process owns it and `http://localhost:3100` refuses connections.
- **Database:** `data/gateway.db` — 45 models (45 active), 1 user, 2 keys,
  0 top-ups, 3 usage events. Read-only counts only; no runtime data changed.

### Credentials Present

`.env.local` defines these names (values were not printed):

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `GITHUB_TOKEN`
- `PROVIDER_KEY`

It does **not** define `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.
There is no live Stripe CLI installed.

### Known Limits

- No Stripe test credentials means checkout creation cannot run and no signed
  webhook can be received. The top-up route correctly fails closed with `503`.
- The provider account has no funded paid balance (recorded in prior sessions),
  so a paid-model receipt must use a controlled upstream rather than spend
  provider credit.
- The existing test suite covers pure helpers only. There is no route-level
  HTTP test harness, so this receipt must be run and recorded manually.

---

## Planned Work

1. [ ] Start the production build against a disposable database and a local mock
       upstream.
2. [ ] Sign up a customer, verify the session cookie, and load `/api/auth/me`.
3. [ ] Create an account-scoped API key and prove the zero-credit paywall.
4. [ ] Exercise the Stripe Checkout plus webhook top-up, including replay.
5. [ ] Send a paid completion and verify the balance, ledger, and usage row.
6. [ ] Record the receipt and remove all disposable runtime state.

---

## Work Completed

### Flow inventory (static)

- **Signup:** `POST /api/auth/signup` validates name, email, and password, hashes
  with scrypt, rejects duplicate emails before hashing, creates an opaque
  session, and sets `sg_session` HttpOnly, SameSite=Lax, seven days.
- **Session:** `GET /api/auth/me` returns the customer plus
  `{ creditMicros, heldMicros, availableMicros }`.
- **Keys:** `GET/POST /api/account/keys`; secrets are returned once at creation.
  `DELETE /api/account/keys/[id]` scopes the update by `user_id`.
- **Top-up:** `POST /api/account/topup` requires a signed-in same-origin
  customer, parses $5–$500 exactly, creates a `pending` top-up, and creates a
  Stripe Checkout session. Missing Stripe configuration returns `503` with
  `X-Reason: stripe_unconfigured`.
- **Fulfillment:** `POST /api/webhooks/stripe` requires a valid signature,
  handles `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`, requires `payment_status=paid`,
  and matches `amount_total` and currency to the pending row. `fulfillTopup`
  transitions the row and credits the ledger in one immediate transaction;
  `provider_ref` is unique, so replay is a no-op.
- **Paid request:** `POST /v1/chat/completions` authenticates the key, resolves
  the catalog row, rejects disabled or unpriced models, reserves a hold, calls
  `providerChatCompletion` at `PROVIDER_BASE_URL + /chat/completions`, and
  settles the actual usage. Insufficient available credit returns `402
  insufficient_quota`.

### Baseline data

- 45 active models; 45 catalogued.
- A suitable paid receipt model is `deepseek-v4-flash`:
  - cost `$0.05`/1M input and output (`50,000` micros)
  - sell `$0.065`/1M input and output (`65,000` micros)
  - `status=active`, `allow_free=0`, `token_weight=0`
- A free control is `free/gpt-6-luna` (`token_weight=3`).
- `gpt-6-luna` is also active at `$0.0975`/1M.

### Runtime verification

**Not run.** The session was stopped before the production server was started.
No signup, key, top-up, webhook, or completion request was sent. The only
database work was read-only inspection.

---

## Issues Discovered

### H1 — Stripe test credentials are absent (blocking, environment)

- **Severity:** high for verification; not a product defect.
- **Detail:** `readStripeConfig` requires both `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`. With neither set, `POST /api/account/topup` returns
  `503` before creating a Checkout session.
- **Status:** open.
- **Resolution:** install the Stripe CLI (not present on this machine), add
  Stripe **test** keys to `.env.local`, and forward events to
  `http://localhost:3100/api/webhooks/stripe`; or explicitly approve a partial
  signed-webhook substitute. Never use live keys for this receipt.

### H2 — The recorded production server is stale (test setup)

- **Severity:** low.
- **Detail:** `data/prod-server.pid` points at 59564, but port 3100 is closed.
- **Status:** open.
- **Resolution:** start a new server and record its actual PID.

### H3 — The production session cookie is `Secure` on localhost (verified)

- **Severity:** informational.
- **Detail:** `NODE_ENV=production` sets `secure: true` on `sg_session`. A probe
  against a local HTTP listener confirmed that curl on this machine replays the
  Secure cookie to both `localhost` and `127.0.0.1`, because loopback is a
  secure context. No workaround is needed for this receipt. A cookie scoped to
  a non-loopback HTTP origin would not be replayed.
- **Status:** closed.

### H4 — Paid upstream credit is unavailable (scope constraint)

- **Severity:** low.
- **Detail:** a real paid provider call would spend a balance the account does
  not have. A controlled mock upstream gives deterministic usage and still
  exercises the gateway's reservation, settlement, and analytics path.
- **Status:** noted.

### H5 — No route-level integration tests exist (coverage gap)

- **Severity:** low.
- **Detail:** `tests/` covers helpers and pricing math. The customer routes have
  no automated HTTP receipt, so regressions in cookie handling, same-origin
  checks, or webhook fulfillment would not fail `npm test`.
- **Status:** open; candidate for a follow-up FID.

---

## Perfection Loop Summary

| Loop | Target | RED | GREEN | AUDIT | Delta |
|------|--------|-----|-------|-------|-------|
| — | No code change | — | — | Not run | — |

No FID was opened. This session made no code change and produced no runtime
claim; it only mapped the flow and recorded the blocking environment facts.

---

## Validation Results

- [ ] Production build: NOT RUN this session. The prior `af9a015` push ran the
      pre-push gate successfully, including a 33-route build. That does not
      validate the customer E2E flow.
- [ ] Signup/session: NOT RUN.
- [ ] Key creation: NOT RUN.
- [ ] Top-up checkout: BLOCKED (H1).
- [ ] Signed webhook and replay: BLOCKED (H1).
- [ ] Paid completion: NOT RUN.

Read-only database inspection completed successfully. No other receipt exists.

---

## Final State

### Code Changes

- **Files modified:** none.
- **Lines added/removed:** 0.
- **Working tree before handoff:** clean at `af9a015`.
- **Runtime state:** no server started; no disposable database created.

### Git Status

- **Branch:** `main`
- **Uncommitted changes:** this handoff and the SCOPE progress entry only.
- **New commits:** handoff commit added after this file is written.

---

## Open Questions

1. Should the E2E receipt use a real Stripe test account and Checkout payment,
   or is a signed test event against a pending row acceptable as a documented
   partial receipt?
2. Should the mock upstream be a checked-in test fixture or a throwaway file
   under ignored `data/`?
3. Should route-level HTTP tests become a new FID, given H5?

---

## Next Session

### Priority Tasks

1. [ ] Add Stripe test credentials to `.env.local` (never commit them).
2. [ ] Start the disposable production server and mock upstream.
3. [ ] Run the full sequence below and save raw responses under `data/`.
4. [ ] Verify idempotent webhook replay, invalid signature, and cross-account
       key isolation.
5. [ ] Remove `data/e2e-*` and stop the server.

### Commands and Receipt Plan

**1. Build once, then start against an isolated database.**

```bash
npm run build

DB_PATH=./data/e2e-customer.sqlite \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
PROVIDER_BASE_URL=http://127.0.0.1:4020/v1 \
npm start -- --port 3100 > data/e2e-server.log 2>&1 &
echo $! > data/e2e-server.pid
```

`.env.local` supplies `PROVIDER_KEY`; process environment wins over it. Do not
point `DB_PATH` at `data/gateway.db`.

**2. Mock upstream.**

Create an ignored `data/e2e-mock-provider.mjs` that listens on
`127.0.0.1:4020` and serves `POST /v1/chat/completions`. It should return a
deterministic completion with usage large enough to exceed the reservation:

```json
{
  "id": "chatcmpl-e2e",
  "object": "chat.completion",
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "e2e-ok" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 12000, "completion_tokens": 4000, "total_tokens": 16000 }
}
```

With `max_tokens: 4000` and `deepseek-v4-flash` at 65,000 micros/1M, the
expected charge is `round(12000 * 65000 / 1e6) + round(4000 * 65000 / 1e6) =
1040` micros. Expected cost is `800` micros (`50,000`/1M). The hold is roughly
260 micros, so this also proves settlement above the hold.

**3. Signup and session.**

Send `Origin: http://localhost:3100` on every mutation. Expect `201`, a
`Set-Cookie: sg_session=...` with `HttpOnly`, `SameSite=Lax`, `Secure`, and
`Max-Age=604800`. Use a cookie jar; loopback is treated as a secure context.

```bash
curl -sS -c data/e2e-cookie.jar -D data/e2e-signup.headers \
  -o data/e2e-signup.json \
  -X POST http://localhost:3100/api/auth/signup \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3100' \
  --data '{"email":"e2e-<timestamp>@example.com","name":"E2E Customer","password":"correct horse battery staple"}'

curl -sS -b data/e2e-cookie.jar http://localhost:3100/api/auth/me
```

Expected: customer object and `availableMicros: 0`.

**4. Key and paywall.**

```bash
curl -sS -b data/e2e-cookie.jar -X POST \
  http://localhost:3100/api/account/keys \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3100' \
  --data '{"name":"e2e-key"}'
```

Capture `secret` once. Then call `deepseek-v4-flash` with that key and
`max_tokens: 4000`; expect `402` `insufficient_quota` before any top-up.

**5. Top-up.**

Without Stripe config, `POST /api/account/topup {"amountUsd":10}` must return
`503` with `X-Reason: stripe_unconfigured`.

With test config:

```bash
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
DB_PATH=./data/e2e-customer.sqlite \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
PROVIDER_BASE_URL=http://127.0.0.1:4020/v1 \
npm start -- --port 3100
```

Then create a $10 Checkout session, pay with a Stripe test card, and forward the
event with `stripe listen --forward-to localhost:3100/api/webhooks/stripe`.
Expected: `topups.status='paid'`, one `credit_ledger` row of `+10,000,000`
micros, and `/api/auth/me` reports `10,000,000` available.

Replay the same event; expect `credited: false` and no second ledger row. Send
a bogus `stripe-signature`; expect `400 Invalid signature`.

If no Stripe account is available, stop here and record the top-up as blocked.
Do not claim the checkout flow verified from a directly inserted row; that only
proves `fulfillTopup` and the webhook signature path.

**6. Paid completion and reconciliation.**

Call `deepseek-v4-flash` with the funded key and `max_tokens: 4000`. Expect
`200`, content `e2e-ok`, `usage` 12,000/4,000, `charged_micros = 1040`,
`cost_micros = 800`, `hold_micros` cleared, and available balance
`9,998,960`. Check `usage_events`, `credit_ledger`, and the customer account
payload. A second customer must not see or revoke the first customer's keys.

**7. Cleanup.**

```bash
kill "$(cat data/e2e-server.pid)"
rm -f data/e2e-* data/e2e-*.sqlite*
```

Verify `git status` remains clean and no secret or disposable database was
committed.

### Blockers

- Stripe test credentials (H1).
- A running production server and mock upstream (H2).

### Notes for Next Agent

- The main `data/gateway.db` is not a test database. Use a disposable copy or a
  fresh path.
- Do not print, log, or commit any value from `.env.local`.
- `topup` amounts are exact integer micro-dollars; minimum $5, maximum $500.
- The webhook, not the browser success redirect, is the only path that grants
  credit.
- Use `deepseek-v4-flash` for the paid receipt; it is active and priced.
- Keep the receipt honest: no Stripe test checkout means the top-up is not
  fully verified, even if the signed webhook substitute credits correctly.
