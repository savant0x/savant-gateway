# Adding an upstream provider

Status: **current** for the checked-in gateway as of 2026-11-05.

The gateway can register multiple providers and reuse its OpenAI Chat
Completions and Anthropic Messages adapters. A compatible provider may need
only a registry row, an environment key and a sync; a different catalog,
pricing, authentication or billing contract can require additional work.
Savant authenticates its own customer keys and settles calls in its own ledger;
the provider key remains on the server.

## Add one

1. **Registry** — `/admin/providers` → *Register a provider*: slug, label,
   base URL (including `/v1` if the upstream expects it), the environment
   variable **name** that will hold the key, and the protocol kind. `both` means
   the upstream serves OpenAI Chat Completions and Anthropic Messages from the
   same base URL; the gateway sends both credential headers and picks the wire
   format per model.
2. **Key** — put `THE_VAR=...` in `.env.local` (never in the form, never in the
   database) and restart. The row shows `configured` once the variable exists.
3. **Review before enabling** — the registration form does not expose an
   initial enabled toggle; creating a row defaults to enabled and requires a
   configured key. Enabling can affect automatic sync and route selection. Use
   a disposable fixture to validate a new provider first. **Test** reads the
   catalog and reports the count; it does not import it or test inference.
4. **Sync** — imports the catalog for that provider only. It never touches
   another provider's rows, never overwrites a manual price and never deletes a
   row: a model that vanished upstream is marked delisted.
5. **Price** — `/admin/pricing`. Models the upstream prices itself arrive
   priced at `cost × (1 + markup)`. Models with no published price arrive
   disabled and at `$0.00`; set a cost for each, then activate it. A synced row
   with an unknown cost is never published.

   **Free-pool resale.** The registry carries `resale_free_pool` (default `1`).
   Uncheck *Free-pool resale permitted* when the provider's terms forbid
   reselling its free allocation — some marketplaces allow reselling paid models
   and forbid the free pool in the same sentence. With the flag off the importer
   refuses every `free/` row and reports the count in the sync warnings; no row
   is created, so nothing can be published, priced or served by accident. The
   default is `1` (`NOT NULL DEFAULT 1` on the column), so an upgrade cannot
   silently delete an existing provider's free rows.

## What routing does

Every synced row carries a provider-neutral `route_group` derived from the
upstream id (case, separators and the `family/` path folded; a release stamp
like `-0813` or an ISO date dropped; `-backup` dropped). Rows in one group are
the same model from different providers.

A group is also scoped to its billing tier. A provider may publish the same
weights twice — a `free/` allocation and the metered id — and those are two
products with different admission and settlement. The free allocation and its
paid counterpart are published side by side, each electing its own route; only
rows of the same tier are ranked against each other, so a paid takeover never
serves a paid call from the free pool.

For each group, after every sync, cost edit, price edit, status change and
provider enable/disable/delete:

- **Serving** goes to the cheapest row that can complete a billed call, ranked
  by `3 × input + output` cost, then input cost, then provider order. Free-pool
  rows cost zero and keep their group free.
- **Published id** is the stable, unscoped row. `gpt-6-astra` stays
  `gpt-6-astra` when a cheaper provider takes it over, so a customer's
  configured model string never changes. The normalized identity is a routing
  heuristic, not independent proof that differently named upstream models are
  the same version.
- **Cost and protocol** come from the serving provider and are stored on the
  published row (`served_*`), so settlement, margin and analytics record what
  was actually paid, not the incumbent's rate.
- **A model only the new provider sells** is published under its namespaced id
  (`apixo/<id>`) once it has a cost.
- **The operator's disable wins.** Disabling the published row hides the whole
  group; another provider is not promoted under a name that was taken down.
- **Pinned ids still work.** `apixo/<id>` resolves to that provider's row
  directly, which is how you test one upstream in isolation.

Auto-priced published rows are recalculated from the serving cost and markup;
the resulting customer sell price can change. Manual sell prices are preserved.

## Automatic sync and the publication gate

A catalog read calls `ensureProvidersFresh()`: any enabled provider whose last
sync is older than `PROVIDER_SYNC_INTERVAL_HOURS` (default 6, `0` disables) is
re-synced in the background while the page serves stored rows. A provider with
no credential is skipped, because it cannot sync. A database-backed lease
coordinates provider sync across application instances.

That render path is not a schedule: an idle deployment never calls it. The
committed `vercel.json` therefore runs one Vercel Hobby daily cron at 00:00 UTC
(`0 0 * * *`) against `/api/cron/providers`. The route authenticates with
`PROVIDER_CRON_SECRET` or `CRON_SECRET`, returns `503` until one is set, and
refreshes only enabled, configured providers whose catalog is due. It may bypass
the render path's five-minute attempt floor, never the due interval or the
durable lease. The daily cron is the automatic floor; the 6h value is a due
threshold, so a rendered page can still refresh sooner. **AIO sync** in
`/admin/providers` is the explicit manual action: it syncs the account and
catalog of every enabled provider regardless of the due clock and reports
warnings. Full contract: [provider-scheduler.md](provider-scheduler.md).

Publication is not the same as import. `PUBLIC_MODEL_SCOPE` publishes a row only
when it is active, its group is visible, `is_primary` selects it, a paid group
has a sell price above zero, and — for an operator-entered cost — that cost is
newer than `PROVIDER_PRICE_MAX_AGE_DAYS` (default 30, `0` disables). A
review-required provider also needs an explicit `chat` decision and positive
input, output and sell figures on the effective route. An
unpriced or stale-cost row stays in the admin catalog and out of `/models`, so a
customer is never shown a model the gateway cannot bill. Crypto sales are not
refundable, so an unverified price is withheld rather than sold and reversed.

Wallet funding is separate. A provider that publishes no balance endpoint has no
observable reserve: the gateway admits against `PROVIDER_SHARED_RPM` and the call
fails when the wallet is empty. The admin overview reports that boundary next to
the per-provider sync state.

## Catalog shapes (normalization)

Every provider publishes its catalog in its own vocabulary. `lib/providers/normalize/`
is the single place that knows those vocabularies: it maps a provider's fields onto one
canonical row, and `buildSyncedCatalog` only assembles. A shape is matched by **content**,
never by provider slug, so a new provider is a table entry plus a fixture — not a branch in
the shared builder.

| Kind | Shape | Recognized by | Reads |
| --- | --- | --- | --- |
| primary | `ask-ladder` | numeric `pricing.min_ask_in` / `min_ask_out` | cheapest open ask as the cost; `official_in`/`official_out` are **not** used (list price, not the charge) |
| primary | `free-pool` | an id under `free/`, or a declared `allowFree` | a $0 free row with a weighted allowance, weight 1 when the upstream gives none |
| primary | `flat-usd` | `dollarsPer1M` / `outputDollarsPer1M` | declared USD per 1M tokens |
| enrichment | `declared-modalities` | `modality` / `output_modality` | vision support, and whether the row outputs text at all |
| enrichment | `public-overlay` | a metadata map supplied for that provider | extra fields the envelope omits; wins over an envelope-declared figure |
| label | `alias` | `owned_by: "alias"` | nothing — the row is dropped |

Two classes are dropped and reported in the sync warnings rather than imported: an
**alias** (it shares a route key with the provider-pinned rows while naming no provider, so
no budget can bound it) and a **non-text output** row (a chat gateway cannot serve image,
audio or video output). A third class is conditional on the registry: a `free/` row is
refused when the provider's `resale_free_pool` is `0`. Unpriced text rows are kept — they
import disabled, and deleting
them would discard an operator's manual cost on the next sync. The provider that owns a
public overlay is chosen in `lib/providers/sync.ts`, where the URL lives, so a second
provider's rows can never inherit the default provider's prices by id collision.

A family is derived from the **leaf** id: `cc/claude-opus-5-5` is Claude, not "Cc". A
declared label is used only when it is neither a group word (`free`, `paid`, `subscription`)
nor the publisher prefix itself.

## Providers that require model review

A provider whose catalog proves only identifiers — not chat capability — is
seeded with `providers.requires_model_review = 1`. router.cheap is the shipped
preset. Every model starts `unknown` and is neither published nor served.In `/admin/providers`, **Review** lists the catalog rows with their current cost,
sell price and decision, plus a read-only side-by-side view of the account
catalog, reseller availability/cost and public endpoint/billing metadata. The
feed observation time, plan id/version and pricing version are shown. These
feeds are reference only: no reseller or public price is imported into a model
cost. Record `chat` only for the exact upstream id you have verified;
`unsupported` and `unknown` both deny. A decision is keyed by provider
and exact upstream id, survives a refetch and a delisting, and is never inferred
from a family name, a price or an OpenAI list envelope.

For a review-required paid row, activation and publication also require positive
input and output costs, positive sell prices, and — when the cost is manual — an
observation inside `PROVIDER_PRICE_MAX_AGE_DAYS`. The same rule is enforced in
`PUBLIC_MODEL_SCOPE`, route reconciliation and the gateway, so a direct
`router-cheap/<id>` id, an alias, a non-primary route or a subscription snapshot
cannot bypass it. No price is imported from the reseller or public feed; cost
entry stays manual.

The operator confirmed on 2026-11-06 that router.cheap resale permission is
clear: access is key-authenticated and gated. Root-key billing, model
mapping/serving source and request-time price remain external observations; this
ruling is not a funded-call or admin-to-sync-to-route receipt.

The admin catalog opens with **Catalog by provider**: one card per registered
provider with synced, active, priced, unknown-cost and currently-serving
counts. A provider that has not been synced shows zero models and says so. The
public catalog stays white-label, so provider identity never appears there.

## Not implemented

- **Automatic failover.** The ranking knows the next candidate, but a failed
  call is not retried on another provider. That is a hot-path change and needs
  its own FID.
- **Media endpoints.** Image, audio and batch routes are absent. A model-list
  response that lacks endpoint metadata does not prove each model supports chat;
  verify capabilities before treating imported rows as usable chat models.
- **Price import where the upstream publishes none.** Apixo is the example:
  costs are manual and can drift from their public price.

## Provider onboarding review

1. **Identify the provider and commercial contract.** Record the API origin,
   account and credential type, resale permission, billing unit, rate limits,
   wallet requirements, retention and the source of current prices. Provider
   advertising or a model name alone is not an identity or price verification.
2. **Check the wire contract.** Match the selected protocol to the documented
   `/models` and `/chat/completions` or `/messages` paths. Check bearer versus
   other authentication, required headers, redirects, timeout behavior, errors,
   streaming completion markers and usage frames. Store only environment
   variable names in the registry; never put secret values in default headers.
3. **Check catalog semantics.** Inspect model IDs, pagination, pricing fields,
   supported endpoints and modalities. The OpenAI model-list envelope alone
   does not identify chat, image, video or audio capability. A nonempty
   `supported_endpoints` list is interpreted by the existing protocol mapper;
   unrecognized endpoint labels can be excluded. Check source data before
   publication and do not assume the full catalog is usable for chat.
4. **Check prices and billing.** The importer understands the shapes in
   [Catalog shapes](#catalog-shapes-normalization): flat `dollarsPer1M` /
   `outputDollarsPer1M`, a nested cheapest-ask ladder, and a `free/` allowance pool. An
   absent or zero output value currently falls back to the input value; that assumption
   must be verified for the upstream. Unknown paid costs start disabled. Cached-token
   charges, request-based pricing and context or time tiers require an explicit design; do
   not infer a safe flat rate from a base tier.
5. **Set capacity deliberately.** The balance and subscription flags cause
   provider checks against `/balance` and `/subscription`; enable them only
   after confirming those paths and response shapes. A provider that publishes a
   document beside its catalog — pools, prefix groups, prompt notes — names it in
   `catalog_url`, which is read with the provider's own credential on every sync
   and stored per prefix as vendor metadata; it never joins `models`, admission
   or pricing. The pricing flag is stored
   in the registry but does not itself import a separate pricing API. Admission
   uses a current upstream RPM or the configured
   `PROVIDER_SHARED_RPM` fallback; absent both, it refuses before dispatch.
   The fallback is shared configuration, so assess its suitability for each
   provider rather than assuming it is that provider's published limit.
6. **Verify using a disposable upstream.** Use a local mock and disposable
   database to test catalog sync and preservation, provider-scoped delisting,
   request routing and authentication, stream usage and cancellation, provider
   errors, reservations, settlement and secrets redaction. Check the declared
   FID gates and production call sites. A catalog test is not proof that a paid
   or streaming inference request succeeds. A live read-only model-list probe
   and a paid inference observation are separate evidence; follow the operator's
   instructions on spending.
7. **Review before publishing.** Check model identity and route takeover,
   eligibility, supported modality, current input/output costs and sell prices,
   plan and group assignments, provider readiness and account capacity. Confirm
   how a cost change affects automatic sell prices. Recheck provider terms and
   production credentials in the relevant runtime; local keys do not prove a
   deployed environment is configured.

The central call path is `app/v1/chat/completions` →
`lib/storage/gateway/call.ts` → `lib/storage/gateway/provider-call.ts` → the
provider adapter. Provider sync flows from the admin sync route through
`lib/providers/sync.ts`, `lib/storage/providers/sync.ts`,
`lib/providers/model-list.ts` and `lib/providers/catalog.ts` to
`lib/storage/store/model-sync.ts`; route reconciliation then chooses a serving
candidate. Follow these paths and the applicable FID before changing contracts.

## InferHub (registered, disabled)

`https://api.inferhub.dev/v1` is registered as slug `inferhub` with key variable
`INFERHUB_API_KEY`, and it ships **disabled**. What the registry encodes, and why:

- **`requires_model_review = 1`** — `/v1/models` proves identifiers, prices and
  modalities but not chat capability. On 2026-11-20 it published 540 rows: 299
  provider-pinned rows that all carry `pricing.min_ask_in` / `min_ask_out`, and 241
  `owned_by: "alias"` rows with no price and no provider pin. The aliases are dropped at
  import and counted; nothing is published until a per-id `chat` decision exists. The
  public catalog on 2026-11-22 held 507 rows (265 priced, 242 aliases, 10 media).
- **`resale_free_pool = 0`** — its Terms permit reselling paid marketplace models and
  forbid reselling, sub-accounting or proxying the free pool. With the flag off no
  `free/` row imports at all. This account's catalog currently exposes zero `free/` ids,
  so the control is latent protection, not a live restriction.
- **`default_headers: {"X-InferHub-No-Queue": "1"}** — without it a capacity-blocked
  request queues for up to 30 s. This gateway has no cross-provider failover, so a fast
  unbilled `429 capacity_saturated` (with `Retry-After: 2`) is the only failure our error
  path can act on. `X-InferHub-Strict-Status` is deliberately **not** set: it suppresses
  the heartbeat that keeps a slow first token from looking like a dead connection, and
  stream behaviour is unverified until a funded call.
- **`balance_url` is set, `supports_balance = 1`** — funded by USDC on Solana mainnet to a
  per-account address, and balances are non-refundable. The wallet is not published under the
  inference base URL: `fetchProviderBalance` first tries `provider.balanceUrl`, an absolute URL
  fetched with this provider's own key and `redirect: "error"`, and only falls back to
  `${baseUrl}/balance` when it is null. The account document is
  `GET https://inferhub.dev/api/me` and its wallet is `balances.consumer_balance`; an empty
  `balances` object is a funded-at-zero wallet and reads `$0`, which is what an unfunded account
  publishes. `supports_subscription` stays off: `GET /v1/me/usage` answers `403 access denied`
  for a `consumer` role, so there is no subscription read to make.
- **A 402 from this provider is our outage, not the customer's credit.** `failureStatus` maps an
  upstream 402 to `503` and `safeUpstreamMessage` replaces its body, so a customer is never told
  to deposit USDC at a domain they have no account on. Our own insufficient-credit 402 is a
  different path and is unchanged.
- **Its streamed failures are settled as failures.** The relay reads an `error` event in a data
  frame, stops relaying from that point, settles `error` (billing nothing) and sends an
  `event: error` frame instead of `[DONE]`. This provider reports failures that way and still
  closes the response cleanly, which is why the terminator alone cannot decide a settlement.
- **The charge it reports is stored, never billed.** Its final chunk carries `usage.cost` in
  dollars, which the parser now keeps as `usage_events.provider_cost_micros` (nullable: a provider
  that reports nothing stores `NULL`, never `0`) beside the price-table `cost_micros`. Settled
  billing still comes from the price table, because a figure the upstream controls cannot set our
  margin; the admin overview flags a request whose two figures disagree, which is how a silently
  expensive publisher tier becomes visible after the fact.
- **Its prefix-group document is a snapshot, not an input.** `catalog_url` names
  `https://inferhub.dev/api/catalog`, which answers 401 without a key and, with one, returns 27
  prefix groups carrying `activeProviders` (pooled publishers: `qwencloud-alibaba` 22,466,
  `mistral-vibe` 17,787) and `systemPromptNote` on five of them (`claude-code` prepends a client
  header as the first system block). A sync replaces the provider's rows in
  `provider_catalog_groups` inside the same upload as the catalog; `/admin/catalog` shows the group
  count, the three largest pools and a warning naming every prefix that rewrites the system prompt.
  It is displayed as the vendor's own statement: nothing joins it to `models`, and no request path
  reads it.
- **The charge is bid-dependent.** Its router selects by provider score, not price,
  unless a per-model bid is set with `PUT /api/budgets/{modelId}` (with
  `floorMinProviders`). The imported figure is the cheapest open ask, not a guarantee:
  the recorded manual cost must be the bid we accept, which is why the operator sets the
  bid on their side before a row is published. Measured on the live ladder, the next
  price tier is 5.76× the cheapest at p90 and 480× at worst, so an ask-based cost basis
  understates a call as soon as the cheapest publisher is busy.

Observed on 2026-11-20 with a live key: `GET /v1/models` returned 200 with 540 rows and
no pagination; a chat probe with the gateway's own `stream_options.include_usage`
returned `402 {"type":"insufficient_balance"}` because the balance is empty.
`no_capacity` was 89.9% of its API-surface errors (95.17% 24 h availability), so this
provider can never be the only route for a published model.

Re-observed 2026-11-22, without a credential, when the vendor published its
machine-readable reference (`/api/openapi.json`):

- `GET /v1/models` is **public** — 200 and 507 rows with no `Authorization` header. With
  the operator key it returns **520** rows: the public set plus 14 `ant/*` Anthropic-native
  ids and minus `ag/gemini-4-argon`. The catalog shape is therefore verifiable without a
  credential, though `syncProvider` still needs a configured key.
- `GET /api/catalog` is no longer 404. It answers 401 without a key and, with one, returns
  **27 prefix groups** (`slug`, `prefix`, `status`, `enabled`, `activeProviders`,
  `models[]`) rather than a flat model list, with `systemPromptNote` on five of them —
  `claude-code` states it prepends a client header as the first system block. That note is
  a system-prompt transformation nothing here imports or displays, and `activeProviders`
  reports pooled capacity at four-figure scale (`qwencloud-alibaba` 22,466,
  `mistral-vibe` 17,787), which is the provenance risk rather than a catalog statistic.
- The settlement question is answered on paper: the final streamed chunk carries `usage`,
  including `usage.cost` in USD, just before `data: [DONE]`. Only a funded call can prove
  it at runtime.

Authenticated observation, 2026-11-22 18:52 UTC (read-only, no funded call):
`GET /api/me` answers 200 with `status: "active"`, `roles: ["consumer"]` and
**`balances: {}`** — the key is valid and the account holds nothing. `GET /v1/me/usage`
returns **403 `access denied`** for that role, so the usage read-back this adapter would
want does not exist for a consumer key. The shipped importer over the authenticated
payload imports **268 of 520** rows (242 aliases, 10 media, no free-pool rows, 114 route
groups). Nothing can be billed until the wallet is funded, so the remaining unverified
items all need a deposit rather than a code change.
- API-surface availability was 97.17% current / 97.44% 24 h, with `no_capacity` at 67.9% of
  API errors.

Full audit, findings and the ordered actions:
[research/inferhub-upstream-audit.md](research/inferhub-upstream-audit.md).

## Adding Twigpine (research only)

`https://twigpine.com/opengateway/docs` documents an OpenAI- and
Anthropic-compatible endpoint with smart routing, `:free` models, x402
per-request USDC and a published model catalog. It is **not** registered: it
needs its own review and FID, including how its `provider/model` ids and
`:free` suffix map to identities, and whether x402 or `auto` routing conflicts
with this gateway's own routing and settlement.
