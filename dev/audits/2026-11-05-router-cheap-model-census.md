# router.cheap model census — 2026-11-05

Read-only snapshot at 19:33:46 UTC. The authenticated `/v1/models` returned
76 IDs. The reseller `/api/reseller/v1/prices` reported 68 plan-available and
8 unavailable; public `/api/pricing` supplied endpoint labels. These are vendor
claims and a plan snapshot, not successful inference or an uptime guarantee.
The provider says price lists can be cached for one minute and actual charges
use request-time prices. The listed reseller-customer costs are not yet proven
to apply to calls using the root model key. No inference or management write was
sent. No token, customer key or credential is recorded here.

There are 47 token-billed models whose endpoint metadata includes `openai`;
39 are marked available. The snapshot also identifies 13 image, 11 video and
5 speech models. The gateway currently serves chat completions, so image,
video and speech entries do not imply supported gateway functionality.
The 28 names marked **new** below have no punctuation-normalized match among
the 42 models in the live APInex catalog's non-`free/` rows. This is a name
comparison, not proof of different model versions or customer access.
When the comparison also includes APInex's `free/` rows, **20** of the 39
available chat-labelled names have no normalized name match at all. The other
eight of the 28 have a free-prefixed APInex match: `claude-opus-4-6`,
`claude-sonnet-4-6`, `deepseek-v4-flash-0731`, `deepseek-v4-pro-0813`,
`mimo-v2.6-pro`, `minimax-m3`, `minimax-m3.1-flash` and `qwen3.8-max`.
Name matching alone does not establish that any pair is equivalent or that a
free-labelled row is currently available for use.

## Available chat-labelled models

Costs are reseller API `cost_input_per_million_usd` / `cost_output_per_million_usd`,
USD per million tokens at the snapshot. A `*` marks vendor-public tiered
pricing metadata; these numbers must not be treated as a worst-case ceiling.
`New` means only that no paid-name match was found in the comparison above.

| Model | Input / output | APInex paid-name match |
| --- | ---: | --- |
| claude-fable-5 | $0.36 / $1.80 | New |
| claude-haiku-4-5 | $0.036 / $0.18 | New |
| claude-opus-4-6 | $0.18 / $0.90 | New |
| claude-opus-4-7 | $0.18 / $0.90 | New |
| claude-opus-4-8 | $0.18 / $0.90 | New |
| claude-opus-5 | $0.18 / $0.90 | New |
| claude-opus-5-5 | $0.144 / $0.72 | claude-opus-5.5 |
| claude-sonnet-4-6 | $0.108 / $0.54 | New |
| claude-sonnet-5 | $0.108 / $0.54 | New |
| deepseek-v4-flash* | $0.015 / $0.06 | deepseek-v4-flash |
| deepseek-v4-flash-0731* | $0.015 / $0.06 | New |
| deepseek-v4-flash-vision-exp* | $0.03 / $0.12 | New |
| deepseek-v4-pro* | $0.066 / $0.198 | deepseek-v4-pro |
| deepseek-v4-pro-0813* | $0.066 / $0.198 | New |
| deepseek-v4.1-flash* | $0.03 / $0.12 | deepseek-v4.1-flash |
| deepseek-v4.1-flash-1017* | $0.03 / $0.12 | New |
| gemini-3.8-flash* | $0.12 / $0.60 | gemini-3.8-flash |
| glm-5.2 | $0.035 / $0.11 | New |
| glm-5.3 | $0.035 / $0.11 | glm-5.3 |
| glm-5.3-flash | $0.01875 / $0.0625 | glm-5.3-flash |
| gpt-5.5* | $0.10 / $0.60 | New |
| gpt-5.6-luna* | $0.016 / $0.096 | New |
| gpt-5.6-sol* | $0.10 / $0.60 | New |
| gpt-5.6-terra* | $0.04 / $0.24 | New |
| gpt-6-astra* | $0.20 / $1.00 | gpt-6-astra |
| gpt-6-luna* | $0.008 / $0.04 | gpt-6-luna |
| gpt-6-sol* | $0.04 / $0.20 | New |
| gpt-6.1-sol* | $0.04 / $0.20 | gpt-6.1-sol |
| grok-4.5 | $0.033333 / $0.10 | New |
| grok-4.6* | $0.033333 / $0.10 | New |
| grok-4.7* | $0.033333 / $0.10 | grok-4.7 |
| hy3 | $0.0198 / $0.0792 | New |
| mimo-v2.6-pro | $0.0725 / $0.145 | New |
| minimax-m3 | $0.05 / $0.20 | New |
| minimax-m3.1-flash | $0.10 / $0.40 | New |
| minimax-m3.1-flash-preview | $0.10 / $0.40 | New |
| qwen3.8-27b | $0.016667 / $0.10 | New |
| qwen3.8-flash | $0.0075 / $0.0235 | New |
| qwen3.8-max | $0.066667 / $0.20 | New |

## Unavailable in the reseller plan

`claude-fable-5-1`, `claude-haiku-5-5`, `claude-sonnet-5-5`,
`gemini-4-argon`, `gpt-6.1-terra`, `kimi-k2.7-code`, `kimi-k3` and
`kimi-k3.1-pro`. Zero cost fields for unavailable models are not free prices.

## Image-labelled models

`gemini-nano-banana-2.1`, `gpt-image-2`, `gpt-image-2.5`,
`gpt-image-2.5-flare`, `gpt-image-2.5-flare-2k`,
`gpt-image-2.5-flare-4k`, `gpt-image-2.5-sunburst`,
`gpt-image-2.5-sunburst-2k`, `gpt-image-2.5-sunburst-4k`, `gpt-image-2.6`,
`gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` and
`grok-imagine-image-2.0`.

## Video-labelled models

`gemini-omni-edit`, `gemini-omni-fast`, `grok-imagine-video-1.5`,
`kling-3.0`, `minimax-h3-768p`, `seedance-2.0-fast`, `seedance-2.0-mini`,
`seedance-2.5`, `veo-3.1-lite`, `viduq3-turbo` and `wan-3.0`.

## Speech-labelled models

`chirp-3-hd`, `gpt-4o-mini-tts`, `grok-voice`, `tts-1` and `tts-1-hd`.

## Sources and limits

- https://router.cheap/reference/reseller-api.md — price-field and scope contract.
- https://router.cheap/api/pricing — vendor endpoint and tier metadata.
- https://apinex.bond/api/public/models — live comparison catalog.
- Account-scoped reseller price list and model list: read-only authenticated GETs.
  Their inputs, discounts, eligible plans and computed prices can change.
- Actual delivery, model identity, permitted resale, quality, retention and
  account-specific root-key billing are not established by this snapshot.
