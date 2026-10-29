# FID: Customer accounts, account ownership, and credit top-ups

**Filename:** `FID-2026-1029-006-customer-accounts-and-credit-topups.md`
**ID:** FID-2026-1029-006
**Severity:** high
**Status:** converged
**Created:** 2026-10-29 03:05 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The gateway has one local tenant (`user_dev`). `/dashboard`, `/api/keys`, and
`/api/usage` are operator surfaces; every key, usage row, and credit balance
belongs to the local developer. A customer cannot sign up, sign in, own a key,
see a balance, or pay for credit. This FID adds the customer product layer:
email/password accounts, opaque server-side sessions, per-user keys and usage,
a customer account page, Stripe Checkout top-ups, and webhook-confirmed,
idempotent credit grants. The operator console and admin panel stay separate.

## Environment

- **OS:** Windows 11 (Git Bash)
- **Runtime:** Node `v24.21.0`, Next.js `16.4.3`, React `19.3.0`
- **Storage:** SQLite via `better-sqlite3`
- **State:** `137d019` on `main`; clean working tree
- **Payments:** Stripe Node SDK `23.0.1` (no payment processor in the service
  catalog; Stripe Checkout is the selected hosted-checkout provider)

## Detailed Description

### Problem

- `users` has no password hash and no customer-facing session.
- `api_keys` creation and listing are hard-coded to `user_dev`
  (`lib/store/keys.ts`), and `/api/keys` is loopback/admin only.
- `usage_events` stores `user_id`, but customer usage is never queryable by a
  customer.
- `credit_ledger` and `credit_holds` are scoped by user, but only the operator
  can grant credit (`/api/admin/credit`).
- There is no checkout, payment record, webhook, or idempotent fulfillment
  path. A customer cannot turn money into gateway credit.

### Expected Behavior

- `POST /api/auth/signup` creates an active customer with a normalized unique
  email, a scrypt password hash, and a session.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`
  manage an opaque `sg_session` cookie; server-side sessions are revocable.
- `/signup` and `/login` are public; `/account` requires a customer session.
- `/account` shows the signed-in customer's available credit, held credit,
  keys, usage, ledger, and top-up history.
- Customer key routes (`/api/account/keys`) create, list, and revoke only the
  signed-in user's keys. The gateway already authenticates the key's user and
  settles against that user's balance.
- `/api/account/topup` creates a Stripe Checkout Session for a server-validated
  amount ($5–$500). The browser is redirected to Stripe.
- `POST /api/webhooks/stripe` verifies the Stripe signature over the raw body
  and credits the customer only for a paid Checkout Session. A unique
  `provider_ref` makes replay a no-op. The success redirect does not grant
  credit.
- Operator admin gets a Customers page with balances and recent top-ups; the
  existing local-tenant credit card is labeled as such.
- Secrets remain server-only: `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`. No card data reaches this app.

### Root Cause

The first two slices optimized for a single-operator console. `user_id` exists
in the data model, but there is no customer identity, no customer-session
guard, and no purchase-to-credit transaction.

### Evidence

```text
lib/store/keys.ts: WHERE user_id = 'user_dev'
app/api/keys/route.ts: guardLocalOrAdmin
app/dashboard/page.tsx: getOverview() — local tenant
app/api/admin/credit/route.ts: operator-only grant
users columns: id, email, name, status, created_at, credit_micros, held_micros
no checkout/topup/session table
```

## Impact Assessment

### Affected Components

- `lib/db.ts` — customer session, top-up, and password columns; indexes.
- New `lib/password.ts`, `lib/customer-session.ts`,
  `lib/customer-rate-limit.ts`, `lib/customer-auth.ts`, `lib/stripe.ts`,
  `lib/topup-amount.ts`.
- New `lib/store/customer.ts`, `lib/store/topups.ts`; scoped key/usage
  functions.
- New `app/api/auth/*`, `app/api/account/*`, `app/api/webhooks/stripe`.
- New `app/login`, `app/signup`, `app/account`; account components.
- `components/landing/*`, `components/admin/*`, `config/site.ts`.
- New `/admin/customers` page and nav item.
- `.env.example`, README, knowledge, AGENTS, CHANGELOG, SCOPE.
- Tests: password, customer validation, session token handling, top-up amount,
  and scoped ownership where practical.

### Risk Level

- [x] High: authentication and payment fulfillment are security- and
  revenue-sensitive. Containment: scrypt with per-password salt and constant
  time compare; opaque hashed session tokens; HttpOnly/SameSite cookies;
  same-origin mutation checks; per-IP rate limits; Stripe signature
  verification; unique provider reference; one SQLite transaction for
  fulfillment; success redirect cannot credit.
- Stripe cannot be live-tested without credentials. The receipt will show the
  configured/unconfigured behavior, signature rejection, idempotent credit
  fulfillment on a disposable database, and a real customer/key/usage path.
  It will not claim a completed card payment.

## Proposed Solution

1. Add customer columns and `customer_sessions`, `topups`; index by user.
2. Add password hashing/verification and customer validation helpers with
   tests.
3. Add opaque session creation/revocation and cookie helpers; guard customer
   pages and account APIs with same-origin checks.
4. Add per-user key and usage store functions; leave the local developer
   wrappers intact for the operator console.
5. Add signup/login/logout/me routes and public auth pages.
6. Add `/account` with balance, keys, usage, ledger, top-ups, and quickstart.
7. Add Stripe Checkout creation and signature-verified webhook; credit only on
   a paid session, idempotently.
8. Add admin Customers visibility and update local-tenant labels.
9. Run gates, live-test signup/key/scoped usage/webhook idempotency, close the
   FID, commit, and push.

### Verification

- `tests/password.test.mjs`, `tests/customer.test.mjs`,
  `tests/customer-session.test.mjs`, `tests/topup.test.mjs` cover hashing,
  email/password validation, session token shape/hash, cookie flags, and amount
  bounds.
- Live: signup 201/session; duplicate email 409; login 200; wrong password
  401; `/account` 200 with session and 307 without; customer key create/revoke;
  a second customer cannot revoke the first customer's key; own usage is
  scoped; top-up with no Stripe key returns a clear 503; a signed test webhook
  on a disposable DB credits once and a replay does not double-credit;
  unsigned webhook 400.
- `npm run verify` exit 0; CI green.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/password.test.mjs
- gate: test tests/customer.test.mjs
- gate: test tests/topup.test.mjs
- gate: test tests/customer-session.test.mjs
- gate: test tests/admin-session.test.mjs
- gate: quality
- gate: build
- gate: verify

## Perfection Loop

### Loop 1 — RED

- **RED:** No customer identity, keys hard-coded to the local tenant, no
  checkout, no webhook, no customer balance view.
- **GREEN:** Add the customer layer and Stripe Checkout fulfillment.
- **AUDIT:** Code paths above; key/usage/credit are already user-scoped at the
  gateway, so ownership is enforced by the session and query predicates.
- **ADVERSARIAL:** Session fixation, cross-site posts, account enumeration,
  unlimited signup, checkout amount tampering, webhook replay, success-redirect
  credit without payment, and a customer revoking another customer's key.
  Mitigations: new opaque token per login, same-origin + HttpOnly/SameSite,
  generic duplicate-email response, rate limits, server-side amount validation,
  signature verification, unique provider reference, credit only in webhook,
  and `user_id` in every customer mutation.
- **CHANGE DELTA:** baseline.

### Missed Questions

1. **Does signup include free credit?** No. Free-pool models work with a key
   and zero paid balance; paid models require a top-up or operator grant.
2. **Is email verified?** Not in this slice. There is no transactional email
   provider configured. The limitation is documented; password reset and
   verification are follow-ups.
3. **What if Stripe is not configured?** The account page shows a setup card;
   the checkout API returns `503` with a setup message and an
   `X-Reason: stripe_unconfigured` header. No fake credit path is exposed.
4. **What does “paid” mean for fulfillment?** A `checkout.session.completed`
   or `async_payment_succeeded` event whose `payment_status` is `paid`.
   `unpaid`/`no_payment_required` sessions do not credit.
5. **What prevents double credit?** `topups.provider_ref UNIQUE` plus a single
   SQLite transaction that only transitions a non-paid row. Replays return 200
   without a second ledger entry.
6. **Can an admin grant customer credit?** Not in this slice. Operators can
   see customers and top-ups; the existing local-tenant grant remains for
   development. Customer funding is Stripe.
7. **Are customer routes CSRF-protected?** Mutations require same-origin
   `Origin` (when present), the session cookie is HttpOnly/SameSite=Lax, and
   all reads/mutations scope by the session user.
8. **What is persisted from Stripe?** Session id, amount, currency, customer,
   status, and timestamps. No card data, no payment method details.

### Loop 2 — Independent audit and self-correction

- **RED:** The first implementation passed typecheck but the new password test
  suite failed to load: `lib/password.ts` imported `lib/customer.ts` without an
  extension, which Next resolves and Node's ESM test runner does not. The
  password module now owns its length bound, keeping the scrypt helper directly
  testable.
- **GREEN:** Customer signup, login, session, scoped keys/usage, checkout,
  webhook fulfillment, account UI, and admin visibility implemented. The
  limiter was corrected so failed signup validation and invalid top-up amounts
  do not consume the successful-action budget. Amount parsing was corrected to
  stop number inputs from being rounded via `toFixed(2)` before validation.
- **AUDIT:** Every customer read/write carries the session user id: key list,
  key create, key revoke, usage query, ledger query, top-up query, and balance.
  The gateway already settles against `authenticatedKey.userId`; customer keys
  now belong to that user instead of the local tenant. No upstream cost field
  crosses a customer shape. The webhook uses the stored top-up row as the
  amount authority and checks the Stripe-reported amount and currency against
  it. `/account` and customer APIs send `no-store`; auth pages are `noindex`.
- **ADVERSARIAL:** Session fixation (new random token per login), cross-site
  mutation (origin check + SameSite), account enumeration (generic login
  failure), signup abuse (per-IP successful-signup limit), checkout amount
  tampering (server parse, stored amount, webhook amount match), replay
  (unique provider ref + status transition), credit without payment (success
  redirect grants nothing), unsigned/forged webhook (signature verification),
  second-customer key tampering (`user_id` predicate, live `404`), Host
  poisoning of Stripe redirects (configured URL wins), and a local-tenant
  fallback (customer queries never call the tenant wrappers).
- **CHANGE DELTA:** `lib/db.ts`, `lib/types.ts`, `lib/password.ts`,
  `lib/customer.ts`, `lib/customer-session.ts`, `lib/customer-auth.ts`,
  `lib/customer-rate-limit.ts`, `lib/stripe.ts`, `lib/topup-amount.ts`,
  `lib/store/customer.ts`, `lib/store/account.ts`, `lib/store/topups.ts`,
  `lib/store.ts`, auth/account/webhook routes, auth/account pages and
  components, admin Customers page and nav, landing copy, env/docs, and tests.

### Loop 3 — Final convergence

- **RED:** None open. The only unverified path is a real Stripe card payment,
  which requires live keys and a public HTTPS origin; the fulfillment path is
  verified with a Stripe-signed event.
- **GREEN:** `npm run verify` exit 0: lint/typecheck clean, 48 tests passing,
  quality PASS over 122 files at the 400-line ceiling, 32-route production
  build.
- **AUDIT:** Disposable-DB live receipt recorded below; no test charged the
  operator's real Stripe account or modified `data/gateway.db`.
- **ADVERSARIAL:** All adversarial cases above exercised live or by unit test;
  no open finding.
- **CHANGE DELTA:** 18 new tests, 8 new customer/payment modules, 3 persistence
  modules, 7 new route handlers, 4 new pages/views, and the account component
  set. No routing or pricing math changed.

## Resolution

- **Closed Date:** 2026-10-29.
- **Fix Description:** Added customer identity, opaque server-side sessions,
  account-scoped keys and usage, a customer account surface, Stripe Checkout
  credit purchases, signature-verified idempotent fulfillment, admin customer
  visibility, and customer-oriented landing copy. Local-tenant operator
  surfaces remain separate. The production build also disables the spoofable
  loopback console bypass and requires an admin session for `/dashboard`; the
  development convenience remains.
- **Tests Added:** `tests/password.test.mjs` (5), `tests/customer.test.mjs`
  (5), `tests/customer-session.test.mjs` (4), `tests/topup.test.mjs` (4); suite
  total 48.
- **Verification Evidence:** On a disposable DB (`PORT=3210`): signup 201
  (both customers), duplicate 409, wrong password 401, login 200; cookie
  `sg_session` HttpOnly/SameSite=Lax/Secure/Max-Age 604800; `/account` 200
  signed in and 307 to `/login` signed out; key creation 201 per customer;
  customer B revoking customer A's key 404; foreign Origin 403; signed-out
  keys API 401; per-account usage pages showed only their own model row;
  top-up unconfigured 503; invalid amounts 400; Stripe failure 502 with a
  failed top-up row; unsigned webhook 400; bad signature 400; unpaid signed
  event ignored; paid signed event `credited:true` and balance $25.00; replay
  `credited:false` with one ledger row; logout 200 then old session 401; admin
  login 200 and `/admin/customers` 200 showing both accounts. Production
  operator boundary: signed-out `/dashboard` 307 to `/admin/login`; spoofed
  `Host: localhost` on `/api/keys` and `/api/models` 403; admin session gives
  `/dashboard` and `/api/keys` 200; admin logout returns `/api/keys` to 403.
  `npm run verify` exit 0.
- **Archived:** Pending final commit.

## Lessons Learned

- A payment success redirect is navigation, not evidence. Keep the credit
  transition behind a signed webhook and make the stored row authoritative.
- Server-side session rows are simpler to revoke than stateless tokens and
  remove the need for customer-side signature epochs.
- Scope by the authenticated id at every query; a shared "current tenant"
  helper is how cross-account leaks happen.
- Validate money as a string with an exact grammar. Converting through
  floating-point `toFixed` before validation silently changes user input.
