# FID: NOWPayments customer top-up lane

**Filename:** `FID-2026-1031-076-nowpayments-topup-lane.md`
**ID:** FID-2026-1031-076
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** closed
**Created:** 2026-10-31
**Automation level:** 3
**Depends on:** FID-2026-1030-044 (payment-path consequence), FID-2026-1031-075 (card gate pattern)
**YAGNI-Compliance:** Verified — reuses the existing `topups` store, `payment-events` claim machine, request-limit readers and the FID-075 policy-flag pattern; no new persistence schema is invented.

## Summary

The operator selected a crypto-first launch and identified NOWPayments
(`https://nowpayments.io/`) as the payment processor; APInex's own checkout uses
NOWPayments invoices. Cards are disabled by FID-075 and the direct USDC lane
(FID-068) is deferred, so the gateway has no customer payment lane at all.
This FID adds the NOWPayments lane: an explicit enable flag, a crypto checkout
route that creates a fixed-rate USD invoice, a signature-verified IPN webhook
that credits through the existing idempotent `fulfillTopup`, an honest account
UI that offers the crypto lane, and unit plus HTTP coverage.

## Environment

- OS: Windows 11, PowerShell, Node >= 22.18, npm.
- Touched areas: `app/api/account/topup/crypto/route.ts` (new),
  `app/api/webhooks/nowpayments/route.ts` (new), `lib/nowpayments.ts` (new),
  `lib/store/topups.ts` (add `getTopupById`), `lib/store.ts` (export),
  `app/account/page.tsx`, `components/account/topup-card.tsx`,
  `components/account/billing-history.tsx`, `.env.example`,
  `tests/nowpayments.test.mjs` (new), `tests/card-topups.test.mjs` (copy
  correction), `scripts/http-suite.mjs`, `scripts/http-suite/checks.mjs`,
  `scripts/http-suite/harness.mjs` (IPN signer),
  `scripts/http-suite/seed.mjs`, `docs/offering-evidence.md`, `SCOPE.md`,
  `CHANGELOG.md` (closure).
- Baseline: `9077001`, 348 unit tests, 644 HTTP checks, build/quality clean.
- Final: 363 unit tests (+15), 672 HTTP checks (+28), full `npm run verify`
  exit 0.

## Detailed Description

### Problem

Cards are gated off (`CARD_TOPUPS_ENABLED=false`) and the direct USDC lane is
deferred. The operator ruled crypto-first and supplies NOWPayments as the
processor. Without a lane, `TopupCard` renders "Prepaid credit is not open
yet" and no customer can pay — there is no path to the first paying customer.

### Expected Behavior

- A customer can buy prepaid credit with crypto through a NOWPayments-hosted
  invoice; the invoice is priced in USD at a fixed rate, and the customer
  chooses the pay currency.
- Credit is added exactly once, only after NOWPayments reports `finished`
  through a signature-verified IPN, through the existing `fulfillTopup`
  transaction. Replays, tampered payloads, partial payments and unknown orders
  never credit.
- The lane is a separate launch decision from credential presence: unset
  `NOWPAYMENTS_TOPUPS_ENABLED` refuses new checkouts even when keys exist
  (same contract as `CARD_TOPUPS_ENABLED`), while the webhook stays active so
  an in-flight invoice still credits.
- The account page and top-up card render honest per-lane state; no copy
  claims a payment path that cannot complete.

### Root Cause

The operator's ruling was "crypto only, no refunds" with direct USDC as the
assumed lane, then updated the processor to NOWPayments. No gateway code
implements that lane yet. The provider's crypto-only rule binds only upstream
funding; customers may pay by crypto now and by card later (operator: "not
against permitting fiat, it was just easier to start w/ crypto first").

### Evidence

NOWPayments API (documenter, `S1a32n38` and `2s93JusNJt`):

- `POST /v1/invoice` — authenticated with `x-api-key: <key>` (Bearer is for
  payout endpoints only; corrected during implementation, see Loop 2);
  `price_amount`, `price_currency` (fiat), optional `pay_currency` (omitting
  it lets the customer choose), `order_id`, `order_description`,
  `ipn_callback_url`, `success_url`, `cancel_url`, `is_fixed_rate`,
  `is_fee_paid_by_user`. Response: `id`, `order_id`, `invoice_url`.
- IPN: `POST` to the configured callback; `x-nowpayments-sig` is HMAC-SHA512
  (hex) over `JSON.stringify` of the payment object with keys sorted
  recursively; compare with the IPN secret. Payload resembles the get-payment
  response: `payment_id`, `payment_status`, `order_id`, `price_amount`,
  `price_currency`, `pay_amount`, `actually_paid`, `pay_currency`,
  `outcome_amount`, `outcome_currency`, timestamps.
- Statuses: `waiting | confirming | confirmed | sending | partially_paid |
  finished | failed | refunded | expired`. `finished` is the settled,
  credit-worthy state. Fixed-rate invoices lock the rate for ~10 minutes;
  unpaid invoices expire in 7 days.
- Reuse inventory: `topups(provider, provider_ref UNIQUE, amount_micros,
  currency, status)`, `createTopup`, `setTopupProviderRef`, `markTopupFailed`,
  `fulfillTopup` (`paid | already_paid | missing | mismatch`), all exported at
  `lib/store.ts:123-131`; `claimPaymentEvent/complete/fail/quarantine` at
  `lib/payment-events.ts`; `readBoundedText/readJsonObject` at
  `lib/request-limits.ts`; `parseTopupAmount` at `lib/topup-amount.ts`;
  `topupLimiter` at `lib/customer-rate-limit.ts:26`; `resolveAppOrigin` at
  `lib/stripe.ts:79`; policy-flag pattern at `lib/card-topups.ts`.

## Impact Assessment

### Affected Components

- `app/api/account/topup/crypto/route.ts` (new checkout route)
- `app/api/webhooks/nowpayments/route.ts` (new fulfillment webhook)
- `lib/nowpayments.ts` (new client: policy, config, invoice, signature)
- `lib/store/topups.ts`, `lib/store.ts` (`getTopupById`)
- `app/account/page.tsx`, `components/account/topup-card.tsx`,
  `components/account/billing-history.tsx` (lane-aware UI)
- `lib/card-topups.ts`, `tests/card-topups.test.mjs` (stale USDC copy fix)
- `.env.example`, `scripts/http-suite.mjs`, `scripts/http-suite/checks.mjs`,
  `scripts/http-suite/harness.mjs`, `scripts/http-suite/seed.mjs`,
  `tests/nowpayments.test.mjs`

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

A money path is high risk by nature; the mitigation is the existing
transactional `fulfillTopup`, the payment-event claim machine, signature
verification, and a default-off enable flag.

## Proposed Solution

### Approach

Mirror the Stripe lane exactly: same store rows, same claim/fulfill machinery,
same request readers, same policy-flag shape. NOWPayments-specific parts are
kept in one module so the lane is auditable and swappable.

### Steps

1. **`lib/nowpayments.ts`**
   - `readNowpaymentsPolicy(env)` — `NOWPAYMENTS_TOPUPS_ENABLED` unset/any
     non-affirmative value means disabled; only `1/true/yes/on` enables.
     Mirrors `lib/card-topups.ts`.
   - `readNowpaymentsConfig(env)` — requires `NOWPAYMENTS_API_KEY` and
     `NOWPAYMENTS_IPN_SECRET`; reason strings mirror `lib/stripe.ts`.
   - `nowpaymentsBaseUrl(env)` — `NOWPAYMENTS_SANDBOX=true` →
     `https://api-sandbox.nowpayments.io`, else `https://api.nowpayments.io`
     (origin only; the client appends the `/v1/invoice` path — corrected from
     the first draft, see Loop 2).
   - `createNowpaymentsInvoice(input)` — `POST {base}/v1/invoice` with
     `x-api-key: <key>` (NOT `Authorization: Bearer`; NOWPayments uses Bearer
     only for payout requests — corrected from the first draft, see Loop 2);
     body: `price_amount` (USD number from micros), `price_currency: "usd"`,
     `order_id` (the topup id), order description naming the credit amount,
     `ipn_callback_url`, `success_url`, `cancel_url`, `is_fixed_rate: true`,
     `is_fee_paid_by_user: true` (the customer covers the NOWPayments fee so
     the credited price equals the listed price). Accepts an injectable fetch
     and base URL for tests. Throws a typed error on non-2xx or bad shape.
   - `verifyIpnSignature(payload, signature, secret)` — parse JSON, sort all
     object keys recursively, `JSON.stringify`, HMAC-SHA512 hex, constant-time
     compare. `false` on any parse or compare failure.
   - `parseIpnPayment(payload)` — returns a typed object or null; extracted
     fields: `paymentId`, `paymentStatus`, `orderId`, `priceAmount`,
     `priceCurrency`, `actuallyPaid`, `payCurrency`.
2. **`app/api/account/topup/crypto/route.ts`** — copy the Stripe route's
   shape: `requireCustomerApi` → `topupLimiter.check` → policy gate (503,
   `X-Reason: crypto_topups_disabled`) → config gate (503,
   `X-Reason: nowpayments_unconfigured`) → `resolveAppOrigin` (503 when
   unset) → `readJsonObject` → `parseTopupAmount` (400) →
   `topupLimiter.fail` → `createTopup({userId, amountMicros,
   provider: "nowpayments"})` → `createNowpaymentsInvoice` →
   `setTopupProviderRef(topup.id, invoice.id)` →
   `{ url: invoice.invoiceUrl, topupId: topup.id }`; catch →
   `markTopupFailed` + 502.
3. **`app/api/webhooks/nowpayments/route.ts`**
   - Config gate: no IPN secret → 503 (webhook must stay up for in-flight
     invoices even while the lane flag is off, exactly like Stripe).
   - `x-nowpayments-sig` missing → 400; `verifyIpnSignature` false → 400 with
     no store write.
   - `readBoundedText` raw body (1 MB), parse, `parseIpnPayment`; null → 400.
   - Non-final statuses (`waiting|confirming|confirmed|sending|
     partially_paid`) → `200 {received:true}` with **no claim and no store
     write**, so the later `finished` delivery for the same `payment_id` can
     still claim and credit.
   - `finished` → `claimPaymentEvent(db, { id: np_<paymentId>, type:
     "nowpayments_payment", livemode: null, expectedLivemode: null })`.
     Denied → `200 {received:true, replay, state}` (replay or in-flight).
     Allowed → `getTopupById(orderId)`; missing/unknown → quarantine +
     `200` (acknowledge so NOWPayments stops retrying). Present →
     `fulfillTopup({ topupId, providerRef: np_<paymentId>,
     expectedUserId, expectedAmountMicros: Math.round(priceAmount*100)*10000,
     expectedCurrency: priceCurrency })`; `paid` → complete claim,
     `credited:true`; `already_paid` → complete claim, `credited:false`;
     `missing|mismatch` → quarantine + `credited:false`, no credit.
   - Final-fail statuses (`failed|expired|refunded`) → `markTopupFailed`
     (idempotent by the `status='pending'` guard), `200`, no claim.
   - Route errors → `failPaymentEvent` + 500, mirroring the Stripe route.
4. **Store** — add `getTopupById(topupId): TopupSummary | null` to
   `lib/store/topups.ts` (reuses `TOPUP_COLUMNS`), export from `lib/store.ts`.
5. **UI** — `TopupCard` accepts a `lanes` descriptor (crypto and/or card,
   each with `available` + `reason`). Available lanes render their own button
   (`/api/account/topup/crypto` vs `/api/account/topup`) and honest payment
   copy ("Payment is completed on the payment provider's hosted page... This
   app never sees card or crypto keys. Credit is added only after the
   provider's signed webhook confirms the payment..."). No lane available →
   current disabled branch with the most specific reason. Account page computes
   each lane from its own policy+config. Success banner copy becomes
   lane-neutral ("Payment returned successfully. Credit is applied by the
   signed webhook..."). Billing history shows the payment provider label per
   top-up.
6. **`.env.example`** — `NOWPAYMENTS_TOPUPS_ENABLED=false`,
   `NOWPAYMENTS_API_KEY=`, `NOWPAYMENTS_IPN_SECRET=`,
   `NOWPAYMENTS_SANDBOX=false`, with the same "credentials alone never enable
   sales" warning as the card block.
7. **Unit tests** — `tests/nowpayments.test.mjs`: policy matrix (unset/false/
   true incl. whitespace), config matrix (missing key, missing secret, both),
   base-URL selection, signature matrix (valid, tampered body, wrong secret,
   nested objects, non-JSON), invoice builder with a stub fetch (URL, auth
   header, body fields incl. fixed-rate/fee flags, error mapping), IPN parse +
   status classification. No `server-only` import on `lib/nowpayments.ts` so
   the suite runs under the Node test runner (see Loop 2).
8. **HTTP suite** — `scripts/http-suite.mjs`: add
   `NOWPAYMENTS_IPN_SECRET`/`NOWPAYMENTS_API_KEY` fixture envs, pass
   `ipnSecret` to `runChecks`. `checks.mjs`: seed a `nowpayments` topup, then
   signed `finished` IPN → 200/credited/balance moves/paid row; replay → 200,
   `replay:true`, no second credit; invalid signature → 400, balance
   unchanged; `waiting` → 200, no credit; amount mismatch → 200,
   `credited:false`, stays pending, quarantined; unknown `order_id` → 200, no
   credit, quarantined; `expired` → topup marked failed; and
   `POST /api/account/topup/crypto` while the flag is unset → 503
   `crypto_topups_disabled` even though keys are present (the credential-
   presence case, same as FID-075). The fixture intentionally sets credentials
   without the policy flag so the webhook checks run fully local.
9. **Docs/records** — `docs/offering-evidence.md` ruling #7 + NOWPayments
   facts + resolve the "payment-path consequence" open item; `SCOPE.md` row;
   launch-master child link; CHANGELOG entry at closure.

### Verification

`tests/nowpayments.test.mjs` proves the pure logic (policy, config, signature,
invoice request shape). The HTTP suite proves the full webhook path on a real
booted server with a disposable database: signature validity, replay safety,
amount mismatch, unknown order, terminal failure, and the disabled route gate.
Outbound invoice creation is proven by the stub-fetch unit tests only — a live
NOWPayments account is operator territory and is exercised by the operator's
sandbox smoke test before the lane is enabled. `npm run verify` is the full
receipt.

## Verification Gates

- gate: test tests/nowpayments.test.mjs
- gate: test tests/card-topups.test.mjs
- gate: lint
- gate: typecheck
- gate: quality
- gate: build
- gate: test_http
- gate: verify

### Verification Receipt

- verified: `npm run verify` exit 0 (2026-10-31). lint 0/0 warnings;
  typecheck clean; config-check PASS (non-production); unit tests 363 pass /
  0 fail; quality PASS (400-line ceiling, 323 files); next build PASS with
  both new routes registered (/api/account/topup/crypto,
  /api/webhooks/nowpayments); HTTP suite 672 checks PASS + trial suite PASS;
  recovery drill PASS (backup + restore receipts, exit 0).

## Perfection Loop

### Loop 1 — RED

- **RED:** No customer payment lane; a crypto-first ruling with no way to pay.
  Risks to close: signature forgery, replay double-credit, partial payment,
  unknown order, credentials silently enabling sales, sandbox/live confusion,
  a `finished` event being rejected because a `waiting` event claimed the same
  `payment_id`.
- **GREEN:** Reuse `fulfillTopup` (unique `provider_ref` + one transaction) and
  `claimPaymentEvent`; never claim on non-final statuses; gate checkout behind
  an explicit default-off flag; keep the webhook live while the flag is off;
  make the base URL derive from one explicit `NOWPAYMENTS_SANDBOX` value.
- **AUDIT:** Design review against the Stripe route and FID-075: the crypto
  route refuses before reading config; the webhook has no code path that
  credits without a verified signature and a `finished` status; `fulfillTopup`
  returns `already_paid` on replay so double-credit is structurally
  impossible.
- **ADVERSARIAL:** A hostile delivery with a forged `x-nowpayments-sig` →
  400 before any DB read. A replay of a signed `finished` payload → claimed
  `processed`, `credited:false`. A `partially_paid` fixed-rate invoice → no
  credit, and its later `finished` is still claimable. An attacker who obtains
  only `NOWPAYMENTS_API_KEY` cannot enable sales (flag) and cannot forge IPNs
  (separate IPN secret).
- **CHANGE DELTA:** N/A (initial draft).

### Missed Questions

1. **Should the webhook honor the enable flag?** No — mirror Stripe: the
   webhook stays live whenever the IPN secret exists so an invoice created
   before a flag change still credits. The flag gates only new checkouts.
2. **Who chooses the crypto?** Omit `pay_currency` at invoice creation; the
   NOWPayments page lets the customer pick. Avoids currency assumptions and
   keeps `price_amount` fixed in USD.
3. **How is `price_amount` compared without float error?** Store micros;
   compare `Math.round(priceAmount * 100) * 10_000` against the stored micros.
   The gateway's own parse already produced exact cents.
4. **Who pays the NOWPayments fee?** `is_fee_paid_by_user: true`, so the
   credited price equals the listed price and the operator's margin is not
   silently eroded. Operator can revisit at review.
5. **What happens to an IPN for an order we never created?** Signed but
   unknown `order_id` → quarantine the claim and return 200 so NOWPayments
   stops retrying; the event is visible to the operator in the billing-events
   table.
6. **Does the sandbox share credentials with live?** No. Sandbox keys work
   against `api-sandbox`; the operator must set `NOWPAYMENTS_SANDBOX` to match
   the key pair. The suite uses live-shaped URLs only (its webhook is local).

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `4574fee` (implementation commit for this FID).
- [x] **File:line ranges:**
      `lib/nowpayments.ts` policy 23-46, config 62-93, base URL 96-101,
      invoice client 125-185, sortObjectDeep 192-209, signature 212-252,
      parse/classify 251-350; `app/api/account/topup/crypto/route.ts` POST
      20-101; `app/api/webhooks/nowpayments/route.ts` POST 31-176;
      `lib/store/topups.ts` getTopupById 201-212; `lib/store.ts` export 127;
      `app/account/page.tsx` lanes 74-96, banner 156-160, StatCard 174-179;
      `components/account/topup-card.tsx` TopupLane 13-19, TopupCard 21-127;
      `components/account/billing-history.tsx` labels 12-19;
      `lib/card-topups.ts` reason fix; `tests/nowpayments.test.mjs` 15 tests;
      `scripts/http-suite/checks.mjs` runNowpaymentsChecks 1652-1837,
      crypto 503 in runAuthChecks 288-312, wiring 1844.
- [x] **Gate output:** pasted in Verification Receipt (verify exit 0; lint 0/0;
      typecheck clean; 363 unit tests; 672 HTTP checks; build PASS).
- [x] **Reproducibility:** `npm run verify` on a clean checkout of the commit;
      the HTTP suite and recovery drill create disposable databases and a
      mock upstream, no network access required for the webhook path.
- [x] **Step statuses:** 1-9 implemented; step 9 doc records complete with
      this FID's closure (offering-evidence, SCOPE, launch-master, CHANGELOG).

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution (with Loop 2 corrections).
- [x] Typecheck/tests/lint pass with pasted tool output (Verification Receipt).
- [x] Production call-graph evidence: crypto lane endpoint is referenced by
      `app/account/page.tsx:82` (lane descriptor) and the suite; webhook
      callback is built by the crypto route (`ipnCallbackUrl`) and registered
      in the build route table; `getTopupById` is called by the webhook route
      (`app/api/webhooks/nowpayments/route.ts:123`) through the `lib/store`
      export; `runNowpaymentsChecks` is invoked in `runChecks`
      (`checks.mjs:1844`). No zero-caller additions.
- [x] FID status reflects the actual implementation state (verified; closed at
      archival).

### Loop 2 — Independent audit and self-correction

- **RED (audit findings after implementation):**
  1. `lib/nowpayments.ts` imported `server-only`, which makes the Node test
     runner throw at import ("This module cannot be imported from a Client
     Component module") — the new unit suite crashed (348 pass + 1 fail).
     Sibling config modules `lib/card-topups.ts` and `lib/stripe.ts` do not
     carry the marker and are unit-tested directly; no existing test imports a
     server-only module.
  2. The first draft specified `Authorization: Bearer <key>` for
     `POST /v1/invoice`. The NOWPayments API documenter shows invoice creation
     authenticates with `x-api-key`; Bearer is used only on payout endpoints.
     Also, the base URL was drafted with a `/v1` suffix; the client must
     append the path to an origin-only base URL.
  3. Stale USDC copy: `lib/card-topups.ts` still told customers the card lane
     reason "Direct USDC is the crypto launch lane" after the operator moved
     the launch lane to NOWPayments.
- **GREEN (fixes):**
  1. Removed `import "server-only"` from `lib/nowpayments.ts`. The module is
     only ever imported from server components and route handlers; the marker
     bought nothing and cost testability. `npm test` → 363 pass, 0 fail.
  2. `createNowpaymentsInvoice` sends `x-api-key`; `nowpaymentsBaseUrl`
     returns the origin; the client builds `${baseUrl}/v1/invoice`. Unit tests
     assert the exact header and URL.
  3. `lib/card-topups.ts` reason → "Prepaid credit opens through the crypto
     lane."; `tests/card-topups.test.mjs` asserts the crypto reference.
  4. `TopupLane.reason` typed `string | null` (null while a lane is
     available) — caught by typecheck (TS2322) and fixed.
  5. Success banner copy is lane-neutral and keeps the words the HTTP suite
     constrains ("signed", "webhook"); the subscription banner keeps "Stripe
     returned successfully" because subscriptions are Stripe-only.
- **AUDIT (double verification of the fixes):** unit suite green under the
  Node runner (not just typecheck); HTTP suite green on a booted server with
  real signature verification (forged 400, replay no-double-credit, mismatch
  quarantine, unknown-order quarantine, terminal failure, disabled-route 503);
  `npm run verify` exit 0.
- **ADVERSARIAL re-check:** the corrected auth header cannot leak the key into
  logs (header is never logged); the origin-only base URL plus explicit
  sandbox flag prevents live/sandbox confusion; the stale copy no longer
  promises a USDC lane that does not exist.
- **CHANGE DELTA:** small, targeted fixes; no oscillation (each finding fixed
  once and verified).

### Loop 3 — Final convergence

- **RED/GREEN/AUDIT/ADVERSARIAL/CHANGE DELTA:** Loop 2 fixes converged on the
  first pass with no re-opened findings. Deep audit of the final diff yields
  zero actionable improvements beyond the operator's live sandbox smoke test,
  which is operator territory by design. Termination criteria met: deep audit
  yields no further changes; full verify receipt captured.
- **Convergence:** 5 of 5 Five Questions answered for the lane:
  1. All cases: replays, tampering, partials, unknown orders, disabled policy
     with present credentials, sandbox/live split — covered by tests.
  2. Scales: identical store + claim machine as Stripe; no per-agent state.
  3. Hostile attacker: signature verification before any DB write; key never
     logged; flag independent of credentials.
  4. Maintainable in 2 years: one module per provider, mirroring the card
     lane; `getTopupById` is a store helper like its siblings.
  5. Industry standard: constant-time HMAC comparison, idempotent
     fulfillment, quarantine for mismatches, honest per-lane UI copy.

## Resolution

- **Closed Date:** 2026-10-31
- **Fix Description:** Added the NOWPayments crypto top-up lane: default-off
  `NOWPAYMENTS_TOPUPS_ENABLED` policy, origin-based sandbox/live base URL,
  fixed-rate USD invoice creation via `x-api-key`, HMAC-SHA512 IPN
  verification with recursive key sorting, claim-based idempotent fulfillment
  through the existing `fulfillTopup`, non-final statuses never claim,
  terminal failures mark the topup failed, unknown/mismatched orders
  quarantine, lane-aware TopupCard, provider column in billing history, and
  full unit + HTTP coverage (363 unit tests, 672 HTTP checks).
- **Tests Added:** `tests/nowpayments.test.mjs` (15 tests); HTTP suite crypto
  503 gate + 27 IPN webhook checks; card-topups copy assertion updated.
- **Verification Evidence:** `npm run verify` exit 0 — receipts pasted in the
  Verification Receipt section.
- **Archived:** 2026-10-31

## Lessons Learned

A payment lane is a decision boundary, not a credential: the enable flag and
the keys must be independent, and the webhook must survive flag changes so a
payment already in flight is never orphaned. The IPN signature canonicalization
is SDK-specific (recursive key sort, not the JSON.stringify replacer), and the
invoice endpoint authenticates with `x-api-key`, not Bearer — the documenter is
the authority over assumptions. Keep pure modules free of `server-only` so the
Node test runner can prove them, and guard UI copy with the same rigor as code:
the HTTP suite's copy assertions caught a stale "Direct USDC" promise that
would have shipped as a broken customer promise.
