# InferHub price sheet

Capture: **2026-11-22 18:37 UTC**. Amounts are USD per 1M tokens. Two blends are
used: `1:1` (equal input and output) and `1:4`, the input-to-output mix a coding
workload actually produces. `1:4` is the column to read unless stated otherwise,
because InferHub bills output at roughly 4–5× input while the incumbent bills
both at one rate, and that asymmetry decides most of the winners below.

## 1. What is in this sheet

| Artifact | Rows | What it answers |
| --- | --- | --- |
| [`docs/data/inferhub-offers.csv`](../data/inferhub-offers.csv) | 265 | Every buyable InferHub offer, publisher-pinned: ask, next price tier, worst tier, official list, discount, context, cache, reasoning |
| [`docs/data/inferhub-price-sheet.csv`](../data/inferhub-price-sheet.csv) | 135 | One row per model identity with InferHub, our own upstream, and Apixo side by side, plus the winner at a 1:4 blend |
| [`docs/data/provider-prices.json`](../data/provider-prices.json) | — | The committed inputs: Apixo's published retail rates (2026-10-31) and our Apinex cost measured live on 2026-11-20 |

Regenerate both CSVs from a credential-free public payload:

```bash
curl -sS https://api.inferhub.dev/v1/models -o .scratch/inh-models.json
node scripts/inferhub-price-sheet.mjs .scratch/inh-models.json --out-dir docs/data
```

**What the InferHub column is not.** It is the cheapest *open ask* on the
marketplace, not a settled charge. The price a call actually settles at is
bounded by a per-model bid pinned in that account, and no bid exists yet, so
every InferHub figure here is provisional on two counts: the ask can move (today
`gemini-4-argon` moved from a $1.33 to a $4.60 blended ask between two captures
five hours apart), and the cheapest publisher can refuse the call, which drops
you to the next tier. No funded call, no pinned bid and no settlement have been
observed. Section 6 lists what this sheet therefore cannot prove.

## 2. The buy list: 265 offers, 24 publishers

Only 255 of them survive our own importer; the 10 refusals are image-output
offers, which `resale_free_pool: false` and the modality gate already reject.

| Reading | Value |
| --- | --- |
| Publishers | 24; largest are `cmc` 35, `ocg` 28, `cbcn` 25, `kiro` 19, `alitp` 17, `alicn` 16 |
| Offers priced below official list | all of them; median **30% of official**, hard cap 50% |
| Offers with a cache discount | 225 |
| Offers with **one** price tier (floor is the price) | **29** |
| Offers with 2–9 tiers (floor is provisional) | **236** |
| Cheapest blended 1:4 offer | `zai/glm-5.3-flash`, **$0.00043** |
| Median blended 1:4 offer | **$0.2772** |
| Tenth percentile | **$0.0117** |

The publisher cap is the reason the cheap end is so cheap: never more than half
of official, and usually less. It is also why the ladder exists — a publisher's
cheapest slot is finite, and the next slot is often far above it.

### 2.1 The cheap end, and the tier behind it

| Offer | Ask in/out | Blend 1:4 | Next tier | Tier jump |
| --- | --- | --- | ---: | ---: |
| `zai/glm-5.3-flash` | 0.00015 / 0.0005 | 0.00043 | 0.0344 | 80× |
| `mm/MiniMax-M3.1-Flash` | 0.00015 / 0.0006 | 0.00051 | 0.2443 | 479× |
| `zai/glm-4.6v` | 0.0003 / 0.0009 | 0.00078 | 0.0780 | 100× |
| `mm/MiniMax-M3` | 0.0003 / 0.0012 | 0.00102 | 0.4886 | 479× |
| `zai/glm-5.3` | 0.0014 / 0.0044 | 0.00380 | 0.0874 | 23× |
| `mv/mistral-medium-3-5` | 0.0015 / 0.0075 | 0.00630 | 0.0252 | 4× |
| `cb/deepseek-v4.1-flash` | 0.00345 / 0.0138 | 0.0117 | 0.0122 | 1.0× |
| `cb/hy3` | 0.00336 / 0.01392 | 0.0118 | 0.0124 | 1.0× |
| `cx/gpt-5.6-luna` | 0.0036 / 0.0216 | 0.0180 | 0.0190 | 1.1× |
| `cc/claude-haiku-5-5` | 0.0068 / 0.034 | 0.0286 | 0.2016 | 7× |
| `grok/grok-4.5` | 0.0198 / 0.099 | 0.0988 | 1.5028 | 15× |

Read the tier-jump column before pinning anything to the free tier. A model
whose floor is 479× below its next tier is a model whose cost becomes $0.49/M
the moment the cheap publisher is busy — which for a free tier is the whole
budget. `cb/deepseek-v4.1-flash`, `cb/hy3`, `cx/gpt-5.6-luna` and
`mv/mistral-medium-3-5` are the offers whose ladder is flat enough that the
cheap price is not a lottery. `zai/glm-5.3` and `zai/glm-5.3-flash` jump 23× and
80× but stay cheap in absolute terms, below what we pay today even at tier 2.

## 3. Cross-upstream: 135 model identities

| Verdict at a 1:4 blend | InferHub | our Apinex cost | Apixo |
| --- | ---: | ---: | ---: |
| Cheapest across all 135 identities, InferHub at its floor | 107 | 7 | 21 |
| Cheapest if the cheapest publisher is busy (InferHub at its next tier) | 102 | 7 | 26 |

The 107 overstates the advantage: 108 of those identities exist **only** on
InferHub, so it wins them by default. The honest split is on the overlaps.

### 3.1 Against what we already pay (15 identities)

Floor wins 6, next-tier wins 5, and the reason is structural: our upstream bills
`in = out`, so every output-heavy row flips back to it.

| Model | Ours | InferHub floor | InferHub next tier | Verdict |
| --- | ---: | ---: | ---: | --- |
| `glm-5-3-flash` | 0.050 | **0.00043** | 0.0344 | InferHub, 116× |
| `glm-5-3` | 0.150 | **0.0038** | 0.0874 | InferHub, 39× |
| `gpt-6-luna` | 0.075 | **0.0076** | 0.0084 | InferHub, 10× |
| `hy4-preview` | 0.300 | **0.0520** | 0.0542 | InferHub, 6× |
| `gpt-6-1-terra` | 0.170 | **0.0756** | 0.0798 | InferHub, 2× |
| `grok-4-7` | 0.300 | **0.0988** | 1.5028 | InferHub at floor only |
| `deepseek-v4-flash` | 0.050 | 0.0572 | 0.0686 | ours |
| `gemini-4-hydrogen` | 0.300 | 0.630 | 0.706 | ours |
| `claude-sonnet-5-5` | 0.400 | 0.571 | 2.033 | ours |
| `gpt-6-2-astra` | 0.500 | 0.605 | 0.638 | ours |
| `kimi-k3-1-pro` | 0.300 | 0.966 | 1.008 | ours |
| `claude-opus-5-5` | 0.500 | 1.142 | 2.184 | ours |
| `muse-spark-1-3` | 0.300 | 1.456 | 1.825 | ours |
| `gemini-4-argon` | 0.500 | 4.600 | 4.980 | ours |
| `claude-fable-5-2` | 1.000 | 16.128 | 16.800 | ours, 16× |

`gemini-3.8-flash` no longer exists on either side, which is its own note about
id churn.

### 3.2 Against Apixo's published rate (30 identities)

Floor wins **21 of 30**, median blended **$0.161 vs $0.275**. Next-tier wins 13
of 30, so 17 rows would cost more than Apixo's flat rate on a busy day, and at
the next tier the median flips to **$0.389** — dearer than Apixo. Apixo's flat
rate wins exactly where ours does — frontier output:

| Model | Apixo | InferHub floor | Apixo is cheaper by |
| --- | ---: | ---: | --- |
| `mimo-v2-6-flash` | 0.060 | 0.1006 | 68% |
| `kimi-k3` | 0.200 | 0.2898 | 45% |
| `claude-opus-4-6/4-7/4-8/5` | 0.900 | 1.428 | 59% |
| `kimi-k3-1-pro` | 0.250 | 0.966 | 286% |
| `gemini-4-argon` | 0.300 | 4.600 | 1433% |
| `claude-fable-5` | 0.900 | 20.160 | 2140% |

### 3.3 What InferHub adds that we cannot sell today (108 identities)

This is the part that costs nothing to have: no other upstream in the tree sells
these, and they are the cheapest rows on the sheet.

| Model | Offer | Ask in/out | Blend 1:4 | Publishers |
| --- | --- | --- | ---: | ---: |
| `minimax-m3-1-flash` | `mm/MiniMax-M3.1-Flash` | 0.00015 / 0.0006 | **0.00051** | 5 |
| `glm-4-6v` | `zai/glm-4.6v` | 0.0003 / 0.0009 | 0.00078 | 1 |
| `minimax-m2-5`, `-m2-7`, `-m3` | `mm/MiniMax-M*` | 0.0003 / 0.0012 | 0.00102 | 3 / 3 / 7 |
| `minimax-m2-5-highspeed` | `mm/MiniMax-M2.5-highspeed` | 0.0006 / 0.0024 | 0.00204 | 2 |
| `deepseek-v4-1-flash` | `cb/deepseek-v4.1-flash` | 0.00345 / 0.0138 | 0.01173 | 8 |
| `hy3` | `cb/hy3` | 0.00336 / 0.01392 | 0.01181 | 2 |
| `gpt-5-6-luna` | `cx/gpt-5.6-luna` | 0.0036 / 0.0216 | 0.01800 | 4 |
| `claude-haiku-5-5` | `cc/claude-haiku-5-5` | 0.0068 / 0.034 | 0.02856 | 1 |
| `mistral-medium-3-5` | `mv/mistral-medium-3-5` | 0.0015 / 0.0075 | 0.00630 | 1 |

## 4. Free, paid and subscription are properties of a provider, not of a model

This is the part that is easiest to get wrong, so it is stated before any
arithmetic. A free allocation belongs to **one provider's plan and to the
specific rows that plan flags**. It is not a quality tier, and it does not
travel: `glm-5.3` being free-pool on our current upstream tells you nothing
about `zai/glm-5.3` on InferHub, which is a paid offer at $0.0014/$0.0044. The
row that decides is `models.allow_free`, synced per provider and per model
(`lib/providers/catalog.ts:101`, `lib/model-groups.ts:80`), and the daily pool
is that one account's plan term (20M weighted tokens/day, 90% allocatable).

| Provider | Free allocation | Paid rows | Subscription rows | What that means for us |
| --- | --- | ---: | ---: | --- |
| Apinex (current default) | 20M weighted tokens/day, **11 flagged rows only** | 23 | 10 | the only source of genuinely $0 customer traffic we have |
| InferHub | unusable: no `free/` id appeared in today's public payload, and its Terms forbid reselling the free pool | **265 offers** | 0 — no plans, bids are per model | every row is a paid source (`credit` or `subscription` billing), never `free` |
| Apixo | none recorded | 43 at flat retail | 0 | paid only, behind a $50 gate |

Three consequences follow, and they bound what "launch on InferHub" can mean:

1. **No InferHub model can enter the `free` group.** Its `allow_free` column is
   false by construction, and the importer refuses `free/` ids outright with
   `resale_free_pool: 0`. A customer cannot draw an InferHub row from the daily
   allowance, because that allowance is Apinex's plan term, not ours to move.
2. **A giveaway on InferHub is a subsidy we buy, not an allowance we spend.** If
   an InferHub row is made free to customers, the token is paid for at full
   marketplace cost and handed over — marketing spend with a per-token meter,
   not a plan benefit. That is a legitimate choice; calling it "the free tier"
   is not, and the two should not share a budget line or a UI label.
3. **The honest intersection is overflow, not the allowance itself.** Our free
   pool has an exhaustion policy: either refuse, or serve the same traffic from a
   funded wallet. The second option is the one InferHub can improve, and it can
   improve it a lot — the business model prices that overflow at **$21.60/month**
   on our cheapest paid row; the same 18M tokens/day at InferHub's cheap floor is
   **$0.23/month**. It only works for models that exist on both sides
   (`glm-5.3`, `glm-5.3-flash`, `gpt-6-luna`, `hy4-preview`), because overflow to
   a different model is a different product, not the same request. Which of the
   11 flagged rows have an InferHub counterpart cannot be answered from this tree:
   the local catalog holds no rows, so that mapping needs a live sync first.

### 4.1 What an 18M-token/day giveaway would cost

The entry gate is genuinely zero: no fee, no published minimum deposit, and a
billed request floor of `$0.00001`. Nothing is bought in advance and nothing is
sunk. "Free launch" means "no gate", not "no cost" — tokens are always paid
for. If a giveaway of 18M tokens/day were funded from InferHub at a 1:4 blend:

| Served from | Blend /1M | 18M tokens/day | Per month | $20 lasts |
| --- | ---: | ---: | ---: | ---: |
| `zai/glm-5.3-flash` | 0.00043 | $0.008 | **$0.23** | 86 months |
| `mm/MiniMax-M3` | 0.00102 | $0.018 | $0.55 | 36 months |
| `zai/glm-5.3` | 0.00380 | $0.068 | $2.05 | 9.7 months |
| `gpt-6-luna` | 0.00756 | $0.136 | $4.08 | 4.9 months |
| `cb/deepseek-v4.1-flash` | 0.01173 | $0.211 | $6.33 | 3.2 months |
| `cx/gpt-5.6-luna` | 0.01800 | $0.324 | $9.72 | 2.1 months |
| `cc/claude-haiku-5-5` | 0.02856 | $0.514 | $15.42 | 1.3 months |
| `hy4-preview` | 0.05202 | $0.936 | $28.09 | 0.7 months |
| sheet median row | 0.27720 | $4.99 | $149.69 | 4 days |
| `claude-sonnet-5-5` | 0.57120 | $10.28 | $308.45 | 2 days |
| `claude-opus-5-5` | 1.14240 | $20.56 | $616.90 | 1 day |

So a cheap-row giveaway costs **under $10/month at 18M tokens/day** and a $20
deposit covers a year of it, while the same volume on a median or frontier row
costs one to two orders of magnitude more. The tier mix is the decision, not the
deposit — and this table is a subsidy budget, not the cost of the existing free
tier, which is $0 because Apinex grants it.

Three costs sit outside the table and they are not InferHub's: the Stripe and
NOWPayments fees on top-ups, the margin the free tier already consumes (20% of
paid revenue at the default markup), and the fact that a USDC balance is
non-refundable. A deposit is working capital, not inventory we can liquidate.

### 4.1 Does Apixo's $50 ever pay for itself?

Only if frontier output dominates. Apixo's flat rate beats InferHub's floor on
`claude-fable-5` by $19.26 per 1M blended tokens, so the $50 fee is recovered
after roughly **2.6M blended tokens** of that one model; on `claude-opus-4-6` the
gap is $0.53 per 1M, so recovery needs **~95M tokens**. Against our own upstream
the fee buys nothing at all: Apinex is already flat and already cheaper on those
same rows. A $50 non-refundable fee to reach a rate that is worse than what we
already pay is the whole argument against it.

## 5. What to enable first, and at what bid

Ordered by measured value, not by catalog size:

| Priority | Identity | Offer to buy | Bid to pin (in/out) | Why |
| --- | --- | --- | --- | --- |
| 1 | `glm-5-3-flash` | `zai/glm-5.3-flash` | 0.00015 / 0.0005 | 116× cheaper at the floor, still 1.5× cheaper at tier 2 |
| 2 | `glm-5-3` | `zai/glm-5.3` | 0.0014 / 0.0044 | 39× cheaper at the floor, still 1.7× cheaper at tier 2, 7 publishers |
| 3 | `gpt-6-luna` | `cx/gpt-6-luna` | 0.0018 / 0.009 | 10× cheaper and the ladder is flat (1.1×) |
| 4 | `cb/deepseek-v4.1-flash` | `cb/deepseek-v4.1-flash` | 0.00345 / 0.0138 | new identity, 8 publishers, flat ladder |
| 5 | `hy4-preview` | `cb/hy4-preview` | 0.020 / 0.060 | 6× cheaper, 4 publishers, ladder flat (1.04×) |
| 6 | `minimax-m3` | `mm/MiniMax-M3` | 0.0003 / 0.0012 | new identity, 7 publishers — **but a 479× tier gap** |
| Never as primary | `claude-fable-5*`, `claude-opus-5-5`, `gemini-4-argon`, `muse-spark-1.3`, `kimi-k3.1-pro` | — | — | 2× to 16× dearer than the flat-rate upstream |

Two rules fall out of the sheet. Pin the bid at the price you measured, because
the floor is not a contract. And if any InferHub row is given away, gate it to
offers whose next tier is within ~3× of the floor — otherwise a busy publisher
turns a $0.23 month into a $12 month without any change in traffic. That gate
matters more here than elsewhere, because a giveaway on a marketplace row is our
own money; there is no allowance behind it to absorb the ladder.

## 6. What this sheet does not prove

- No funded call was made, so no row here is a settled charge; every InferHub
  figure is an ask.
- No bid is pinned, so the "price charged" behaviour of a pinned bid is
  unverified.
- Tier-2 prices are read from the offer payload, not observed by being refused
  at tier 1.
- Alias collapsing is name-based (`canonicalModelKey`), so a matched identity is
  the same model *name*, not necessarily the same weights or context limit that
  another upstream serves under it.
- Apixo rates are a 2026-10-31 snapshot and Apinex costs a 2026-11-20 reading;
  neither was re-measured for this sheet, and the local database holds no newer
  catalog rows to re-measure from.
- The free-pool mapping is unknown for the same reason: which of Apinex's 11
  flagged rows have an InferHub counterpart cannot be read from this tree, so the
  overflow comparison in §4.1 is per-token arithmetic, not a routing plan.
- Marketplace Terms permit paid resale and forbid free-pool resale; the
  provenance of the capacity behind these publishers is not verifiable from the
  public surface, so a paid-resale scope ruling is still the gate on enabling
  the provider at all. See
  [`inferhub-upstream-audit.md`](inferhub-upstream-audit.md) §11.
