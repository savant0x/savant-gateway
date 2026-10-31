# Offering evidence ledger

Date opened: 2026-10-30. Owner of the decisions below: the operator.
This ledger implements step 1–2 of FID-2026-1030-044: collect dated evidence,
separate an unknown value from a zero, and reconcile the existing economics
model. It does not approve an offering, a price, a limit or a spend budget.

## Evidence rules

- **Observed** means a dated reading from this repository or a named source.
  A local database reading is a local observation, never a live provider
  guarantee.
- **Configured** means a repository default. The deployed environment value may
  differ and must be read from the running configuration, not assumed.
- **Unknown** means no dated evidence was supplied. It is not zero, not a
  default, and not a research estimate.
- **Decision pending** means an operator ruling is required before activation
  or before a public claim changes.

## Current offering state

| Item | Value | State | Source / date |
| --- | --- | --- | --- |
| Default upstream | Apinex, slug `savant`, `https://api.apinex.bond/v1`, key variable `PROVIDER_KEY` | Observed | local `data/gateway.db` providers row, updated 2026-10-29T21:15:21Z; `docs/business-model.md` |
| Second upstream | CommandCode, enabled, `COMMANDCODE_API_KEY` unset, no synced catalog | Observed | local providers row; `docs/business-model.md` |
| Third upstream | Apixo, disabled at install, `APIXO_API_KEY` unset | Observed | local providers row; schema seed |
| Catalog rows | 45 total: 11 free-pool, 24 paid (24 priced and costed), 10 subscription-only | Observed | local `models` table, read 2026-10-30 |
| Dated economics report | 44 rows, 23 paid priced, generated 2026-10-29 23:02 UTC | Observed, date-stamped | `docs/business-model.md` generated section |
| Report drift | The local catalog gained one priced paid row after that report was generated | Observed | 45 rows today versus 44 in the dated report |
| Markup | 2500 bps (25%) | Configured and stored | `lib/pricing.ts`; local `settings` value `2500`; recompute applied 2026-10-31 under ruling 8 |
| Daily free pool | 20,000,000 weighted tokens/day | Configured | `.env.example` |
| Free allocation share | 9000 bps (90%) → 18,000,000 allocatable, 2,000,000 reserve | Configured | `.env.example`; `docs/business-model.md` |
| Per-account daily cap | 100,000 weighted tokens/day | Configured | `.env.example` |
| Free admission floor | Stop free calls below 1,000,000 provider-remaining tokens | Configured | `lib/free-pool.ts` defaults |
| Top-up bounds | Minimum $5, maximum $500, presets $10/$25/$50/$100 | Configured | `lib/topup-amount.ts` |
| Lifetime trial | Disabled, grant budget 0, no paired models | Configured; standing decision | `.env.example`; `docs/subscriptions-decision.md` |
| Subscription sales | Implementation retained, no plan on sale | Standing decision | `docs/subscriptions-decision.md` |
| Plans in local database | 0 rows | Observed | local `plans` table, read 2026-10-30 |
| Paid upstream wallet | $0.00, plan `free`, account RPM 15 | Observed, dated; not live | local providers row, synced 2026-10-29T21:15:21Z |
| Outstanding customer credit (local) | $5.00, held $0.00, one ledger row, zero paid top-ups | Observed | local `users`, `credit_ledger`, `topups`, read 2026-10-30 |
| APInex partner response | Provider offers support for Savant Code as a foundation customer; exact commercial/resale terms are unconfirmed | Provider-supplied evidence | Email supplied by operator 2026-10-30; see below |
| Confirmed per-model upstream rates | — | Unknown | Synced values exist, but no dated provider rate-card confirmation is recorded |
| Payment processing fee | — | Unknown | NOWPayments fee schedule not yet read; invoice created with `is_fee_paid_by_user: true` (see customer payment lane below) |
| Refund/dispute reserve | — | Unknown | No operator policy recorded |
| Monthly fixed operating cost | — | Unknown | Hosting selection belongs to FID-057 |
| Paid upstream spend budget | — | Unknown | Operator funding decision |

## Reconciliation of the existing model

The measured inputs are from the dated report; the fee and fixed-cost inputs are
unknown, so the result is a formula, not an approved number.

Let `m` be gross margin on revenue, `f` the payment-processing rate, `E` the
monthly free-token exposure, and `F` monthly fixed operating cost. Revenue must
satisfy:

```text
required paid revenue = (F + E) / (m − f)
```

Measured today: `m = 20.2%` on paid rows (the 2500-bps markup recomputed
2026-10-31 under ruling 8 yields 20% at the formula level; the report blends to
20.2% including the manual row), and `E` is $81.00/month at the median paid row,
$21.60
at the cheapest and $1,080 at the priciest. With `F` and `f` unknown, the only
honest statement is:

| Fee assumption | Required revenue, median exposure | Required revenue, worst-row exposure |
| --- | ---: | ---: |
| No processor fee (`f = 0`) | $401.00 | $5,346.53 |
| 2.9% (`f = 0.029`, research illustration only) | $468.21 | $6,242.77 |

Neither row is a plan. The 2.9% value is an unapproved research assumption shown
only so the sensitivity is visible; a real fee schedule must replace it.

The outstanding customer credit of $5.00 is a service liability, not revenue:
it must remain deliverable from the funded upstream or refundable under the
approved policy. It cannot be counted as operating margin.

## Provider clarification supplied 2026-10-30

The operator supplied an email response from Team APInex, dated October 30,
describing the complimentary 20M allowance as an introductory integration
sandbox pool attached to the master provider account. It is not 20M per user.
The response describes commercial production as PAYG wholesale per million
tokens with selectable RPM tiers and commercial routes. Those statements do
not establish this account's funded balance, a contracted RPM ceiling, exact
per-model rates, or specific resale terms. Claims about fixes in APInexGate
are not evidence about this independently built gateway's implementation.

Operator steering after supplying the email: daily trial credits with allocation
from the shared resetting pool, aligned with actual API values. Token credits
are weighted-token usage allowances, separate from prepaid dollar credit. The
pool and safety reserve are shared across activated users; paid inference still
requires a funded wallet. This does not assert commercial permission to sell
the sandbox pool or activate the separate lifetime-trial system.

Read-only live account observation 2026-10-30 15:42:13 UTC: balance $0.00,
RPM 15, plan FREE, 0 / 20,000,000 used, resets_at_utc October 31 00:00 UTC.
These are dated observations, not permanent configured capacity.

## Conservative traffic position (account constraints)

Paid upstream inference can only be served from a funded provider wallet. The
last recorded local wallet reading is **$0.00**, and no newer funding evidence
exists. The conservative paid-traffic cap is therefore **zero paid upstream
spend** until a funded balance is observed and an operating reserve is set.
Free-pool traffic remains bounded by the upstream daily allowance, the 90%
allocation, the per-account cap and the provider-remaining floor; exhaustion is
a refusal, not an overdraft.

This is the cap that follows from the evidence. It is not a decision to sell
nothing; it is the position until the funding input exists.

## Operator rulings recorded 2026-10-31

The operator reviewed the published catalog and landing page and supplied these
rulings directly. They are dated decisions. The configured values they approve
are read from this repository; nothing below re-derives them.

1. **Launch mode — daily shared free share, no lifetime trial.** Free access is a
   daily share allocated from available upstream inference with a held-back
   reserve, not a lifetime grant. `TRIAL_ENABLED` stays `false`.
2. **Paid catalog and prices — approved as configured and published.** The 24
   priced paid rows (23 in the public catalog) and their sell prices are the
   approved offering. The landing page and `/models` catalog are the
   authoritative display; no separate price table is required.
3. **Resale — the upstream provider is a resell programme.** Resale permission
   follows from the operator's reseller enrollment. The synced cost column is the
   per-model rate card and the configured markup is the sell basis.
4. **Payments — crypto only, no refunds.** USDC received directly to an operator
   wallet is the only launch payment method. Customer payments are not refunded;
   the remedy path is service credit.
5. **Budget — $150 to activate the system.** The upstream wallet is funded with
   $150 before paid inference is admitted.
6. **Savings claims — approved as published.** The landing page's per-model
   comparison against the public list may be published as it stands.
7. **Fiat permitted for customers; crypto-first is sequencing.** The operator
   is not opposed to customer card payments; crypto was chosen only because it
   was easier to start there. The launch lane is NOWPayments-hosted crypto
   invoices; card top-ups stay gated off by `CARD_TOPUPS_ENABLED=false` and may
   be reopened later as a second lane with Stripe credentials plus the flag.
8. **Sell markup — 2500 bps (2.5×).** The operator ruled the catalog markup at
   2.5× over the synced rate card (down from the 3.0× discussion baseline; up
   from the configured 3000-bps default). At 2.5×, 17/19 OpenRouter-matched
   paid rows remain cheaper than OpenRouter; `glm-5.3-flash` and one further
   row price above OpenRouter and are handled separately. FID-044 tracks the
   settings/constant update and catalog recompute.

## Verified upstream platform facts (2026-10-31)

Read from `https://apinex.bond/resell` (client-rendered bundle) and
`https://apinex.bond/api/public/models` at 2026-10-31T14:21Z. These are the
resell programme's own statements, not local assumptions.

- **Resell model.** One `sk-apx.` upstream key imports the paid and `free/*`
  catalog at wholesale base rates; the reseller sets its own `$ / 1M` prices and
  keeps the margin. The programme markets `2x–5x` markup and wholesale rates
  "up to 10x cheaper" than direct vendor APIs.
- **Balance unit.** Top-ups are USD at `$1 = 1,000,000` balance tokens, and
  models and tools share one balance. A balance token is therefore one
  micro-dollar, the same unit the gateway already stores.
- **Free allowance.** It is a weighted-token allowance, not a wallet charge:
  `allowance_tokens = ceil((input + output) × weight)` and
  `wallet_balance_charge = 0`. Subscriptions raise or remove the daily
  free-model allowance.
- **Catalog.** 44 rows in the public feed, `fromDollarsPer1M: 0.04`. Paid rows
  carry `allowFree: true`; `free/*` rows carry `weight` and may carry
  `allowFree: false` (subscription-only).
- **Rate-card reconciliation.** Eight spot-checked paid rows match the upstream
  published rate exactly (`deepseek-v4-flash` 0.05, `deepseek-v4-pro` 0.07,
  `gpt-6-astra` 0.50, `gpt-6.1-sol` 0.30, `gpt-6.1-terra` 0.17,
  `gemini-4-argon` 0.60, `claude-opus-5.5` 0.50, `claude-fable-5.1` 2.00), and
  every automatic sell price is exactly `cost × 1.3` at the stored `3000` bps;
  the catalog was recomputed to `cost × 1.25` at `2500` bps on 2026-10-31 under
  ruling 8, so the synced cost column remains the rate card and the published
  catalog is arithmetic over it.
- **Free-share scope consequence.** Because the upstream marks paid rows
  `allowFree: true`, spending the daily share on paid models is permitted
  upstream and would be a local admission change only. The operator ruled
  free-pool models only, so no admission change is made.

### Reserve derivation

The wallet funds paid inference only; free traffic charges it nothing. With
cards disabled and the USDC lane not yet live, no new customer-credit liability
accrues, so the wallet reserve is a credit-liability buffer rather than a
free-capacity reserve. The free-capacity reserve is already the 10% held back
from the 20M weighted-token daily allowance (2M tokens).

Proposed, not yet confirmed: **$50 reserve, alert at $50, hard stop at $25**.
That holds one third of the $150 unspent, covers ten times the current $5.00
outstanding credit, and still leaves $100 of paid working capital.

### Customer payment lane (NOWPayments, 2026-10-31)

The operator identified NOWPayments (`https://nowpayments.io/`) as the payment
processor; APInex's own checkout uses NOWPayments invoices
(`createTopup` → `invoiceUrl`; analytics channel `nowpayments`; UI "USDT, BTC,
ETH and more"). FID-2026-1031-076 builds the gateway lane from the documented
contract: `POST /v1/invoice` creates a fixed-rate USD invoice
(`price_amount`, `price_currency`, optional `pay_currency`, `order_id`,
`ipn_callback_url`, `success_url`, `cancel_url`), and the IPN webhook is signed
with HMAC-SHA512 over the recursively key-sorted JSON body
(`x-nowpayments-sig`), with `finished` the settled status that releases credit.
The exact NOWPayments fee schedule is **Unknown**; the invoice is created with
`is_fee_paid_by_user: true` so the customer covers the processor fee and the
credited price equals the listed price. Settlement is non-custodial to an
operator-chosen outcome wallet, which keeps the provider-funding lane (upstream
wholesale) and the customer-collection lane (NOWPayments) separate.

## Still open after these rulings

- **Free-share scope.** Whether the daily share is spendable on paid-group models
  or only on the 11 `allow_free` rows. Today `isFreeCall` admits only
  `allow_free = 1`, so a paid model with no credit returns a credit error.
- **Operating reserve and low-balance threshold**, as absolute dollars derived
  from the $150 funding decision.
- **Payment-path consequence.** Ruling #4 named direct USDC as the launch lane;
  ruling #7 and the NOWPayments facts above supersede the processor choice.
  FID-2026-1031-076 (NOWPayments invoice lane) is the launch payment path;
  FID-2026-1030-068 (direct USDC) is deferred behind it. The no-refund remedy
  path (service credit) is unchanged.
- **No-refund terms.** The published policy still describes a manual Stripe
  refund and must be rewritten as a new immutable version before launch.
- **Provider rate-card confirmation.** The resell programme establishes
  permission; it does not by itself prove that every synced cost row matches the
  provider's current published rate.

Until the four implementation questions above are answered, the activation paths
stay as they are: trial disabled, no plan on sale, and no funded paid inference
claimed.
