# Sandbox pricing economics report

Generated: 2026-11-04T00:23:02.419Z
Catalog: aws-0-us-east-1.pooler.supabase.com/postgres (read-only snapshot)
Scenario: 1M in + 1M out per row, not realized traffic
Target margin: 30.0% · rounding: micro
Default markup: 25.0% · review threshold: 25.0%
Report-only: no price was changed. Approval remains an explicit operator action.

## Summary

| Class | Rows |
| --- | ---: |
| free | 11 |
| subscription | 10 |
| unknown | 0 |
| stale | 0 |
| blocked | 0 |
| review-required | 0 |
| safe | 23 |

Modeled paid scenario profit: $3.33 now → $5.71 at the recommendation ($2.38 delta).

## Highest-impact modeled price changes

Ranked by absolute modeled profit movement at 1M in + 1M out per row. Includes safe and review-required rows; unchanged recommendations are excluded.

| Model | Class | Route | Current sell / 1M | Recommended / 1M | Move | Scenario profit now → after | Δ modeled |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| Claude Fable 5.1 | safe | savant | $2.50 / $2.50 | $2.86 / $2.86 | increase 14.3% | $1.00 → $1.71 | +$0.7143 |
| Gemini 4 Argon | safe | savant | $0.7500 / $0.7500 | $0.8571 / $0.8571 | increase 14.3% | $0.3000 → $0.5143 | +$0.2143 |
| Claude Opus 5.5 | safe | savant | $0.6250 / $0.6250 | $0.7143 / $0.7143 | increase 14.3% | $0.2500 → $0.4286 | +$0.1786 |
| Gpt 6 Astra | safe | savant | $0.6250 / $0.6250 | $0.7143 / $0.7143 | increase 14.3% | $0.2500 → $0.4286 | +$0.1786 |
| Claude Sonnet 5.5 | safe | savant | $0.5000 / $0.5000 | $0.5714 / $0.5714 | increase 14.3% | $0.2000 → $0.3429 | +$0.1429 |
| Kimi K3.1 Pro | safe | savant | $0.3750 / $0.5000 | $0.4286 / $0.5714 | increase 14.3% | $0.1750 → $0.3000 | +$0.1250 |
| Gpt 6.1 Sol | safe | savant | $0.3750 / $0.3750 | $0.4286 / $0.4286 | increase 14.3% | $0.1500 → $0.2571 | +$0.1071 |
| grok-4.7 | safe | savant | $0.3750 / $0.3750 | $0.4286 / $0.4286 | increase 14.3% | $0.1500 → $0.2571 | +$0.1071 |
| Hy4 Preview | safe | savant | $0.3750 / $0.3750 | $0.4286 / $0.4286 | increase 14.3% | $0.1500 → $0.2571 | +$0.1071 |
| Muse Spark 1.3 | safe | savant | $0.3750 / $0.3750 | $0.4286 / $0.4286 | increase 14.3% | $0.1500 → $0.2571 | +$0.1071 |

## Catalog sources

| Provider | Key variable | Models | Synced | Enabled |
| --- | --- | ---: | --- | --- |
| savant | PROVIDER_KEY | 44 | 2026-11-03T23:49:29.156Z | yes |
| commandcode | COMMANDCODE_API_KEY | 0 | never | yes |
| apixo | APIXOAI_API_KEY | 0 | never | no |

Provider key presence is not inferred here; the deployed Admin Diagnostics page is that evidence.

## Review queue (highest impact first)

| Model | Route | Change | Current sell / 1M | Recommended / 1M | Explanation |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | No review-required row. |

## All catalog rows

| Class | Model | Access | Cost source | Route | Cost in/out | Sell in/out | Margin in/out | Scenario profit |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| safe | Claude Fable 5.1 | paid | synced | savant | $2.00 / $2.00 | $2.50 / $2.50 | 20.0% / 20.0% | $1.00 |
| safe | Gemini 4 Argon | paid | synced | savant | $0.6000 / $0.6000 | $0.7500 / $0.7500 | 20.0% / 20.0% | $0.3000 |
| safe | Claude Opus 5.5 | paid | synced | savant | $0.5000 / $0.5000 | $0.6250 / $0.6250 | 20.0% / 20.0% | $0.2500 |
| safe | Gpt 6 Astra | paid | synced | savant | $0.5000 / $0.5000 | $0.6250 / $0.6250 | 20.0% / 20.0% | $0.2500 |
| safe | Claude Sonnet 5.5 | paid | synced | savant | $0.4000 / $0.4000 | $0.5000 / $0.5000 | 20.0% / 20.0% | $0.2000 |
| safe | Kimi K3.1 Pro | paid | synced | savant | $0.3000 / $0.4000 | $0.3750 / $0.5000 | 20.0% / 20.0% | $0.1750 |
| safe | Gpt 6.1 Sol | paid | synced | savant | $0.3000 / $0.3000 | $0.3750 / $0.3750 | 20.0% / 20.0% | $0.1500 |
| safe | grok-4.7 | paid | synced | savant | $0.3000 / $0.3000 | $0.3750 / $0.3750 | 20.0% / 20.0% | $0.1500 |
| safe | Hy4 Preview | paid | synced | savant | $0.3000 / $0.3000 | $0.3750 / $0.3750 | 20.0% / 20.0% | $0.1500 |
| safe | Muse Spark 1.3 | paid | synced | savant | $0.3000 / $0.3000 | $0.3750 / $0.3750 | 20.0% / 20.0% | $0.1500 |
| safe | Gpt 6.1 Terra | paid | synced | savant | $0.1700 / $0.1700 | $0.2125 / $0.2125 | 20.0% / 20.0% | $0.0850 |
| safe | Gemini 3.1 Pro | paid | synced | savant | $0.1500 / $0.1500 | $0.1875 / $0.1875 | 20.0% / 20.0% | $0.0750 |
| safe | GLM 5.3 | paid | synced | savant | $0.1500 / $0.1500 | $0.1875 / $0.1875 | 20.0% / 20.0% | $0.0750 |
| safe | Gemini 3.8 Flash | paid | synced | savant | $0.1000 / $0.1000 | $0.1250 / $0.1250 | 20.0% / 20.0% | $0.0500 |
| safe | GPT-6 Luna (Decisions) | paid | synced | savant | $0.1000 / $0.1000 | $0.1250 / $0.1250 | 20.0% / 20.0% | $0.0500 |
| safe | Gpt 6 Luna | paid | synced | savant | $0.0750 / $0.0750 | $0.0938 / $0.0938 | 20.0% / 20.0% | $0.0375 |
| safe | Deepseek V4 Pro | paid | synced | savant | $0.0700 / $0.0700 | $0.0875 / $0.0875 | 20.0% / 20.0% | $0.0350 |
| safe | Deepseek V4.1 Flash 1017 | paid | synced | savant | $0.0600 / $0.0600 | $0.0750 / $0.0750 | 20.0% / 20.0% | $0.0300 |
| safe | Deepseek V4 Flash | paid | synced | savant | $0.0500 / $0.0500 | $0.0625 / $0.0625 | 20.0% / 20.0% | $0.0250 |
| safe | GLM-5.3 Flash | paid | synced | savant | $0.0500 / $0.0500 | $0.0625 / $0.0625 | 20.0% / 20.0% | $0.0250 |
| safe | SubQ Snap (Preview) | paid | synced | savant | $0.0500 / $0.0500 | $0.0625 / $0.0625 | 20.0% / 20.0% | $0.0250 |
| safe | Jev 1.13 | paid | synced | savant | $0.0420 / $0.0420 | $0.0525 / $0.0525 | 20.0% / 20.0% | $0.0210 |
| safe | Drex 2.0 | paid | synced | savant | $0.0400 / $0.0400 | $0.0500 / $0.0500 | 20.0% / 20.0% | $0.0200 |
| free | Deepseek V4.1 Flash 1017 | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Gemini 3.8 Flash | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | GLM 5.3 | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | GLM-5.3 Flash | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Gpt 6 Luna | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Jev 1.13 | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Kimi K3 | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Mimo V2.6 Flash | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | MiniMax M3.1 Flash | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Muse Spark 1.3 | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| free | Qwen 3.8 MAX | free | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Claude 4.6 Opus | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Claude 4.6 Sonnet | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Deepseek V4 Flash | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Deepseek V4 Pro | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Gemini 3.1 Pro | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | GLM 5.3 FlashX | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | HY 4 | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Kimi K2.8 | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | Mimo V2.6 Pro | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |
| subscription | MiniMax M3 | subscription | synced | savant | $0 / $0 | $0 / $0 | — / — | $0 |

## Method

- Cost is the serving route's upstream cost from the catalog snapshot.
- Sell is the price the gateway currently charges; free and subscription rows have no per-token sell price.
- Margin = (sell − cost) ÷ sell per direction. Scenario profit is modeled, never realized revenue.
- Unknown or stale cost blocks a recommendation. A manual price, a negative margin, a new price, a move above the threshold, or any recommendation warning requires review.
- No row was approved, published, or written by this report.
