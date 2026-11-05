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

## Providers that require model review

A provider whose catalog proves only identifiers — not chat capability — is
seeded with `providers.requires_model_review = 1`. router.cheap is the shipped
preset. Every model starts `unknown` and is neither published nor served. In
`/admin/providers`, **Review** lists the catalog rows with their current cost,
sell price and decision. Record `chat` only for the exact upstream id you have
verified; `unsupported` and `unknown` both deny. A decision is keyed by provider
and exact upstream id, survives a refetch and a delisting, and is never inferred
from a family name, a price or an OpenAI list envelope.

For a review-required paid row, activation and publication also require positive
input and output costs, positive sell prices, and — when the cost is manual — an
observation inside `PROVIDER_PRICE_MAX_AGE_DAYS`. The same rule is enforced in
`PUBLIC_MODEL_SCOPE`, route reconciliation and the gateway, so a direct
`router-cheap/<id>` id, an alias, a non-primary route or a subscription snapshot
cannot bypass it. No price is imported from the reseller or public feed; cost
entry stays manual.

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
4. **Check prices and billing.** The importer understands `dollarsPer1M` and
   `outputDollarsPer1M`. An absent or zero output value currently falls back to
   the input value; that assumption must be verified for the upstream. Unknown
   paid costs start disabled. Other price schemas, cached-token charges,
   request-based pricing and context or time tiers require an explicit design;
   do not infer a safe flat rate from a base tier.
5. **Set capacity deliberately.** The balance and subscription flags cause
   provider checks against `/balance` and `/subscription`; enable them only
   after confirming those paths and response shapes. The pricing flag is stored
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

## Adding Twigpine (research only)

`https://twigpine.com/opengateway/docs` documents an OpenAI- and
Anthropic-compatible endpoint with smart routing, `:free` models, x402
per-request USDC and a published model catalog. It is **not** registered: it
needs its own review and FID, including how its `provider/model` ids and
`:free` suffix map to identities, and whether x402 or `auto` routing conflicts
with this gateway's own routing and settlement.
