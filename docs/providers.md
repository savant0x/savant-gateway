# Adding an upstream provider

Status: **current** as of 2026-10-31 (FID-2026-1031-081).

The gateway is multi-provider by registry, not by code. One provider needs a
registry row, a key in the environment, and a sync; nothing in `lib/providers`
is provider-specific.

## Add one

1. **Registry** — `/admin/providers` → *Register a provider*: slug, label,
   base URL (including `/v1` if the upstream expects it), the environment
   variable **name** that will hold the key, and the protocol kind. `both` means
   the upstream serves OpenAI Chat Completions and Anthropic Messages from the
   same base URL; the gateway sends both credential headers and picks the wire
   format per model.
2. **Key** — put `THE_VAR=...` in `.env.local` (never in the form, never in the
   database) and restart. The row shows `configured` once the variable exists.
3. **Enable and test** — toggle the provider on, then **Test**. Test reads the
   catalog and reports how many models the upstream answered with; it does not
   write.
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

For each group, after every sync, cost edit, price edit, status change and
provider enable/disable/delete:

- **Serving** goes to the cheapest row that can complete a billed call, ranked
  by `3 × input + output` cost, then input cost, then provider order. Free-pool
  rows cost zero and keep their group free.
- **Published id** is the stable, unscoped row. `gpt-6-astra` stays
  `gpt-6-astra` when a cheaper provider takes it over, so a customer's
  configured model string never changes.
- **Cost and protocol** come from the serving provider and are stored on the
  published row (`served_*`), so settlement, margin and analytics record what
  was actually paid, not the incumbent's rate.
- **A model only the new provider sells** is published under its namespaced id
  (`apixo/<id>`) once it has a cost.
- **The operator's disable wins.** Disabling the published row hides the whole
  group; another provider is not promoted under a name that was taken down.
- **Pinned ids still work.** `apixo/<id>` resolves to that provider's row
  directly, which is how you test one upstream in isolation.

Auto-priced published rows follow the serving cost, so a cheaper takeover
raises margin instead of leaving a stale sell price behind. Manual sell prices
are never overwritten.

## Not implemented

- **Automatic failover.** The ranking knows the next candidate, but a failed
  call is not retried on another provider. That is a hot-path change and needs
  its own FID.
- **Media endpoints.** Image, audio and batch routes are absent; a provider
  that sells images is catalogued as text-only until that lane exists.
- **Price import where the upstream publishes none.** Apixo is the example:
  costs are manual and can drift from their public price.

## Adding Twigpine (research only)

`https://twigpine.com/opengateway/docs` documents an OpenAI- and
Anthropic-compatible endpoint with smart routing, `:free` models, x402
per-request USDC and a published model catalog. It is **not** registered: it
needs its own review and FID, including how its `provider/model` ids and
`:free` suffix map to identities, and whether x402 or `auto` routing conflicts
with this gateway's own routing and settlement.
