# FID: Direct-to-wallet USDC receive lane

**Filename:** `FID-2026-1030-068-usdc-receive-lane.md`
**ID:** FID-2026-1030-068
**Parent:** FID-2026-1030-044
**Severity:** high
**Status:** fixed
**Created:** 2026-10-30 23:10
**Automation level:** 2
**YAGNI-Compliance:** Pending

## Summary

Accept USDC payments directly into a wallet the operator controls, with no
custodial payment processor. Credit is released only when a transfer is seen at
confirmation depth. The decision and its obligations are in
[the crypto payments decision](../../docs/crypto-payments-decision.md); this FID
covers the mechanism.

Step 0 was recorded complete on 2026-10-30: the five mechanisms the lane depends
on are proven offline, with no RPC, no network and no private key. The receipt
did not reproduce on 2026-11-02 because the spike's three dependencies were
undeclared; they are declared now and the six checks pass (see the receipt
below). The pure derivation, transfer-decoding, depth-gating and payment-key
helpers now live in `lib/crypto/derive.ts` and `lib/crypto/transfer.ts`, with
direct unit tests. No money path, schema, RPC reader or call site has been
touched.

## Environment

- **OS:** Windows 11 host
- **Language/Runtime:** Node `v24.21.0`
- **Tool Versions:** npm `12.2.1`, `@scure/bip32` `2.4.0`, `@noble/hashes`
  `2.4.0`, `@noble/curves` `2.4.0` (exact dependencies; they were devDependencies
  while only the spike imported them and moved to runtime dependencies when
  `lib/crypto` landed. The original step-0 run used an undeclared local
  install.)
- **Commit/State:** `2a28552` plus the uncommitted extraction, dependency and
  test changes

## Detailed Description

### Problem

Cards work and are already live, but they cost 2.9% + 30¢ — about 8.9% on a $5
top-up — and every card payment can be reversed by a buyer who consumed the
service. A confirmed on-chain transfer costs the merchant nothing and cannot be
reversed by any counterparty.

The operator's constraints decide the shape: funds must land in a wallet they
hold keys for ("if it's not your keys, it's not your crypto"), and the flow must
be automated in code — track the transaction, then release spending when it
confirms. That rules out every custodial processor, and it also rules out
crediting on sight: a mempool transaction is replaceable.

### Expected Behavior

A top-up creates an invoice with a derived address, a fixed USDC amount and an
expiry. Credit appears only after the transfer reaches confirmation depth, is
consumed exactly once, and cannot be double-credited by a replay or a reorg.

### Root Cause

Absent capability, not a defect. When written, the gateway had only settled
through Stripe webhooks; FID-2026-1031-076 added the NOWPayments hosted lane on
2026-10-31, which is the launch collection path.

### Evidence

`node scripts/usdc-receive-spike.mjs` — 6/6 checks pass, exit 0:

```text
PASS  derivation matches a known vector — index 0 and 1 match; index 2 = 0x3c44cddd…29bc
PASS  xpub alone derives identical addresses — indexes 0, 1, 2 and 7 agree
PASS  addresses are unique and stable — stable per index, 25/25 distinct
PASS  Transfer log decoding is exact — topic constant verified; $25.00 decoded exactly; foreign payee rejected
PASS  credit is gated on confirmation depth — 1, 11, 12 and 300 confirmations behave correctly at depth 12
PASS  idempotency key is unique per log — stable, and distinct across log index and chain
```

Two results are load-bearing rather than confirmatory:

- Derivation reproduces the published Hardhat test vector at indexes 0, 1 and 2,
  so the implementation is correct against an external authority rather than
  merely self-consistent.
- The xpub alone produces byte-identical addresses to the seed, which is what
  makes the server key-free by construction instead of by discipline.

The Transfer topic is computed from the signature string rather than pasted, so
the canonical constant is verified rather than trusted.

## Impact Assessment

### Affected Components

- `lib/crypto/derive.ts` — pure address derivation from a seed, account or xpub
- `lib/crypto/transfer.ts` — pure log decoding, depth gating and payment keys
- `tests/crypto-receive.test.mjs` — direct mechanism tests, no operator input
- `lib/store/crypto-invoices.ts` (planned) — pending invoice with quote and expiry
- `scripts/crypto-watcher.mjs` (planned) — resumable reader over the RPC
- `app/api/account/topup/*` — a second payment method beside Stripe
- `lib/schema/*` — invoice and observed-payment tables

### Risk Level

- [x] Critical: this path moves real money into a wallet that cannot be reversed.

## Proposed Solution

### Approach

A narrow reader for one ERC-20 contract on one chain. The server holds an xpub
only; sweeps to cold storage are an operator action. Credit is one transaction
that flips the invoice to paid, writes the ledger entry and records the
`chain:txHash:logIndex` key, so the ledger and the chain agree or nothing moves.

Confirmation depth is a setting, not a constant, because a credit issued just
before a reorg must be identifiable.

### Steps

1. `implemented` — step 0 capability spike, six checks, offline; re-verified
   2026-11-02 with declared dependencies and now exercising the extracted
   `lib/crypto` modules.
2. `blocked` — operator inputs: chain/token confirmation, an xpub generated on
   the hardware wallet, and an RPC endpoint.
3. `blocked` — screening ruling: accept the exposure or budget a service.
4. `partial` — pure derivation, decoding, depth and payment-key modules landed
   with direct unit tests (`lib/crypto/`, `tests/crypto-receive.test.mjs`); the
   invoice/payment schema and RPC integration remain blocked on step 2's
   operator inputs.
5. `blocked` — resumable watcher and the credit transaction; blocked on the
   same inputs and step 4.
6. `blocked` — top-up UI showing address, exact amount and expiry; blocked on
   steps 1–2 and step 4.
7. `blocked` — refund policy clause for a lane with outbound-only refunds;
   blocked on the screening ruling and step 1.

### Verification

Unit tests for derivation, decoding, depth gating and idempotency; a disabled-path
test proving no credit without a confirmed transfer; and a recorded replay that
the same log cannot credit twice. The spike itself is pinned by
`tests/usdc-receive-spike.test.mjs`, which asserts the three declared runtime
dependencies and the six PASS lines; the extracted mechanism helpers are
exercised directly by `tests/crypto-receive.test.mjs` (16 tests). Schema,
watcher, credit transaction and UI tests remain future work.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/usdc-receive-spike.test.mjs
- gate: test tests/crypto-receive.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-30T23:12Z (step 0 only)
- usdc-receive-spike: exit 0 — 6/6 checks
- lint/typecheck/quality/build: recorded after the spike was added
- re-verified: 2026-11-02 — `node scripts/usdc-receive-spike.mjs` exit 0, 6/6
  checks, after declaring `@scure/bip32` 2.4.0, `@noble/hashes` 2.4.0 and
  `@noble/curves` 2.4.0 in `package.json`
- reproducibility failure observed 2026-11-02: the spike exited 1 with `none of
  @scure/bip32 exports HDKey` because the package was absent from
  `package.json`, `package-lock.json` and `node_modules`; commit `b2790d1` did
  not change the manifest
- regression test: 2026-11-02 — `node --test tests/usdc-receive-spike.test.mjs`
  exit 0; `npm test` 750 tests (749 pass, 1 skipped); `npm run verify` exit 0
- module extraction: 2026-11-02 — `node --test tests/crypto-receive.test.mjs
  tests/usdc-receive-spike.test.mjs` exit 0, 17 tests (16 helper cases plus the
  spike regression); `npm test` 766 tests (765 pass, 1 skipped); `npm run lint`,
  `npm run typecheck` and `npm run verify` exit 0 against `2a28552` plus the
  working-tree changes. The three packages are now exact runtime dependencies
  because `lib/crypto` imports them.

## Perfection Loop

### Loop 1 — RED

- **RED:** Three of six checks failed on the first run with
  `hex string expected, got object`. The spike had assumed the curves v1 point
  API.
- **GREEN:** The installed `@noble/curves` v2 exposes `fromBytes`/`toBytes`, and
  `HDKey.publicKey` is a byte array. The helper then accepted both layouts.
- **GREEN (2026-11-02 extraction):** The pure helpers moved to
  `lib/crypto/derive.ts` and `lib/crypto/transfer.ts`; the v2 point API is
  pinned and the dual-layout shim is gone.
- **AUDIT:** Rerun: 6/6 pass, including the external vector.
- **ADVERSARIAL:** The dual-layout shim was mild compatibility debt; it is gone
  now that the module pins v2. The remaining risk is treating these pure helpers
  as a working receive lane: there is still no RPC reader, schema or credit
  transaction.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. *Can a reorg un-credit a payment?* At low depth, yes — which is why depth is a
   setting and the credit key survives a replay.
2. *Does the server ever need a private key?* No. The xpub derives every address;
   sweeping is an operator action with the hardware wallet.
3. *What stops a stranger crediting themselves?* The invoice is bound to a
   derived address and an exact amount with an expiry; a transfer to our address
   from another intent is either a duplicate (key collision) or a review item.
4. *Does this replace Stripe?* No. It sits beside it; cards stay for buyers who
   want a card.

### Implementation Evidence

- [x] **Commit SHA:** `b2790d1` — the decision, the step-0 spike and this record
  in one commit. The 2026-11-02 extraction and tests are uncommitted
  working-tree changes on `2a28552`.
- [x] **File:line ranges:** `lib/crypto/derive.ts`; `lib/crypto/transfer.ts`;
  `scripts/usdc-receive-spike.mjs`; `tests/crypto-receive.test.mjs`;
  `tests/usdc-receive-spike.test.mjs`.
- [x] **Gate output:** spike 6/6 (re-verified 2026-11-02); direct mechanism
  tests 16/16; repository gates recorded in the receipt.
- [x] **Reproducibility:** `node scripts/usdc-receive-spike.mjs`,
  `node --test tests/crypto-receive.test.mjs` and
  `node --test tests/usdc-receive-spike.test.mjs`.
- [x] **Step statuses:** one `implemented` (step 1), one `partial` (step 4) and
  five `blocked` (steps 2–3 and 5–7 on operator inputs and the screening
  ruling); none deferred or skipped.

## Resolution

- **Closed Date:** not closed — step 0 implemented and committed as `b2790d1`;
  step 4 is `partial`; no money path exists.
- **Fix Description:** offline proof of the receive mechanism.
- **Tests Added:** Yes — `tests/usdc-receive-spike.test.mjs` runs the spike and
  asserts the declared dependencies and six PASS lines;
  `tests/crypto-receive.test.mjs` exercises 16 direct cases across the extracted
  modules. Schema, watcher, credit transaction and UI remain unwritten.

**Cutover review 2026-11-01.** At that date, no mechanism step had landed. The lane is still
blocked on four operator inputs: the chain and USDC token contract, an xpub
generated on the hardware wallet, an RPC endpoint, and a screening ruling
(accept the exposure or budget a screening service). The operator selected the
NOWPayments hosted-crypto lane for launch in the 2026-11-01 decision form
(§1.5), so the direct lane is not a launch path. The six-check offline spike
was the only evidence at that date; no schema, watcher, credit transaction or UI
exists, so nothing here is offered to customers.

**Module extraction 2026-11-02.** The pure helpers now live in
`lib/crypto/derive.ts` (seed, account and xpub derivation) and
`lib/crypto/transfer.ts` (Transfer decoding, confirmation depth and payment
keys). `tests/crypto-receive.test.mjs` covers 16 cases directly, so the
mechanism can be exercised without an RPC endpoint, xpub or token confirmation.
The spike imports the same modules, which removes the duplicated implementations
and the v1/v2 point-API shim. The three packages moved from devDependencies to
dependencies because `lib/crypto` is production code. The 2026-11-01 sentence
"No mechanism step has landed" is historical: schema, watcher, credit
transaction and UI still do not exist, the lane remains unoffered, and the four
operator inputs remain open. This is step 4 `partial`, not a working receive
lane.

**Reproducibility correction 2026-11-02.** The step-0 receipt was not
reproducible at `2a28552`: `node scripts/usdc-receive-spike.mjs` exited 1 with
`none of @scure/bip32 exports HDKey`. The spike imports `@scure/bip32`,
`@noble/hashes/sha3` and `@noble/curves/secp256k1`, and none was declared in
`package.json` or `package-lock.json`; `b2790d1` added the spike without a
manifest change, so the 6/6 result depended on a local install. All three are
now declared as exact dependencies (2.4.0; moved from devDependencies when
`lib/crypto` landed) and the spike passes 6/6 again.
The 2026-10-30 receipt is retained as historical evidence; the 2026-11-02
receipt is the reproducible one. That receipt is against `2a28552` plus the
uncommitted dependency and test changes; no commit was created in this pass.

**Ground-truth status correction 2026-11-02.** The original `converged` metadata
described the design before implementation. Step 0 and the pure helper slice in
step 4 now exist and have reproducible tests, so the record is `fixed` rather
than `converged`. This FID remains active because the invoice schema, RPC reader,
credit transaction, UI, chain/token/xpub/RPC inputs, and screening ruling are
not complete; it is not a working receive lane and is not closed.

## Lessons Learned

Writing the spike first turned a design assertion ("we can derive addresses from
an xpub") into a checked fact in one command, and caught a library API mismatch
before it could be mistaken for a derivation bug.
