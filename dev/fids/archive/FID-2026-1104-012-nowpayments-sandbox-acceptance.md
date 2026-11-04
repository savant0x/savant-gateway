# FID: NOWPayments sandbox acceptance procedure

**Filename:** `FID-2026-1104-012-nowpayments-sandbox-acceptance.md`
**ID:** FID-2026-1104-012
**Severity:** high
**Status:** closed — operator-approved non-pursuit (2026-11-04)
**Created:** 2026-11-04 17:40
**Automation level:** 2
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-127, FID-2026-1030-062 item 1

## Summary

The crypto lane has unit and HTTP coverage, and a live $1 invoice was created on
2026-10-31 through the client module, but no sandbox checkout has ever completed
the route → hosted invoice → signed IPN → credit → replay journey. This record
defines that acceptance procedure, the exact evidence it must produce, and the
prerequisites that are blocked today: a sandbox account and key pair, a sandbox
IPN secret, a public HTTPS callback origin, and a disposable database. It does
not discharge FID-2026-1103-127; by operator ruling it produced no receipt and is
closed as an accepted assumption.

The vendor's own sandbox documentation changes the risk: it states the sandbox
has not been actively maintained since 2025, may differ from production, and is
offered as-is. It documents `POST /v1/payment` with a `case` parameter, not the
hosted-invoice endpoint this lane uses. Sandbox viability for `/v1/invoice` is a
gate, not an assumption.

**Operator ruling 2026-11-04 — closed without execution.** The operator confirmed
both live invoices were creation-only ("These were only created") and ruled that
the vendor is a managed service outside our control: "It's a service, so just
assume it works as we have it wired." and "It's a service that works." The
sandbox track is dropped. No sandbox receipt, paid invoice, provider-delivered
IPN or replay refusal exists; the lane is assumed to work as wired, not verified
end-to-end.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; disposable PostgreSQL.
- Repository HEAD `aef6730`.
- Recorded smoke: `dev/session-summaries/2026-10-31-nowpayments-live-smoke.md`.
- Current configuration: live host selected, lane flag unset, top-ups disabled.
- Sandbox rerun 2026-11-04T16:41Z: `POST https://api-sandbox.nowpayments.io/v1/invoice`
  with the configured key returned 403; `GET /v1/status` returned 200 on both
  hosts. The key pair is live-only, and the sandbox host itself is reachable.
- Vendor documentation, viewed 2026-11-04: the sandbox is "no longer actively
  maintained or kept in sync with Production" since 2025 and is available
  "as-is"; production is the source of truth. Sandbox signup is a separate
  account at `account-sandbox.nowpayments.io` (200 on 2026-11-04).
- Unauthenticated probes 2026-11-04: sandbox `POST /v1/invoice` and
  `GET /v1/currencies` both return 403 `INVALID_API_KEY`; the live host returns
  200 for `/v1/currencies`. The sandbox auth surface differs from production,
  and a missing key cannot distinguish "unsupported" from "unauthorized".
- Ready locally: production build present; `cloudflared 2026.6.0` installed for a
  public HTTPS origin. Docker's Linux daemon is not running, so a disposable
  database uses the configured provisioner or a started daemon.

## Detailed Description

### Problem

`tests/nowpayments.test.mjs` proves signature construction, status
classification, parsing and the invoice client against a stub. It does not prove
that the checkout route creates a sandbox invoice, that NOWPayments delivers a
signed IPN to a public origin, that the webhook credits exactly once, or that a
replay, a forged signature, a non-final status and a mismatch all leave the
ledger untouched. Two live invoices exist, neither a receipt: `5803921519` ($1,
order `smoke-1793470713976`) was created by the module, not the route, and was
never paid; `6080485510` ($10, no order id, 2026-10-31 11:55) is in the live
account but not in the repository record, and the current module always sends
`order_id`, so it does not match this code path. Neither produced an IPN. A
sandbox attempt on 2026-10-31 returned 403 because the configured key pair is
live.

### Expected Behavior

A sandbox-only run through the real route and the real webhook that produces one
dated, redacted receipt: sandbox invoice 200, provider-delivered signed IPN,
exactly one credit, replay refused, invalid signature refused, non-final and
final-fail without credit, mismatch and unknown-order quarantine, cross-secret
rejection, and the credited balance spendable through a paid fixture call. No
real funds move.

### Root Cause

The lane was smoke-tested at the module boundary because no sandbox credentials
and no public callback origin existed. The route-level and delivery-level
behavior therefore remains unobserved, and the environment binding is
operational rather than enforced in code.

### Evidence

```text
lib/nowpayments.ts:96            sandbox only when NOWPAYMENTS_SANDBOX is affirmative
lib/nowpayments.ts:40            API key + IPN secret required, both from env
app/api/account/topup/crypto     policy -> config -> origin -> amount -> invoice
app/api/webhooks/nowpayments     signature -> status -> claim -> fulfill/quarantine
webhook claim                     livemode: null, expectedLivemode: null
2026-10-31 sandbox attempt       403; key pair is live
2026-10-31 live invoices         5803921519 ($1, order smoke-...) unpaid, no IPN;
                                 6080485510 ($10, no order id) origin unrecorded
2026-11-04 invoice probes        GET /v1/invoice/{id} 404, /v1/payment/ 401
                                 status must be read from the dashboard
sandbox docs (Postman, 2026-11-04)  unmaintained since 2025; as-is; payment `case` flow
sandbox no-key probes               /v1/invoice 403, /v1/currencies 403 (live 200)
gateway docs                        no NOWPayments sandbox page in app/ or docs/
```

## Prerequisites

| Prerequisite | State on 2026-11-04 | How it is verified without printing a value |
| --- | --- | --- |
| Sandbox account and API key | **Blocked** — the live key returns 403 there; sandbox is a separate signup at `account-sandbox.nowpayments.io` | `readNowpaymentsConfig()` reports configured, and a sandbox invoice request returns 200 rather than 403 |
| Sandbox IPN secret | **Blocked** — must be the secret for the sandbox store, distinct from live | A manually signed sandbox payload verifies; the live secret fails |
| Public HTTPS origin | **Blocked** — `NEXT_PUBLIC_SITE_URL` is unset | `resolveAppOrigin()` returns the tunnel URL; the invoice payload's `ipn_callback_url` is that URL |
| Disposable database | Available via `TEST_DATABASE_URL` or a local throwaway PostgreSQL | `npm run test:postgres` runs; the database is dropped after the receipt |
| Lane flag | Off by design | `NOWPAYMENTS_TOPUPS_ENABLED=true` only in the disposable runtime |
| Sandbox invoice and simulation support | **At risk** — the vendor sandbox is unmaintained since 2025 and documents `POST /v1/payment` with a `case` parameter; `/v1/invoice` compatibility is unverified | One sandbox invoice 200; a 404 or unsupported-method response stops the run and is recorded as a blocker, not a failure |
| Live-account reconciliation | **Closed** — the operator confirms both invoices were creation-only ("These were only created"); no payment or IPN occurred | No ledger or balance change exists for either invoice; recorded in the resolution |
| Operator approval for a sandbox enabling window | Required, automation level 2 | Dated SCOPE entry naming the window |

The current live pair must never be pointed at `api-sandbox.nowpayments.io`.
`nowpaymentsBaseUrl()` selects the host from `NOWPAYMENTS_SANDBOX`, and the
sandbox key is a separate credential.

## Impact Assessment

### Affected Components

- `app/api/account/topup/crypto/route.ts` and `lib/nowpayments.ts`.
- `app/api/webhooks/nowpayments/route.ts`, `lib/storage/store/topups.ts` and
  `lib/storage/ledger/payment-events.ts`.
- Disposable runtime configuration; no production flag or price changes.

### Risk Level

- [x] High: this is the only evidence that the paid lane works before real money.
- No real funds, production database, live key or customer data are used.

## Proposed Solution

### Approach

Run the procedure against one disposable database and one public HTTPS tunnel,
on the sandbox host only, and record a redacted receipt. No code change is
required unless a step exposes a defect; a defect gets its own repair commit
before the receipt is repeated.

### Steps

**Not executed.** The operator ruling of 2026-11-04 dropped the sandbox track.
The procedure is retained as the record of what a maintained sandbox would have
required.

0. **Viability gate before infrastructure.** With a sandbox key, call `POST
   /v1/invoice` once. If it is unsupported (404 or method error), stop: the
   shipped hosted-invoice lane cannot be accepted in sandbox. Record the result
   and return the choice to the operator — a small production test with real
   funds under the existing safeguards, or a sandbox-only adapter explicitly
   labelled as not the shipped lane. Do not silently switch the lane to
   `/v1/payment`.

1. **Provision the window.** Fresh disposable PostgreSQL; a HTTPS tunnel to the
   built app; sandbox API key and sandbox IPN secret in the runtime environment
   only; `NOWPAYMENTS_SANDBOX=true`; `NOWPAYMENTS_TOPUPS_ENABLED=true`;
   `NEXT_PUBLIC_SITE_URL` set to the tunnel origin. Confirm the resolved host and
   origin in startup output without printing a credential.
2. **Checkout through the route.** Sign in as a disposable customer, create a
   key, and `POST /api/account/topup/crypto` with `amountUsd: 5`. Require 200,
   a hosted invoice URL, a `topup_` id, and a pending row whose `provider_ref`
   equals the invoice id. Reject a 503 policy/config/origin response as a failed
   prerequisite, not a pass.
3. **Pay in the sandbox.** Use the sandbox store's test-payment or IPN
   simulation path to produce a `finished` delivery. Record whether the delivery
   was provider-generated or manually signed; a manual delivery is acceptable
   evidence for webhook behavior but is labelled as such and does not prove
   NOWPayments delivery.
4. **Verify the credit.** Require a signed IPN `200` with `credited: true`,
   exactly one `topups` row in `paid`, exactly one `credit_ledger` `topup` row,
   balance increased by exactly $5, and one `billing_events` row `processed`.
5. **Replay.** Resend the identical body and signature. Require no second ledger
   row and no balance change; record the returned `replay`/`state` value.
6. **Refusals.** Forged signature → 400 and no write. Non-final `waiting`/
   `confirming` → 200 received, no claim, no credit. Final-fail `failed`/
   `expired` → top-up `failed`, no credit; a later `finished` for that payment
   must quarantine rather than credit. Amount, currency or user mismatch →
   quarantine, no credit. Unknown `order_id` → quarantine, no credit. A payload
   signed with the live secret → 400.
7. **Prove spendability.** Make one paid call against the fixture upstream with
   the credited balance and require `billing_source = credit`, a charge in the
   ledger, and zero reconciliation difference. Credit that cannot be spent is
   not accepted as a completed top-up.
8. **Teardown and receipt.** Disable the lane flag, stop the tunnel, drop the
   disposable database, and write a redacted receipt with timestamps, invoice
   and payment ids, status codes, ledger deltas, the resolved host class
   (sandbox/live) and the pinned SHA. Never include a key, secret, raw
   connection string or customer credential.

### Verification

RED: any step that cannot run because a prerequisite is absent is recorded as
blocked, not as a pass. This procedure was not executed; the operator ruling
closed it on 2026-11-04. GREEN would have required all nine steps and the full
table:
invoice 200, one credit, replay no-op, four refusal classes, quarantine, and a
spendable balance. A manual IPN delivery is marked manual and does not claim
provider delivery; if the sandbox cannot generate a hosted invoice or a payment,
the run stops at step 3 and the blocker is recorded.

### YAGNI

No new payment provider, plan change, price change, retry framework or schema
change. No live-money test. The procedure uses the existing route, webhook,
store and ledger.

## Verification Gates

- gate: test tests/nowpayments.test.mjs
- gate: test tests/payment-events.test.mjs
- gate: test tests/topup.test.mjs
- gate: test tests/card-topups.test.mjs
- gate: test_http — `npm run test:http`.
- gate: test_postgres — `npm run test:postgres` on the disposable endpoint.
- gate: lint, typecheck, quality, build.
- gate: verify — `npm run verify:supabase` if any code changed.

**External gate:** the sandbox receipt itself. It cannot be produced from
fixtures and is the reason this FID exists.

### Verification Receipt

- verified: not executed — closed by operator ruling 2026-11-04; no sandbox run
  occurred and no acceptance is claimed.

## Perfection Loop

### Loop 1 — RED

- **RED:** no route-level sandbox evidence, no delivered IPN, no replay or
  refusal receipt, no spendability proof.
- **GREEN:** one procedure that exercises every branch and records the result.
- **AUDIT:** the route gates policy, config, origin and amount before invoice
  creation; the webhook verifies the signature before any store write; the
  fulfilment path locks the top-up row and credits atomically.
- **ADVERSARIAL:** a successful invoice creation can be mistaken for a working
  lane. The procedure requires the credit and the spend, not the invoice.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does the sandbox use real money?** No, provided the sandbox host and a
   sandbox key are used. Assert the host class, do not assume it.
2. **Can the module-level smoke substitute for the route?** No; it bypasses the
   policy, config, origin and amount gates the customer hits.
3. **Is `credited: true` sufficient?** No; verify the ledger row, the exact
   balance delta and a successful spend.
4. **Does NOWPayments guarantee sandbox IPN delivery?** Unconfirmed. If it does
   not, a manually signed delivery proves webhook behavior only, and the receipt
   must say so.
5. **Can the live key be used with the sandbox flag?** No; it returned 403 and
   is the wrong credential class.
6. **Does the vendor sandbox support the hosted-invoice endpoint?** Unconfirmed.
   The documented sandbox flow is `POST /v1/payment` with a `case` parameter, and
   the sandbox is unmaintained since 2025. Test it before building the window.
7. **Where does the gateway document the sandbox procedure?** Nowhere. The
   website has no NOWPayments sandbox page; this FID is the only record. Adding
   customer-facing or operator docs is a separate decision, and documenting an
   unverified path would be worse than the current gap.

### Loop 2 — Independent audit and self-correction

- **RED:** the webhook claims events with `livemode: null` and
  `expectedLivemode: null`, so code does not bind a delivery to sandbox or live.
- **GREEN:** keep distinct IPN secrets and a separate disposable database, and
  record the isolation as operational. A live-secret payload must fail against
  the sandbox secret.
- **AUDIT:** every signed event reaches the financial writer only after the
  claim; a processed or quarantined event is terminal.
- **ADVERSARIAL:** a tunnel that changes hostname invalidates the invoice
  callback. Pin one hostname for the window and record it.
- **CHANGE DELTA:** 6%.

### Loop 3 — Final convergence

- **RED:** a failure mid-run could leave a pending top-up and a claimed event.
- **GREEN:** teardown drops the database; the receipt records every leftover.
- **AUDIT:** no production flag, price, customer or credential is touched.
- **ADVERSARIAL:** a sandbox run could be reused as evidence for a later SHA.
  The receipt names the commit and build id; a different artifact invalidates it.
- **CHANGE DELTA:** 0%; converged before execution.

## Implementation Evidence

Closed without execution by operator ruling on 2026-11-04. No code was written
and no sandbox window was opened.

- [x] **Commit SHA / build id:** not applicable — documentation-only record,
  archived without commit under the register's explicit note.
- [x] **File:line ranges:** none; the procedure named the existing route,
  webhook, store and ledger but changed nothing.
- [x] **Gate output:** 2026-11-04 focused lane run — `node --test
  tests/nowpayments.test.mjs tests/payment-events.test.mjs tests/topup.test.mjs
  tests/card-topups.test.mjs` → 31 tests, 31 pass, 0 fail, exit 0; attribution
  guards PASS; `git diff --check` exit 0.
- [x] **Reproducibility:** `grep -rn 2026-1104-012 dev/fids SCOPE.md CHANGELOG.md`
  finds the archived record, the ruling and the changelog entry.
- [x] **Step statuses:** steps 0–8 are `deferred — operator-approved 2026-11-04`;
  none is `implemented`, and no step is claimed as passed.
- [x] **Receipt path:** none. No sandbox receipt exists; the live smoke record is
  `dev/session-summaries/2026-10-31-nowpayments-live-smoke.md`.

## Code Verification Evidence

- [x] Route, webhook, store and ledger paths were read and match the procedure.
- [x] The 2026-10-31 403 and the live invoice are recorded, not reinterpreted.
- [x] Status reflects reality: `closed — operator-approved non-pursuit`, no
  acceptance claimed.

## Resolution

- **Closed Date:** 2026-11-04
- **Fix Description:** No code change. The sandbox acceptance procedure was
  dropped by operator ruling: the vendor is a managed service, both live
  invoices were creation-only, and the lane is assumed to work as wired. The
  end-to-end provider and webhook behavior is explicitly unverified.
- **Tests Added:** No.
- **Verification Evidence:** No sandbox, paid-invoice, IPN or replay receipt
  exists. The focused lane suite passed 31/31 on 2026-11-04; that is unit
  evidence for the wiring, not provider delivery.
- **Archived:** 2026-11-04 — archived without commit (documentation-only record,
  no code change), per the FID register's maintenance rule 3.
- **Archived:** no.

## Lessons Learned

An invoice id is not a payment. Acceptance must reach the ledger and the spend,
and a sandbox receipt must name which parts the provider actually delivered.
