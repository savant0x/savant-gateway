# Crypto payments — direct-to-wallet first, processor second

Decision date: 2026-10-30. Status: **design recorded, not implemented.**
This document decides *how* to accept crypto if we do, and what it costs. It
does not authorise a build, and nothing here activates a payment method.

## The question the operator actually raised

Two constraints came from the operator, in order:

1. "The payment has to be mechanically confirmed with the tx in my wallet" —
   credit is released on a verified on-chain transfer, not on a processor's
   assertion.
2. "Stripe is a LOT more hoops and regulations vs accepting fiat" — the
   stablecoin path is gated onboarding we do not currently need for cards.

Both are correct, and they point the same way. Constraint 1 is satisfied by
Stripe too — its settlement provider confirms on-chain before a payment reports
`paid` — but only by a third party, and constraint 2 says the gatekeeper is
itself the cost. The difference between the options is therefore **custody**,
not confirmation strength: whose wallet the transfer lands in decides who holds
the asset, the tax basis and the recovery problem.

## What the existing payment path already guarantees

Measured, not assumed:

- `app/api/account/topup/route.ts` creates a Checkout session **without**
  `payment_method_types`, so Stripe uses dashboard-configured dynamic payment
  methods. Enabling a method there is configuration, not code.
- `app/api/webhooks/stripe/route.ts:133-134` already accepts
  `checkout.session.completed` **and** `checkout.session.async_payment_succeeded`,
  and `topupFromSession` (`:102-118`) refuses to credit unless
  `session.payment_status === "paid"`, the amount matches exactly and the
  currency matches. An async method that completes unpaid fails closed.
- `lib/payment-events.ts` claims each provider event id once with a grace window,
  so a duplicate delivery cannot credit twice.
- `lib/store/topups.ts` already carries a generic `provider` and `provider_ref`,
  so a second payment source was anticipated by the schema.
- `lib/topup-amount.ts` caps a top-up at $5–$500 and credits are not
  transferable or cashable.

The principle the operator wants — *earn the credit only on verified payment* —
is already the code's principle. Direct receipt makes the evidence direct. It
does not make the surrounding problem smaller.

## Options measured

| Option | Fee on $5 | Fee on $500 | Custody | Gatekeeper | US |
| --- | --- | --- | --- | --- | --- |
| Cards (live today) | ~8.9% | 2.96% | — | none | yes |
| Direct to our wallet | ~0% (sender pays gas) | ~0% | **ours** | none | yes |
| Stripe stablecoins | 1.5% (0.8% promo to 2027-01-01) | 1.5% | Stripe/Paxos/Bridge | **approval** | yes, **not NY** |
| NOWPayments | 0.9–1.5% + 3 network fees | 1%–1.5% | **custodial by default** | account | yes |
| BitPay | 2% + $0.25 = **7%** | 2.05% | BitPay | KYC/KYB | yes |
| CoinGate | 1% + €0.50 payout | 1% | CoinGate | account | **no — US unsupported** |
| Coinbase Commerce | — | — | — | — | **retired 2026-03-31** |
| BTCPay Server | 0% | 0% | **ours** | none | yes |

Card pricing is the existing Stripe standard 2.9% + 30¢; the card row is present
because it is the incumbent being displaced at small ticket sizes, not a
candidate.

Three findings remove options outright:

- **Coinbase Commerce no longer exists.** It was folded into Coinbase Business
  and the Commerce portal became inaccessible after 2026-03-31; the successor is
  US/SG-only, custodial, and USDC-only today.
- **CoinGate does not support US merchants**, and discontinued USDT/Dai under
  MiCA, leaving USDC only.
- **BitPay's fixed fee is fatal here.** `2% + $0.25` is 7% on a $5 top-up; it only
  breaks even against a flat 1% processor around $25.

## Decision

**Primary: direct receipt into our own wallet, USDC on Base.** **Optional
later: Stripe stablecoins**, if a card-only checkout is observed costing us
conversions we would rather keep.

Direct receipt is chosen on the operator's two constraints, not on fee alone:
there is no gatekeeper to approve us, no settlement provider's terms to accept,
no geographic carve-out, and the credit is released against a transfer we can
verify ourselves. The price of that independence is custody, and the sections
below are honest about it rather than treating it as a footnote.

### Which processor: none

The operator's position settles the vendor question: "if it's not your keys, it's
not your crypto", and a custodial platform reintroduces exactly the account
freezes and platform risk that owning the wallet avoids. So there is no crypto
payment processor in this design. The receive wallet is the integration surface.

That leaves one dependency, and it is not custody: a **chain RPC endpoint**
(Alchemy, QuickNode, a public node). It answers `eth_getLogs` for our addresses
and cannot move funds. Using it is like using DNS — it can refuse to serve us,
and it cannot spend our money.

Two ways to build against that:

- **Self-built watcher** (chosen): a narrow reader for one ERC-20 contract on one
  chain. Small enough to audit, and it fits the existing single-process,
  persisted-cursor model.
- **Self-hosted BTCPay Server**: the same no-custodian model with invoices,
  webhooks and address derivation already solved. Right answer for Bitcoin and
  Lightning specifically; its stablecoin support is plugin-dependent and was not
  verifiable during research, so it is not the starting point for USDC.

### Two things "your keys" does not buy

1. **USDC is an issuer-controlled token.** Circle can freeze balances at an
   address, and has a blocklist for that purpose. Holding the private key means
   Circle cannot take the tokens from us, but a tainted balance can still become
   unusable. Owning the wallet removes the *platform* risk; it does not make the
   *token* censorship-resistant. Mitigations: screen incoming transfers, keep the
   hot balance small, and sweep and convert promptly rather than accumulating.
2. **Fiat still has to come from somewhere.** Upstream capacity is bought in
   dollars, so converting received stablecoins is a real step, and it happens at
   an exchange account. That is the one place a third-party platform reappears —
   as a converter of our own funds, not as a custodian of customer payments.

### What direct receipt does remove

Chargebacks. Card payments let a buyer dispute a charge after consuming the
service, and "the model gave a bad answer" is exactly the kind of complaint that
becomes a chargeback, an account flag or a payment-processor review. A confirmed
on-chain transfer cannot be reversed by any counterparty. The trade is that a
genuine complaint has no reversal mechanism either, so the remedy is ours to
offer — service credit rather than refunds, which is already the posture in
`docs/policies/`. Irreversible payment plus no remedy is the highest-friction
combination available; keep the credit path real.

### Address and key design

- One **xpub** per chain lives in the server environment. Each top-up derives a
  unique receive address. **The server never holds a spending key.**
- Sweeps to a cold wallet are a scheduled operator action, not server code, so
  a compromised application cannot move funds.
- No address is reused across customers, so a mis-sent transfer is attributable
  to one intent instead of colliding with the next payer's $25.

### Confirmation flow

1. Customer requests a top-up for $N. A `topups` row is created with
   `provider = 'usdc-base'`, the quoted USD amount, the USDC amount, the rate
   snapshot, a quote expiry, and the derived address.
2. Customer transfers the exact USDC amount to that address.
3. A watcher reads ERC-20 `Transfer` logs for the derived address from a
   **persisted cursor**, so a restart replays instead of missing a payment.
4. Credit is released only after the configured confirmation depth is reached.
5. Idempotency key is `chain:txHash:logIndex`, unique in the database, so a
   reorg replay or a double-delivered log cannot credit twice.

### Edge cases that need a written answer before code

- **Underpayment** — credit pro-rata, or hold for review? Pro-rata is honest and
  matches the exact-amount ledger; holding blocks a paying customer.
- **Overpayment** — credit the quoted amount, record the surplus as an operator
  adjustment. Never silently keep it.
- **Expired quote** — accept within a grace window at the quoted rate, then hold
  for review, because the USD value moved.
- **Wrong token or wrong chain to a derived address** — detectable, and only
  recoverable with that chain's key. Documented support path, no automatic credit.
- **Reorg below the confirmation depth** — the credit must be reversible; this is
  why depth is a setting, not a constant.

## Obligations this transfers to us

Not licences — obligations. They exist whether or not a processor is involved in
the *choice*, and they are why Stripe's gate is not the only cost:

1. **Tax basis.** Receiving crypto for services is ordinary income at fair market
   value, and the receipt becomes the basis (`IRS Notice 2014-21`; IRS FAQ A9,
   A12, A13). Every later conversion is a separate disposition. Today we receive
   no crypto at all, so none of this machinery exists.
2. **Records.** Per sale: USD price, coin amount, rate snapshot, tx hash, and
   eventual conversion proceeds. Form 1099-DA reporting now reaches processors of
   digital asset payments and custodial venues, so receipts must reconcile to any
   1099-DA rather than being counted twice.
3. **No de minimis relief yet.** The Digital Asset PARITY Act was still in
   committee in late 2026; assume full treatment.
4. **Sanctions screening is ours.** No processor screens incoming funds. This is
   a real exposure with self-custody, and a commercial screening service is the
   usual control.
5. **Refunds become outbound transactions** we pay gas for, at whatever the rate
   is then. `docs/policies/` currently says a money refund is a manual Stripe
   dashboard action; a crypto lane needs its own denomination and window.
6. **Money transmission: not us, with a caveat.** A licensed processor is the
   transmitter; a merchant accepting crypto for its own services is not, whether
   via a processor or self-custody (FinCEN's integral-to-the-sale exclusion;
   CA DFPI's 2021 opinion). The caveat is the *prepaid access* category: closed
   loop, $2,000/day/person safe harbour, and our credits are non-transferable and
   capped at $500, which points the right way. A FinCEN/BSA review is the
   operator's call, not a code decision.
7. **Illinois.** The Digital Asset Tax Act (0.2% on digital asset business
   activity) is enjoined to 2027-07-01, and its draft rules reach payment
   processors. Watch item, not an action.

## Why not the processors

- **NOWPayments** defaults new accounts to custody — the exact thing this
  decision avoids — and charges three network fees on top of commission. Its
  signed-IPN page was not retrievable during research, so the signature scheme is
  corroborated but not primary-verified.
- **BTCPay Server** has the same custody model we are choosing, but it exists to
  solve Bitcoin, where cheap small tickets mean Lightning. If BTC demand appears,
  BTCPay is the right answer for that lane specifically.
- **Stripe stablecoins** remains the cheapest path *if* we ever prefer not to
  hold the asset: gas is sponsored, settlement is USD, and the ledger's
  exact-amount contract needs no change at all. It is deferred, not rejected.

## What is needed from the operator before a build

1. A chain and token decision — this document assumes **USDC on Base** for gas
   cost and wallet support; Polygon or Solana are viable alternatives.
2. An **xpub** for that chain, generated on a hardware wallet. The private keys
   stay offline.
3. An RPC endpoint (Alchemy, QuickNode or similar) for the watcher.
4. A ruling on screening: accept the exposure, or budget a screening service.
5. A refund policy addition for a lane where refunds are outbound transfers.

## Revisit criteria

Reopen the Stripe stablecoin option when any of these is true:

- The watcher's operational burden (RPC outage, reorg, miss) costs more than the
  1.5% it avoids.
- Concentration risk in a hot receive path becomes unacceptable without a
  processor's screening and settlement.
- A card-only checkout is measurably losing crypto-native customers who would
  have paid 1.5% and settled in USD.
