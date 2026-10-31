# Apixo as a second upstream provider — review

Status: **current**, written 2026-10-31 against the public site and live
unauthenticated endpoints. No Apixo account exists; nothing here was exercised
with a credential, and no money path was touched.

Companion record: FID-2026-1031-080.

## What the program is

Apixo sells its catalog twice: directly to developers, and through a reseller
program (`/resellers`) where the operator runs their own brand, Telegram bot,
domain and prices. The economics are resale, not wholesale:

| Item | Published term |
| --- | --- |
| Panel fee | $50 one-time, non-refundable once activated |
| First top-up | $100 minimum, "100% usable credit, not a fee" |
| Commission | 0% on the reseller's sales |
| Cost basis | The reseller's wallet pays Apixo's **public** price per request |
| Margin | Whatever the reseller adds on top; customers pay the reseller directly |
| Wallet floor | Below $5, customer keys receive `503` until top-up |

The important consequence for this gateway: Apixo is not a wholesale discount
channel. Our `apixo/*` catalog would be bought at the same rate a retail
customer sees, so our margin there is the markup we publish and nothing more.
It is useful as **coverage and redundancy**, not as a cost advantage.

## Verified API surface

From `https://apixoai.online/docs` and `/docs/api`:

- Base URL, OpenAI clients: `https://api.apixoai.online/v1`
- Base URL, Anthropic clients: `https://api.apixoai.online` (messages path is
  `/v1/messages`, so the same `/v1` base works for both in our adapter)
- Auth: `Authorization: Bearer sk-apixo-…` **or** `x-api-key`, on every endpoint
- Endpoints: `POST /v1/chat/completions`, `POST /v1/responses`,
  `POST /v1/messages`, `POST /v1/messages/count_tokens`, `GET /v1/models`
- Streaming: SSE, and Chat Completions get `stream_options.include_usage`
  injected upstream, so the final chunk carries usage
- Errors: `400` bad model/JSON, `401` bad key, `402` low balance, `403`
  suspended or trial calling a paid model, `429` with `retry-after`, `5xx`
- Billing: input, output (including reasoning), cached input, and Anthropic
  cache writes each at their own rate
- Limits: per API key, requests per minute; paying keys get more than trial keys
- Privacy: prompt and response content are not stored; metadata is kept

`GET /v1/models` answered **200 without a credential** on 2026-10-31 with an
OpenAI-style `{"object":"list","data":[…]}` envelope and 43 entries. Each entry
carries `id`, `display_name`, `context_window`, `max_output_tokens`,
`owned_by: "apixo"`. There is no price field.

The catalog mixes frontier, cheap and "uncensored"/"abliterated" rows, and
includes at least one Apixo-side fallback id (`glm5.3-flash-abliterated-backup`).

## Media surface

Images are a separate catalog and a separate route:

- `GET /v1/images/models` answered **200 without a credential** with four rows:
  `flux-schnell` ($0.01 per 1024², per-megapixel), `flux-dev` ($0.05,
  per-megapixel), `nano-banana` ($0.08), `recraft-v3` ($0.08). Each row also
  declares `sizes` and `free_trial`.
- `POST /v1/images/generations` takes `model`, `prompt`, `size`, `n` (1–4) and
  `response_format` (`url` or `b64_json`). Sizes: `1024x1024`, `768x1024`,
  `1024x768`, `576x1024`, `1024x576`.
- Charged per delivered image; safety-filtered requests are not charged. Returned
  links live 24 hours.

No video or audio endpoint appears in the sitemap or the docs. "Multimedia"
here means image generation only.

## What already works with this repository, unchanged

The provider registry added for FID-2026-1029-022 already carries a disabled
`apixo` row: slug `apixo`, kind `both`, base URL `https://api.apixoai.online/v1`,
key variable `APIXOAI_API_KEY`, balance/subscription/pricing capabilities off.
That maps cleanly onto this upstream:

- `providerFetch` appends `/chat/completions` and `/messages` to the `/v1`
  base, which are exactly the documented paths.
- `authHeaders("both", …)` sends `Authorization`, `x-api-key` and
  `anthropic-version`, which is what Apixo accepts.
- `inferModelProtocol` sends `claude-*` rows to Messages and everything else to
  Chat Completions; Apixo serves any model on either format.
- Public ids become `apixo/<upstream-id>`, so the catalog cannot collide with
  Savant's rows and usage history stays attributable.
- A 429 and its `retry-after`, plus 400/402, pass through our mapping; 5xx and
  credential failures are redacted before they reach a customer.

## Gaps, in the order they bite

1. **No machine-readable text prices.** `GET /v1/models` publishes no cost, so a
   sync produces 43 rows with `cost_source = 'unknown'`. There is no automatic
   cost import; the operator must enter input/output cost per model before the
   rows are sellable. `POST /api/admin/models` already refuses to activate a
   model whose cost is unknown, and FID-080 now also keeps such a new row out of
   the public catalog instead of advertising it at $0.00.
2. **Cost drift.** Because cost is manual, an Apixo price change is invisible to
   us. A manual cost that falls below the real upstream rate quietly converts
   margin into a loss. This is the main economic risk of the pairing; it needs a
   periodic price re-check by hand, not a code fix.
3. **No image route.** `POST /v1/images/generations` is a new capability class:
   per-image pricing, a per-image hold and settlement, a public route, docs, and
   catalog UI. Not implemented; FID-080 specifies it and stops there.
4. **No failover.** A public model id resolves to exactly one provider row.
   "Apixo as a backup source" therefore means publishing `apixo/<model>` as its
   own row, and a customer or client choosing it — not silent rerouting. Real
   failover needs an alias/candidate table and is not in this pass.
5. **No balance or subscription endpoint.** The provider row declares neither
   capability, so Apixo capacity is unobserved. Admission falls back to
   `PROVIDER_SHARED_RPM`; that fallback is a conservatism, not a measurement.
6. **Responses format.** Apixo serves `POST /v1/responses`; this gateway does
   not. That stays a documented non-goal — `/v1/chat/completions` and
   `/v1/models` are the public surface.

## Risks worth naming before purchase

- **Counterparty.** A reseller-of-a-reseller with no published SLA, crypto-only
  retail settlement, and terms that allow suspension without refund (rules 07
  and 02 on `/resellers`). A wallet at $0 stops every customer request at once.
- **Content posture.** The catalog includes uncensored and abliterated rows.
  Publishing them is a policy decision, not a technical one; they are legal to
  resell from our side only if our own acceptable-use terms and the upstream
  terms agree. The safety-filtered image path is similarly outside our control.
- **Brand.** Their rules forbid presenting the service as OpenAI, Anthropic or
  Google. We already publish `owned_by: "savant-gateway"` and own branding, so
  nothing changes — but reselling their image models does not make us Google.
- **Versioned ids.** Upstream ids carry build suffixes (`deepseek-v4-pro-0813`).
  Ids will churn; the sync already delists vanished rows instead of deleting
  them, and manual prices survive.

## Decision

Reviewed, provider registered, not enabled. What this pass changed: an unpriced
import can no longer appear in the public catalog as a $0.00 paid model
(FID-080). What it deliberately did not change: no image route, no failover, no
automatic pricing, no Apixo credential, and no published `apixo/*` model.

To onboard once an account exists:

1. Put `APIXOAI_API_KEY` in `.env.local` and restart.
2. Enable the `apixo` provider in `/admin/providers` and run **Sync**; expect 43
   text models, every one disabled and `cost_source = 'unknown'`.
3. Enter input/output cost per model you intend to sell in `/admin/pricing`,
   then activate it. Unpriced rows stay out of `/models`.
4. Keep an Apixo wallet well above $5; below it every customer call answers
   `503`.
5. Re-check their public prices on a schedule and correct the manual costs.
