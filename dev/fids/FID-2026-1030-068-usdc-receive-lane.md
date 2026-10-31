# FID: Direct-to-wallet USDC receive lane

**Filename:** `FID-2026-1030-068-usdc-receive-lane.md`
**ID:** FID-2026-1030-068
**Parent:** FID-2026-1030-044
**Severity:** high
**Status:** converged
**Created:** 2026-10-30 23:10
**Automation level:** 2
**YAGNI-Compliance:** Pending

## Summary

Accept USDC payments directly into a wallet the operator controls, with no
custodial payment processor. Credit is released only when a transfer is seen at
confirmation depth. The decision and its obligations are in
[the crypto payments decision](../../docs/crypto-payments-decision.md); this FID
covers the mechanism.

Step 0 is complete: the five mechanisms the lane depends on are proven offline,
with no RPC, no network and no private key. No money path, schema or call site
has been touched.

## Environment

- **OS:** Windows 11 host
- **Language/Runtime:** Node `v24.21.0`
- **Tool Versions:** npm `12.2.1`, `@scure/bip32` `2.4.0`
- **Commit/State:** `2484c1c`

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

Absent capability, not a defect. The gateway has only ever settled through
Stripe webhooks.

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

- `lib/crypto/derive.ts` (planned) — address derivation from an xpub
- `lib/crypto/transfer.ts` (planned) — log decoding, depth gating, payment keys
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

1. `implemented` — step 0 capability spike, six checks, offline.
2. `blocked` — operator inputs: chain/token confirmation, an xpub generated on
   the hardware wallet, and an RPC endpoint.
3. `blocked` — screening ruling: accept the exposure or budget a service.
4. `pending` — schema, derivation and decoding modules with unit tests.
5. `pending` — resumable watcher and the credit transaction.
6. `pending` — top-up UI showing address, exact amount and expiry.
7. `pending` — refund policy clause for a lane with outbound-only refunds.

### Verification

Unit tests for derivation, decoding, depth gating and idempotency; a disabled-path
test proving no credit without a confirmed transfer; and a recorded replay that
the same log cannot credit twice. The spike's assertions become
`tests/crypto-receive.test.mjs` when the modules land.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-30T23:12Z (step 0 only)
- usdc-receive-spike: exit 0 — 6/6 checks
- lint/typecheck/quality/build: recorded after the spike was added

## Perfection Loop

### Loop 1 — RED

- **RED:** Three of six checks failed on the first run with
  `hex string expected, got object`. The spike had assumed the curves v1 point
  API.
- **GREEN:** The installed `@noble/curves` v2 exposes `fromBytes`/`toBytes`, and
  `HDKey.publicKey` is a byte array. The helper now accepts both layouts.
- **AUDIT:** Rerun: 6/6 pass, including the external vector.
- **ADVERSARIAL:** Accepting both API layouts is mild compatibility debt. It is
  confined to a spike script and disappears when the derivation module lands with
  pinned dependencies.
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
  in one commit.
- [x] **File:line ranges:** `scripts/usdc-receive-spike.mjs`.
- [x] **Gate output:** spike 6/6; repository gates recorded in the receipt.
- [x] **Reproducibility:** `node scripts/usdc-receive-spike.mjs`.
- [x] **Step statuses:** one `implemented`, two `blocked` on operator inputs,
  four `pending`.

## Resolution

- **Closed Date:** not closed — step 0 only, committed as `b2790d1`.
- **Fix Description:** offline proof of the receive mechanism.
- **Tests Added:** No — the spike asserts directly; it becomes a test file when
  the modules land.

## Lessons Learned

Writing the spike first turned a design assertion ("we can derive addresses from
an xpub") into a checked fact in one command, and caught a library API mismatch
before it could be mistaken for a derivation bug.
