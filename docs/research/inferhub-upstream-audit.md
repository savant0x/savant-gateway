# InferHub upstream audit — 2026-11-22

An audit of `https://inferhub.dev/docs/api` against this gateway's provider
registry, importer, request path and settlement, answering one question: can
InferHub be another upstream provider, and on what terms.

**Status:** research and audit record. No application code, schema or test was
changed. Findings that need code are named as work items with their file:line
evidence; findings that need a ruling are named as operator decisions.

**Companion records:** [FID-2026-1120-001](../../dev/fids/FID-2026-1120-001-inferhub-upstream-onboarding.md)
(registration, now `fixed` with three blocked steps) and
[providers.md](../providers.md#inferhub-registered-disabled) (operator section). The
2026-11-20 capture that preceded this audit lives in the gitignored `.scratch/` and is not
part of the repository; its settled claims are restated in the FID's evidence block.

## 1. Method and evidence

Captured 2026-11-22 13:0x UTC by direct read-only HTTP, no credential used:

| Source | Result |
| --- | --- |
| `GET https://inferhub.dev/docs/api` | 200, 102,737 bytes |
| `GET https://inferhub.dev/docs` | 200, 119,983 bytes |
| `GET https://inferhub.dev/api/openapi.json` | 200, 188,734 bytes, OpenAPI 3.1, 79 paths |
| `GET https://api.inferhub.dev/v1/models` | **200 without any authorization header**, 132,341 bytes, 507 rows |
| `GET https://inferhub.dev/api/status` | 200, 460,332 bytes |
| `GET https://inferhub.dev/api/catalog`, `/api/me`, `/v1/me/usage` | 401 (key required) |
| `https://inferhub.dev/{terms,privacy,faq,pricing}` | 200 |

### 1.1 Authenticated observation (2026-11-22 18:52 UTC)

The operator key in `.env.local` was tested read-only. No funded call was made
and nothing was written upstream.

| Source | Result |
| --- | --- |
| `GET https://inferhub.dev/api/me` | **200** — account `active`, `roles: ["consumer"]`, **`balances: {}`** (no funds) |
| `GET https://api.inferhub.dev/v1/models` (Bearer) | **200, 138,187 bytes, 520 rows** — 507 public plus **14 `ant/*` rows** and minus one public id (`ag/gemini-4-argon`), which is catalog churn inside a day |
| `GET https://inferhub.dev/api/catalog` (Bearer) | **200, 193,050 bytes** — **27 prefix groups**, not models; each carries `slug`, `prefix`, `status`, `enabled`, `activeProviders`, `models[]`, and `systemPromptNote` on five of them (`claude-code`, `codebuddy`, `codebuddy-cn`, `kiro`, `codex`) |
| `GET https://inferhub.dev/v1/me/usage` (Bearer) | **403 `access denied`** for a `consumer` role |
| Shipped normalizer over the authenticated payload | **520 received → 268 imported**, 242 aliases, 10 media, 0 free-pool refusals, 114 route groups |
| Free or zero-ask rows in the authenticated payload | **0 of 278 priced rows**; no `free/` id exists for this account |

The group payload is the most useful number in this block, because
`activeProviders` is pooled capacity, not a count of marketplace sellers:
`qwencloud-alibaba` **22,466**, `mistral-vibe` **17,787**, `codebuddy` **4,222**,
`codebuddy-cn` 741, `antigravity` 1,063, `qwencloud-alibaba-cn` 22 — against
`anthropic` and `openai` at **0**, `claude-code` 21 and `kimi-code-ai` 4. That is
the shape of a subscription-pooling scheme at scale, and it is what makes the
provenance ruling the gate on enabling this provider rather than a formality.
The five `systemPromptNote` values are the other finding: `claude-code` states it
adds a client header as the first system block and leaves the caller's system
prompt unchanged, which is a system-prompt transformation we neither import nor
display.


The complete public catalog payload was then run through the shipped importer, not a
re-implementation: `scripts/upstream-catalog-probe.mjs` imports
`lib/providers/normalize/index.ts` and calls `normalizeCatalog(rows, new Map(),
{ resaleFreePool: false })`, which is the exact call `buildSyncedCatalog` makes
(`lib/providers/catalog.ts:114`).

Cost comparisons in §5.5 use two dated figures besides today's InferHub ask: our
current upstream cost recorded live on 2026-11-20 in FID-2026-1120-001, and
Apixo's published rates from the committed snapshot
`docs/data/provider-prices.json` (captured 2026-10-31). No live database was
read: the local PGlite directory holds zero catalog rows, so there is no newer
cost figure in this tree to quote.

**Not verified, and not claimed:** any funded inference call, the runtime shape
of a `429 capacity_saturated`, whether a pinned bid actually bounds the charged
rate, the `usage.cost` value for a real request, streaming round-trip behaviour
through this gateway, publisher-side plan or quota behaviour, and anything that
requires an account, an email OTP or money. Every statement below about a paid
path is a documentation or catalog reading, labelled as such.

## 2. What the provider is

A per-token marketplace and reverse proxy: publishers attach upstream
subscription entitlements (Claude Code via OAuth, Codex, Command Code, z.ai GLM
Coding Plan, OpenCode Go, and others), and consumers call one OpenAI- and
Anthropic-compatible surface settled in USDC on Solana mainnet (Terms §1, §3).
It is a reseller of subscription capacity, not a model provider — the same class
as the two upstreams already registered.

Three surfaces share one `sk-airo-` key (docs/api):

- **Inference**, `https://api.inferhub.dev` — `/v1/chat/completions`,
  `/v1/messages`, `/v1/responses`, `/v1/models`, `/v1/images/*`, `/v1/videos*`,
  `/v1/embeddings`, `/v1/me/usage`.
- **Management API**, `https://inferhub.dev/api` — keys, allowlists, budgets,
  catalog, usage logs, deposits, publisher endpoints.
- **MCP** over SSE at `/mcp/sse`, ~45 tools.

## 3. Wire contract audit

| Property | Documented (2026-11-22) | Our adapter | Verdict |
| --- | --- | --- | --- |
| Chat completions | `POST /v1/chat/completions`, OpenAI shape, SSE when `stream=true` | `kind: "openai"` → `chat` | fits |
| Anthropic messages | `POST /v1/messages`, native SSE events; Anthropic client base URL must **not** include `/v1` | not registered (`kind: "openai"`) | deliberate; see F-18 |
| Auth | `Authorization: Bearer sk-airo-…`; `x-api-key` also accepted | `authHeaders("openai", …)` | fits |
| Catalog | `GET /v1/models` — **public**, no key, IP rate-limited; with a key it lists only what that key may use | `fetchUpstreamModels` requires a configured key first (`lib/storage/providers/sync.ts:156`) | keyless read now possible; sync gate still requires one (F-1) |
| Streaming | Forwarded byte-for-byte; default opens `200` with `: heartbeat` comments | relay forwards non-`data:` lines untouched | fits |
| Usage on stream | **Documented**: final `chat.completion.chunk` with empty `choices` carries `usage`, including `usage.cost`, immediately before `data: [DONE]` | `readProviderUsage` reads `prompt_tokens`/`completion_tokens` from any frame (`lib/usage.ts:70-90`); requires `[DONE]` (`lib/storage/gateway/stream.ts:234`) | fits; settles FID question 2 (F-2) |
| Provider-reported cost | `usage.cost`, USD, OpenRouter convention; also on `/v1/responses` | not read, not stored | opportunity (F-2) |
| Errors | `error.source` (`inferhub` or upstream name) + `error.error_class` in a fixed set; same fields on in-stream events; management API uses `{error:{code,message}}` | status-only classification; text passed through | partial (F-5, F-14) |
| Capacity refusal | `429 capacity_saturated`, `Retry-After: 2`, never billed; `503 no_capacity` when publisher quota is exhausted | `failureStatus` passes 429, maps 503 → 502 (`lib/gateway-refusal.ts:30`) | fits; 503 text is generic |
| Bid refusal | `402 no_provider_under_bid` with `min_input_per_mtok` | 402 passed through verbatim | customer-visible leak risk (F-5) |
| Behaviour headers | `X-InferHub-No-Queue: 1` (set), `X-InferHub-Strict-Status: 1` (not set), `x-max-input-price`/`x-max-output-price`, `x-ignore-upstream`, `X-InferHub-Reasoning-Mode`, `X-Session-Id` | `default_headers` carries only No-Queue | by design; F-4, F-11 |
| Media | `/v1/images/*`, `/v1/videos*` (job + poll), `embeddings` | not served | out of our product surface |
| Ids | `<prefix>/<model>`, bare alias, `combo/<slug>`, `free/<slug>/<model>` | alias and media dropped; `free/` gated by `resale_free_pool`; `combo/` absent from this catalog | fits (F-17) |

Wire compatibility is not in doubt: the chat shape, the auth header, the SSE
framing and the `[DONE]` terminator all match what the adapter already sends and
parses.

## 4. Catalog audit — live payload through the real importer

507 public rows (265 priced, 242 `owned_by: "alias"`, 10 with
`output_modality: image`, zero `free/` ids, zero `combo/` ids, 24 publisher
prefixes).

```text
received            507
imported            255   (all 255 priced; none unpriced)
skippedAliases      242
skippedMedia         10
skippedFreePool       0   (no free/ id exists to refuse)
vision-capable      153
context missing       0   (input_token_limit present on every row)
route groups        116
groups with >1 row   63   worst: kimi-k3 (9 rows), deepseek-v4-1-flash (8)
```

Consequences for the operator:

- **255 rows over 116 groups.** Publishing a group publishes a family of
  near-duplicates from different publishers. The group is the unit of routing
  (`lib/model-identity.ts:canonicalModelKey`), so one representative per group is
  the honest catalog, and `is_primary` decides it (`lib/storage/schema/catalog.ts:209`).
- **Aliases are correctly unpublishable.** They carry no price and no publisher
  pin, so nothing bounds what a call costs and the group key would collide with
  the incumbent's published id. Dropping and counting them is the right rule.
- **Media is correctly excluded.** All 10 rows the vendor marks
  `output_modality: image` are refused by `NON_CHAT_OUTPUTS`
  (`lib/providers/normalize/index.ts:24`); the other 497 rows declare text
  input, and `modality` maps to vision support (153 rows).
- **`cbcn/hy4flash-free` is not a free-pool id.** The importer keys on the
  `free/` prefix (`lib/providers/normalize/shapes.ts:82-90`), so an id whose
  *suffix* says "free" imports as the priced row it is ($0.01634/$0.04921).

### 4.1 Price ladder: the imported figure is a floor, not a cost

`askLadderFacts` imports `pricing.min_ask_in` / `min_ask_out`
(`lib/providers/normalize/shapes.ts:46-54`) — the cheapest open ask. Measured on
the live ladder (`asks_in` arrays), the *next* tier is:

| Statistic | Value |
| --- | --- |
| priced rows | 265 |
| rows with only one tier | 31 |
| second-tier multiple, median | 1.11× |
| second-tier multiple, p90 | 5.76× |
| second-tier multiple, maximum | **480×** (`mm/MiniMax-M2.5`, `-M2.7`, `-M3`, `-M3.1-Flash`) |

So for one row in ten, the price that applies when the cheapest publisher is at
its concurrency limit is 5.8× the imported cost, and for the worst rows it is
480×. InferHub's own pricing page says the same thing in words: "the cheapest
provider is often at its concurrency limit, so we route to the next available
one".

### 4.2 The 50%-of-official cap holds — as a ceiling

Verified across all 255 priced rows: **zero** rows have an ask above 50% of
their own `official_*` figure, the maximum ask on every row is exactly 50%, and
the median cheapest ask is 29.8% of official. 26 rows' cheapest ask is under 2%
of official, which is subscription-pooled economics rather than a discount
anyone should quote as a market rate. This corrects the 2026-11-20 note that
called the cap "an observed contradiction": a cheap ask below the cap is
permitted, not contradictory.

### 4.3 Family labels drift on this catalog

`normalizeFamilyName` derives the family from the leaf id's first hyphen
segment (`lib/model-family.ts:44-52`). That is stable for a provider that names
models consistently, and it produces 27 families for these 255 rows, including
pairs for one model line:

| ids | family | should be |
| --- | --- | --- |
| `cb/minimax-m3`, `mm/MiniMax-M3` | `Minimax` **and** `MiniMax` | one family |
| `kc/k3`, `kcai/k3.1-pro` | `K3`, `K3.1` | Kimi |
| `mv/zai-glm-5-3` | `Zai` | GLM (23 other rows already say GLM) |
| `cbcn/hy4flash-free`, `cbcn/hy4std` | `Hy4flash`, `Hy4std` | Hy4 |
| `ali/qwen3.8-max`, `ocg/qwen3.8-flash` | `Qwen3.8`, `Qwen3.7`, `Qwen4` | Qwen (or versioned deliberately) |

The cause is the vendor's own id casing and naming, so this is a
normalization-table gap, not a provider branch: `FAMILY_LABELS` has no
`minimax`, no `k3`, and `qwen3.8` is not `qwen`. Publishing these rows without
the table entries gives the public catalog two MiniMax families and a Zai
family that is really GLM.

## 5. Settlement audit

The gateway charges from a static micro-dollar cost basis and settles from
provider-reported token counts. Four properties of this provider press on that
design.

### 5.1 The usage frame is documented — the FID's open question closes

FID-2026-1120-001 recorded `stream_options.include_usage` as "NOT documented
anywhere" and made it step 6's settlement-critical unknown. The current
`openapi.json` states the opposite, for both shapes: "Every successful response
reports the per-request consumer cost as `usage.cost` … inside the `usage` object
of the non-stream JSON body, and — for `stream=true` — inside the `usage` of the
final `chat.completion.chunk` (empty `choices`) emitted just before the
terminating `data: [DONE]`."

Our relay already sends `stream_options.include_usage: true`
(`lib/storage/gateway/payload.ts:50`), parses `usage` from any frame
(`lib/storage/gateway/stream.ts:168`), merges split frames, and requires `[DONE]`
before settling `ok`. The parts fit. What is still missing is a funded call that
proves it end to end; documentation is not the runtime, and the FID's own
standard says so.

### 5.2 A cost basis of `min_ask` can understate cost 5.8× at p90, 480× at worst

Nothing in the request path pins the price: the registry carries
`X-InferHub-No-Queue` only, and no bid header or budget is set. InferHub routes
"best-scoring provider regardless of price" without a bid (pricing page). Cost
basis must therefore be the **bid we accept**, not the cheapest advertised ask —
and today the importer writes the ask. This is the FID's step 5, still blocked on
the operator's spend decision, not on code.

### 5.3 An in-stream provider failure settles as `ok` and is billed

By default InferHub answers `200` immediately with `: heartbeat` comments, so a
failure before the first token arrives as an **in-stream error event followed by
`[DONE]`**. The relay's terminal rule is a `[DONE]` match:
`lib/storage/gateway/stream.ts:181-190` forwards every line, `:239` settles
`ok` when a terminal line was seen, and `:234` treats only its absence as
truncation. An error frame therefore produces: customer sees an error object,
ledger records `ok`, no `error` text stored, and the charge is an estimate of
the characters that streamed — for a request the upstream billed at $0 (failed
requests, empty output and free models are $0 by their own terms).

Two honest ways out, and the choice is a design decision:

1. Set `X-InferHub-Strict-Status: 1` in `default_headers` so a pre-first-token
   failure is a real 4xx/5xx our existing path already handles. Cost: no bytes
   until the first token, so the heartbeat that keeps a slow first token from
   looking like a dead connection is gone.
2. Keep heartbeats and teach the relay to recognise a `data:` frame whose body
   is an error envelope, then settle `error` with that class. Cost: a provider
   vocabulary enters the relay at the one place it is currently
   provider-neutral.

### 5.4 A drained balance reads to the customer as their own problem

`failureStatus` passes 402 through and `safeUpstreamMessage` passes any
non-5xx text except 401/403 (`lib/gateway-refusal.ts:21-33`). An InferHub
`402 insufficient_balance` therefore reaches a customer as *"balance too low for
this request — deposit USDC to continue"* — our supplier's wallet, described to
our customer, with a funding method we do not offer. `402 no_provider_under_bid`
similarly advises re-bidding in headers the customer cannot see.

## 5.5 Price comparison, and what the entry gate costs

The full sheet — 265 InferHub offers and 135 model identities with every
upstream side by side, plus the tier-2 risk and the free-tier funding cost — is
[`inferhub-price-sheet.md`](inferhub-price-sheet.md), regenerated from the
committed data by `scripts/inferhub-price-sheet.mjs`. The summary follows.

Two comparisons, each with both sides dated, because one of them moved.

### 5.5.1 Against our current cost (Apinex, flat rate)

Apinex prices are the live synced costs recorded on 2026-11-20 in
FID-2026-1120-001; InferHub prices are today's cheapest ask, measured at a
1-in:4-out token mix, which is the blend a coding workload produces.

| Model | Our cost /1M in-out | InferHub ask | InferHub tier 2 | Blended ours | Blended ask | Blended tier 2 |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `glm-5.3-flash` | 0.050 / 0.050 | 0.00015 / 0.0005 | 0.0071 / 0.0235 | 0.050 | **0.0002** | 0.020 |
| `glm-5.3` | 0.150 / 0.150 | 0.0014 / 0.0044 | 0.035 / 0.110 | 0.150 | **0.004** | 0.095 |
| `gpt-6-luna` | 0.075 / 0.075 | 0.0018 / 0.0090 | 0.0020 / 0.0100 | 0.075 | **0.008** | 0.008 |
| `hy4-preview` | 0.300 / 0.300 | 0.0200 / 0.0600 | 0.0209 / 0.0625 | 0.300 | **0.052** | 0.054 |
| `gpt-6.1-terra` | 0.170 / 0.170 | 0.0180 / 0.0900 | 0.0190 / 0.0950 | 0.170 | **0.076** | 0.080 |
| `grok-4.7` | 0.300 / 0.300 | 0.0380 / 0.1140 | 0.578 / 1.734 | 0.300 | **0.099** | 1.503 |
| `deepseek-v4-flash` | 0.050 / 0.050 | 0.0220 / 0.0660 | 0.0264 / 0.0792 | 0.050 | 0.057 | 0.069 |
| `gpt-6.2-astra` | 0.500 / 0.500 | 0.144 / 0.720 | 0.152 / 0.760 | 0.500 | 0.605 | 0.638 |
| `claude-sonnet-5.5` | 0.400 / 0.400 | 0.136 / 0.680 | 0.484 / 2.420 | 0.400 | 0.571 | 2.033 |
| `gemini-4-hydrogen` | 0.300 / 0.300 | 0.168 / 0.840 | 0.299 / 1.493 | 0.300 | 0.706 | 1.254 |
| `kimi-k3.1-pro` | 0.300 / 0.300 | 0.230 / 1.150 | 0.400 / 2.000 | 0.300 | 0.966 | 1.680 |
| `claude-opus-5.5` | 0.500 / 0.500 | 0.272 / 1.360 | 0.520 / 2.600 | 0.500 | 1.142 | 2.184 |
| `gemini-4-argon` | 0.500 / 0.500 | 0.266 / 1.596 | 0.398 / 2.388 | 0.500 | 1.330 | 1.990 |
| `muse-spark-1.3` | 0.300 / 0.300 | 0.499 / 1.696 | 0.625 / 2.125 | 0.300 | 1.456 | 1.825 |
| `claude-fable-5.2` | 1.000 / 1.000 | 3.840 / 19.20 | 3.992 / 19.96 | 1.000 | 16.128 | 16.766 |

`gemini-3.8-flash` is gone from the catalog since 2026-11-20, which is its own
small lesson about id churn.

**Score at a 1-in:4-out blend: InferHub is cheaper on 6 of 15 rows at its
cheapest ask, and on 5 of 15 once the cheapest publisher is busy.** The reason
is structural, not incidental: Apinex bills flat (`in = out`), InferHub bills
output at 4–5× input. Every output-heavy frontier row therefore flips to our
current cost, and `claude-fable-5.2` flips by 16×. The 2026-11-20 note that
InferHub won "9 of 16" does not survive today's prices and today's blend.

**What that means commercially:** InferHub is a commodity and flash supplier for
this gateway. It can fund a deep public discount on the cheap tiers, and it can
widen the long tail. It cannot replace the flat-rate upstream on frontier
output, and it must never be the only route.

### 5.5.2 Against Apixo's published retail rate

Apixo rates are from `docs/data/provider-prices.json` (captured 2026-10-31, the
snapshot the business model already uses). 31 ids match exactly by identity key.
At a 1-in:4-out blend:

| Reading | Value |
| --- | --- |
| InferHub cheaper at its cheapest ask | **22 of 31** |
| Apixo cheaper | 9 of 31 |
| Median blended cost, InferHub | **$0.151** |
| Median blended cost, Apixo | $0.250 (49.6% higher) |
| InferHub's **tier 2** is more expensive than Apixo's flat rate | **17 of 31** |

Apixo's flat rate wins the same class it wins against Apinex — Claude Opus 4.6
through 5, `claude-fable-5`, `gemini-4-argon`, `kimi-k3.1-pro`, `mimo-v2.6-flash`
— because a flat rate is a *ceiling* you can plan against, while InferHub's
cheapest ask is a *floor* that a busy publisher removes. Counting on the floor
turns InferHub's 49.6% median advantage into a loss on the majority of rows.

### 5.5.3 The entry gate

| Term | Apixo (recorded in [apixo-provider-review.md](apixo-provider-review.md)) | InferHub (docs/api, terms, faq, pricing) |
| --- | --- | --- |
| Application fee | **$50 one-time, non-refundable once activated** | none published |
| First top-up | **$100 minimum**, "100% usable credit, not a fee" | no minimum published; USDC on Solana to a per-account address |
| Cash to first paid call | **$150** ($50 of it sunk) | whatever you deposit, from a few dollars |
| Cost basis | Apixo's **public** retail price — no wholesale discount | marketplace asks, bounded by a bid you set |
| Wallet floor | $5; below it customer keys get `503` | none published; a billed call fails `402 insufficient_balance` |
| Refunds | top-up is credit; fee is non-refundable | balance non-refundable except duplicate deposit or clear error |
| Minimum charge | per published rate | $0.00001 per billed request; failures and empty output are $0 |

The complaint behind "$50 then $100" is not the $100 — that is spendable
credit. It is that **$50 buys no wholesale advantage at all**: Apixo's reseller
wallet pays Apixo's own retail price, so the fee is the price of becoming a
retail customer under your own brand. InferHub charges nothing to enter and its
cost basis can sit below list — but it asks for USDC on a chain, publishes no
invoice, and cannot refund a balance. Neither is a supplier contract; both are
prepaid retail access with different gates.

## 6. Operational audit

| Property | Reading |
| --- | --- |
| Platform availability | 99.85% now, 99.75% 24h |
| **API surface availability** | **97.17% now, 97.44% 24h** |
| API error mix | `no_capacity` 67.9% of API errors (was 89.9% on 2026-11-20), `upstream_failed` next |
| Failure cost | `429 capacity_saturated` and `503 no_capacity` are never billed |
| Our admission ceiling | `PROVIDER_SHARED_CONCURRENCY` default **4** in-flight, shared by every customer; `PROVIDER_SHARED_RPM` unset (`lib/provider-admission.ts:28,99`) |
| Provider-side queue | up to 30 s by default; we disable it with `X-InferHub-No-Queue: 1` |
| Balance read | exists: `GET https://inferhub.dev/api/me` → `balances.consumer_balance` (USDC string) |
| Our balance read | not usable: `fetchProviderBalance` calls `${baseUrl}/balance` (`lib/providers/request.ts:74`), i.e. `https://api.inferhub.dev/v1/balance`, and the capability flag is `false` |
| Funding | USDC on Solana mainnet to a per-account address; non-refundable; no invoice, no card |
| Rate limits | vendor: "we may apply rate limits, quotas, and per-provider concurrency caps"; no published numbers |

A ~2.6% API-surface failure rate means InferHub cannot be the only route behind
a published model, which is already the recorded position. The 4-slot ceiling is
a local guess, not a measurement: FID step 7 stays blocked until someone
measures a funded minute.

## 7. Compliance and provenance audit

- **Paid resale is permitted in writing.** Terms §6: "You may resell,
  sublicense, or otherwise redistribute access to paid marketplace models you
  purchase through the Service — for example, by reselling capacity to your own
  end users or by building a product or service on top of the Service." We stay
  account holder of record and are liable for downstream users, and we must not
  present resold access as an official InferHub or upstream offering. Our
  published `owned_by: "savant-gateway"` already satisfies that.
- **Free-pool resale is forbidden**, unchanged: no resell, sublicense, share,
  sub-account, proxy or pool of `free/<provider>/<model>`, with revocation and
  forfeiture as the stated penalty. The registry records `resale_free_pool = 0`
  and the importer refuses the whole prefix
  (`lib/providers/normalize/index.ts:156`), so a future naming change cannot
  silently re-import it.
- **The scale of the pooling is now measured.** The authenticated catalog reports
  `activeProviders` per group: `qwencloud-alibaba` 22,466, `mistral-vibe` 17,787,
  `codebuddy` 4,222, `antigravity` 1,063, against `anthropic` and `openai` at 0.
  Terms §6 permits reselling *paid marketplace* capacity, and this is what that
  capacity is: thousands of pooled subscription accounts per group. The exposure
  is vendor-side detection and revocation under those upstreams' own terms,
  which is a business risk no gateway code can mitigate, so the operator ruling
  in §11 item 1 is the real gate.
- **Provider-side content screening and retention are new information.** The
  privacy policy states that before forwarding, InferHub screens "your messages
  and system prompt" against a keyword and pattern list inside its own
  infrastructure; that it retains the screened text for **14 days** and the flag
  metadata for **90 days**; and that on an unexplained security-policy rejection
  it retains the system prompt, tool definitions and request parameters for
  **7 days**. Our draft privacy notice says upstream providers "receive the
  request content", which understates that a recipient reads and may retain it,
  and our published log-retention position is "up to 30 days" — the 90-day flag
  metadata sits outside that. The notice already parks this class of question in
  an explicit `[OPERATOR DECISION REQUIRED]` processor-review slot
  (`docs/policies/drafts/privacy.md:39-42`), so this is that decision's input.
- **Provenance is unresolved and is ours to claim.** The supply is OAuth-pooled
  subscription entitlements; no party verifies that the model answering is the
  model named in the id. Reselling it makes that unverified claim the gateway's.
  This is a scope ruling, not a code change, and it has no ruling in `SCOPE.md`.
- **Custody is prepaid and non-refundable.** A drained wallet fails closed with
  `402`, which is the same protection our own ledger provides, but there is no
  refund path and no invoice trail a business customer would expect.

## 8. Already implemented

| Element | State | Evidence |
| --- | --- | --- |
| Registry row `inferhub` | seeded in both schema paths, disabled, `kind: openai`, `https://api.inferhub.dev/v1`, `INFERHUB_API_KEY`, `X-InferHub-No-Queue: 1`, capabilities false | `lib/storage/schema/catalog-seeds.ts:210-228`, `lib/schema/providers.ts:215-229` |
| Free-pool resale gate | `resale_free_pool` column, importer refusal, admin toggle, warning | `lib/providers/normalize/index.ts:156`, commit `495e8b3` |
| Price shape + alias rule | ask-ladder primary shape, alias dropped and counted, media excluded | `lib/providers/normalize/shapes.ts:46-110`, FID-2026-1120-002 `b159ba0` |
| Capability gate | `requires_model_review = 1`; only a dated `chat` decision serves | `lib/providers/eligibility.ts:105-128` |
| Sync test | real payload shape through `syncProvider` on a disposable database | `tests/provider-inferhub-sync.test.mjs` (2/2) |

## 9. Findings

Severity is about this gateway: *high* means money, honesty or a blocked
decision; *medium* means a control is missing but a workaround exists; *low* is
documentation or efficiency.

| # | Sev | Finding | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| F-1 | high | `/v1/models` is now public; `docs/providers.md` still says it answers 403 unauthenticated, and the sync gate still needs a key so a keyless catalog preview is impossible | live 200 without auth; `lib/storage/providers/sync.ts:156` | doc corrected; preview is a work item |
| F-2 | high | The stream usage frame and `usage.cost` are documented; the FID lists them as unknown, and we neither read nor store the reported cost, so actual-vs-basis cost is unobservable | `openapi.json` `/v1/chat/completions`; `lib/usage.ts:70`; `usage_events` has `cost_micros` only | FID answer; reconciliation is a work item |
| F-3 | high | Cost basis is `min_ask`, a floor: p90 next tier 5.76×, worst 480×, and no bid is set | ladder measurement; `lib/providers/normalize/shapes.ts:50` | operator: pin per-model bid; record the bid as basis |
| F-4 | high | An in-stream provider failure settles `ok` and bills an estimate | `lib/storage/gateway/stream.ts:181-190,234-249` + docs "Strict status" | work item: Strict-Status header or error-frame detection |
| F-5 | medium | Upstream 402 funding text is relayed to customers verbatim | `lib/gateway-refusal.ts:21-33` | work item: map upstream 402 to 503 with our text |
| F-6 | medium | Family labels split and mislabel 8 model lines (Minimax/MiniMax, K3, Zai, Hy4flash, Qwen3.8) | normalizer run; `lib/model-family.ts:44-52` | work item: extend `FAMILY_LABELS` |
| F-7 | medium | 255 rows import into 116 groups; 63 groups hold 2–9 rows, so publication needs a per-group representative decision | normalizer run; `lib/storage/schema/catalog.ts:209` | operator: publish one row per group |
| F-8 | medium | `/api/catalog` publishes `systemPromptNote` per upstream (some upstreams prepend/reshape the system prompt); nothing imports or displays it | `openapi.json` `/catalog`; docs "System prompts" | work item: enrichment + review display |
| F-9 | medium | No balance ceiling: the only balance read lives on another host and path than `${baseUrl}/balance` | `openapi.json` `/me`; `lib/providers/request.ts:74` | work item or documented manual check |
| F-10 | medium | Admission ceiling is the local default of 4 concurrent calls, unmeasured against this provider | `lib/provider-admission.ts:28,99` | operator: measure before enabling (FID step 7) |
| F-11 | low-med | No `X-Session-Id`; default affinity derives from system prompt + first message, and our injected banner is identical for every customer | docs "Prompt cache & sessions"; `lib/context-banner.ts` | work item: send our own stable session id |
| F-12 | medium | Provider-side screening plus 14/7/90-day retention is undisclosed; 90 days exceeds our stated 30-day log position | privacy policy §"Request and usage logs"; `docs/policies/drafts/privacy.md:39-42` | operator: processor-review decision |
| F-13 | high | Provenance is unverifiable (OAuth-pooled subscriptions) and would become our claim | Terms §1; unchanged since 2026-11-20 | operator: scope ruling, none recorded |
| F-14 | low | Docs contradict each other on default routing ("best-scoring regardless of price" vs "cheapest-first within your budget"), and `openapi.json` describes only `{code,message}` errors, not `source`/`error_class` | `/pricing` line 5 vs `/docs` "Bidding"; `components.schemas.Error` | doc note; classify by status, not by field |
| F-15 | low | Prices move: `cb/glm-5.3-flash` cheapest ask was $0.0001/$0.0005 on 2026-11-20, is $0.0033/$0.011 today (33×/22×); catalog 540 → 507 rows | both captures | keep manual costs dated; the 30-day freshness gate already applies |
| F-16 | low | The "50% of official" cap is real as a ceiling: 0/255 violations, max ask exactly 50%, median cheapest ask 29.8% | measurement | corrects the earlier "contradiction" note |
| F-17 | info | Key kinds and allowlists let us mint an `inference_only` key restricted to chosen upstreams; `/v1/models` with that key lists only what it may use | docs/api "Key types", `PATCH /api/keys/{id}` | operator: mint a scoped key, not the account key |
| F-18 | info | `/v1/messages` is available and we deliberately do not register it; `kind: "openai"` keeps one adapter and one settlement path | `lib/providers/registry.ts:174-202` | unchanged decision |
| F-19 | high | Commercially it wins only the commodity, flash and input-heavy rows: cheaper on 6 of 15 overlaps at its floor and 5 at its next tier against our flat-rate cost, while its tier 2 is dearer than Apixo's flat retail rate on 17 of 31. Entry gate is $0 against Apixo's $50 non-refundable fee plus a $100 minimum top-up | §5.5 | operator: buy the cheap groups only and keep the flat-rate upstream for frontier output |
| F-20 | high | The authenticated `/api/catalog` reports pooled capacity per group at a scale that settles what kind of supplier this is: `qwencloud-alibaba` 22,466 `activeProviders`, `mistral-vibe` 17,787, `codebuddy` 4,222, while `anthropic` and `openai` report 0. Reselling that capacity is what its Terms §6 permits and what a vendor-side revocation would strand | §1.1, §8 | operator: record the provenance ruling before the row is enabled; no engineering change |
| F-21 | medium | The account is an active `consumer` with `balances: {}` — the key authenticates and the catalog syncs, but nothing can be billed until it is funded, and `GET /v1/me/usage` returns `403 access denied` for that role, so usage cannot be read back the way the adapter expects | §1.1, F-9 | operator: fund, then re-test; engineering: F-9 stands |

## 10. Verdict

**Yes — InferHub can be another upstream provider, and it is already registered
as one.** The wire contract fits the shipped OpenAI adapter without a
provider-specific branch: bearer auth, chat completions, SSE with a `[DONE]`
terminator, a final usage frame, typed capacity refusals that are never billed,
and a `/models` payload the normalization layer already reads correctly (255 of
507 rows importable, aliases and media refused, zero free-pool rows).

It can be a **primary for cheap commodity and flash models and a long-tail
catalog**, never the only route: its API surface ran at 97.17–97.44%
availability with `no_capacity` as the top error. Frontier output-heavy groups
stay on the incumbent on measured price.

It cannot be resold on three points of the catalog — `free/` ids (forbidden by
terms, already refused), aliases (no price, no publisher pin), and media ids
(unservable) — and it cannot be *priced* honestly until a bid is pinned per
model and recorded as the cost basis.

## 11. Actions, in order

Operator decisions (money, scope, policy):

1. **Scope ruling on provenance.** Paid resale is permitted by their terms; that
   does not settle whether the gateway resells OAuth-pooled subscription
   capacity. No ruling exists in `SCOPE.md`. Record one, or the row stays
   disabled regardless of code.
2. **Fund the account** with a small USDC balance and pin a bid per model on the
   first batch (`PUT /api/budgets/{modelId}` with `floorMinProviders`), then
   enter the bid — not the ask — as each row's manual cost.
3. **Mint a scoped key**: `kind: inference_only`, `allowedUpstreams` limited to
   the prefixes we intend to sell. It cannot touch money or mint keys if it
   leaks.
4. **Processor-review decision** covering provider-side screening and the
   14/7/90-day windows, in the slot the privacy notice already reserves.

Engineering, each its own FID because each changes behaviour:

1. Settle in-stream provider errors as errors, or set
   `X-InferHub-Strict-Status: 1` (F-4).
2. Stop relaying upstream funding text and 402 semantics to customers (F-5).
3. Extend `FAMILY_LABELS` for the eight drifting lines (F-6).
4. Import `/api/catalog` as an enrichment source for `systemPromptNote` and
   per-upstream status (F-8).
5. Send a gateway-owned `X-Session-Id` (F-11).
6. Persist provider-reported `usage.cost` alongside the computed basis so
   margin is measured, not assumed (F-2).
7. Allow a provider balance read whose host/path differs from the inference
   base URL (F-9).
8. Allow a keyless catalog preview through `/v1/models`, which now works
   without a credential (F-1).

## 12. Appendix — reproduction

```bash
# catalog, no credential
curl -sS https://api.inferhub.dev/v1/models -o .scratch/inh-models.json

# the shipped importer over that payload
node scripts/upstream-catalog-probe.mjs .scratch/inh-models.json

# machine-readable contract and vendor status
curl -sS https://inferhub.dev/api/openapi.json -o .scratch/inh-openapi.json
curl -sS https://inferhub.dev/api/status

# authenticated reads (export the key first; it is never echoed)
export INFERHUB_API_KEY=...  # .env.local, never a literal here
curl -sS -H "Authorization: Bearer $INFERHUB_API_KEY" https://inferhub.dev/api/me
curl -sS -H "Authorization: Bearer $INFERHUB_API_KEY" https://inferhub.dev/api/catalog \
  -o .scratch/inh-live/catalog.json
curl -sS -H "Authorization: Bearer $INFERHUB_API_KEY" https://api.inferhub.dev/v1/models \
  -o .scratch/inh-live/models.json
node scripts/upstream-catalog-probe.mjs .scratch/inh-live/models.json
```

The probe is committed and writes nothing; `.scratch/` is gitignored, so the
captured payloads above are reproducible but not part of the tree. The vendor
pages read for this audit were `docs/api`, `docs`, `terms`, `privacy`, `faq`,
`pricing` and `api/status`, all captured 2026-11-22.
