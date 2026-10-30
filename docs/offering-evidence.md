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
| Markup | 3000 bps (30%) | Configured and stored | `lib/pricing.ts`; local `settings` value `3000` |
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
| Resale permission from Apinex | — | Unknown | No dated written permission is recorded |
| Confirmed per-model upstream rates | — | Unknown | Synced values exist, but no dated provider rate-card confirmation is recorded |
| Payment processing fee | — | Unknown | `docs/research/` suggests card fees; research is not a contract |
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

Measured today: `m = 23.2%` on paid rows (30% markup yields 23.08% of revenue,
rounded in the report), and `E` is $81.00/month at the median paid row, $21.60
at the cheapest and $1,080 at the priciest. With `F` and `f` unknown, the only
honest statement is:

| Fee assumption | Required revenue, median exposure | Required revenue, worst-row exposure |
| --- | ---: | ---: |
| No processor fee (`f = 0`) | $349.14 | $4,655.17 |
| 2.9% (`f = 0.029`, research illustration only) | $399.01 | $5,320.20 |

Neither row is a plan. The 2.9% value is an unapproved research assumption shown
only so the sensitivity is visible; a real fee schedule must replace it.

The outstanding customer credit of $5.00 is a service liability, not revenue:
it must remain deliverable from the funded upstream or refundable under the
approved policy. It cannot be counted as operating margin.

## Conservative traffic position

Paid upstream inference can only be served from a funded provider wallet. The
last recorded local wallet reading is **$0.00**, and no newer funding evidence
exists. The conservative paid-traffic cap is therefore **zero paid upstream
spend** until a funded balance is observed and an operating reserve is set.
Free-pool traffic remains bounded by the upstream daily allowance, the 90%
allocation, the per-account cap and the provider-remaining floor; exhaustion is
a refusal, not an overdraft.

This is the cap that follows from the evidence. It is not a decision to sell
nothing; it is the position until the funding input exists.

## Operator decisions required

Each item needs a dated ruling; the engineering work can then apply it through
the existing settings, pricing and model helpers.

1. Free versus lifetime-trial offering at launch, and whether the daily shared
   allocation remains the public free path.
2. Approved paid models and sell prices, or approval to publish the current
   synced catalog at the configured markup.
3. Dated Apinex resale permission and confirmation of the per-model rate card,
   including whether identical input/output rates are correct.
4. Payment-processing fee schedule, minimum top-up, refund/dispute reserve and
   credit-expiry policy.
5. Paid upstream budget, operating reserve and low-balance threshold.
6. Whether public savings claims may be published, given that synced costs are
   arithmetic evidence rather than a confirmed provider rate card.

Until 1–6 are recorded, the activation paths stay as they are: trial disabled,
no plan on sale, and no funded paid inference claimed.
