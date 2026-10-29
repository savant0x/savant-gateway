# FID: Multi-provider registry (OpenAI-compatible + Anthropic upstreams)

**Filename:** `FID-2026-1029-010-multi-provider-registry.md`
**ID:** FID-2026-1029-010
**Severity:** high
**Status:** closed
**Created:** 2026-10-29 12:20 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1029-009 (free-pool admission must become
provider-scoped), FID-2026-1029-004 (catalog and pricing, shipped)
**Related:** FID-2026-1029-007 (groups) and FID-2026-1029-008 (customer
subscriptions) both assume one upstream. This FID must not block them, but
their `models` migrations must leave room for `upstream_slug`.

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. `closed`
means the implementation exists, every gate passes, and the record names the
commit it was verified against. The repository gates are `lint`, `typecheck`,
`test`, `quality`, `build`, and `verify`.

## Summary

The gateway is single-provider by construction: one `PROVIDER_KEY`, one
`PROVIDER_BASE_URL`, one `provider_status` row, one `providerChatCompletion`
endpoint, and a sync that marks every catalog row out of catalog before
upserting the current provider. Adding a second upstream is a routing
requirement, not a config change.

The operator wants to sell both upstreams from one backend: the existing
provider (Savant, OpenAI-compatible) and CommandCode
(`https://commandcode.ai/docs/provider`, read 2026-10-29), which exposes an
OpenAI-compatible surface for OpenAI and open models and an Anthropic Messages
surface for Claude models. This FID defines:

- a `providers` registry with per-provider protocol, base URL, credential
  environment-variable name, capability flags, and runtime status;
- provider-scoped catalog sync and model identity, so one upstream’s sync can
  never hide another’s models;
- protocol adapters: OpenAI Chat Completions passthrough and Anthropic Messages
  translation (request, streaming, errors, usage);
- manual cost mapping for providers without a machine-readable price feed,
  with a no-silent-zero-cost rule;
- provider-aware free-pool admission (FID-009 becomes per-provider);
- admin controls for provider CRUD, connection test, sync, status, and per-model
  cost editing;
- migration of the current single-provider state without breaking existing
  model ids, customer keys, usage history, or balances.

Non-goal: automatic failover or load balancing across providers in v1.

## Environment

- **OS:** Windows 11, Git Bash.
- **Runtime:** Node `v24.21.0`, npm `12.2.1`.
- **Tool Versions:** Next.js `16.4.3`, React `19.3.0`, HeroUI `3.2.7`,
  Tailwind CSS `4.3.3`, better-sqlite3 `13.0.3`, TypeScript `5.9.3`.
- **Commit/State:** `957430cb4ad3bebe3a63697a3d281cc383308aea` on `main`
  contains the FID-010 implementation, based on `592bb92` (FID-009 closure).

## Detailed Description

### Problem

1. **One credential.** `lib/provider.ts` reads `PROVIDER_KEY` and
   `PROVIDER_BASE_URL`; every fetch uses one bearer token and the Savant-only
   `src: gate` header. A second provider has no place to live.
2. **One status row.** `provider_status` is `CHECK (id = 1)`; the admin card,
   the free-pool provider floor, and sync summaries all read that row.
3. **Family masquerades as provider.** `models.provider` stores the model family
   (AGENTS.md vocabulary). There is no upstream identity column, so two
   providers shipping the same model id collide on the primary key.
4. **Destructive sync.** `replaceModels` runs `UPDATE models SET in_catalog = 0`
   for the whole table before upserting. A CommandCode sync would hide every
   Savant model.
5. **Chat-completions only.** `providerChatCompletion` posts
   `/chat/completions`. CommandCode routes Claude models to `/messages`, so
   those models either need an Anthropic adapter or must not be advertised.
6. **Provider metadata is assumed.** Sync expects `/balance` and
   `/subscription` and treats failure as a warning; CommandCode does not
   document either endpoint. Without capability flags a sync would report
   perpetual warnings.
7. **Cost is assumed to arrive.** Savant publishes `dollarsPer1M` /
   `outputDollarsPer1M`. CommandCode documents pricing on a page, not in
   `/models`. The sell-price and margin math needs an upstream cost, and the
   current path silently falls back to `0` when metadata is missing.
8. **Free pool is global.** FID-009’s provider floor reads the single
   `provider_status` row. With two upstreams, a drained free pool on one must
   not block the other, and usage must be attributed to the provider that
   served it.

### Observed CommandCode contract (2026-10-29)

- `POST /provider/v1/chat/completions` and `GET /provider/v1/models`;
  OpenAI-style request, response, and error envelopes; streaming with a final
  usage object.
- `POST /provider/v1/messages` for Claude models; `supported_endpoints` is
  exposed per model, so routing can be decided from model metadata.
- Bearer-token authentication.
- No documented `/balance` or `/subscription` equivalent.
- Per-model cost is documented on the pricing page, not in `/models`.
- Provider plan: from $15/month plus a processing fee, pay-as-you-go usage.
  Commercial terms must be confirmed by the operator before the integration is
  enabled in production; this FID assumes a second upstream account exists or
  will be created.

### Expected Behavior

1. The operator can register, edit, enable, disable, and delete providers. A
   provider has: `slug`, `label`, protocol kind (`openai` | `anthropic`), base
   URL, key environment-variable name, optional static headers, capability
   flags (`balance`, `subscription`, `pricing`), enabled flag, and sort order.
2. Credential values never enter the database, the admin API response, logs, or
   the browser. The registry stores only the environment-variable **name**;
   the value is read from `process.env` at request time. Adding a provider
   requires editing `.env.local`, exactly like the current `PROVIDER_KEY`.
3. Each provider syncs independently: models are upserted under
   `(upstream_slug, upstream_id)`; only that provider’s vanished rows are marked
   `in_catalog = 0`; manual prices, operator disables, and groups survive.
4. A model routes by its provider’s protocol. OpenAI-kind providers keep the
   current passthrough; Anthropic-kind providers translate request, stream,
   errors, and usage.
5. `/v1/models` and `/models` keep `owned_by: "savant-gateway"`; the upstream
   is an internal routing attribute. Public model ids stay stable for the
   default provider; models from other providers are published as
   `{slug}/{upstream_id}` unless the operator overrides the public id alias.
6. Paid models without a known cost cannot be enabled for sale. The catalog
   marks them `cost_source = 'unknown'`; the admin editor requires an explicit
   cost (or an explicit zero for genuinely free rows) before activation.
7. Free-pool admission is provider-scoped: per-user allowance is global per
   user per day, the provider floor applies to the provider serving the model,
   and provider consumption is attributed correctly. A provider without a
   remaining figure still gets the local per-user cap and an operator warning
   that capacity is unknown.
8. Admin sees provider status, last sync, error, model counts, and can trigger
   a connection test and a sync per provider or for all enabled providers.
9. Disabling a provider hides its models from the public catalog and rejects
   calls to them with `503 model_unavailable`, without deleting rows.
10. The existing Savant provider, credentials, model ids, keys, balances, and
    usage history keep working across the migration; no customer action is
    required.

### Root Cause

“Provider” was implemented as deployment configuration (one env triple), not as
a domain entity. Catalog sync, status, pricing, and the free pool all assumed
that one upstream is the only upstream.

### Evidence

- `lib/provider.ts`: `DEFAULT_BASE_URL`, `getProviderKey()`, single
  `providerFetch`, `src: gate`, `providerChatCompletion`, `syncProvider` with
  one `saveProviderStatus` and one `replaceModels`.
- `lib/store/models.ts`: `replaceModels` runs
  `UPDATE models SET in_catalog = 0` globally; `models.provider` is the family;
  the primary key is the model id.
- `lib/store/provider.ts`: `provider_status ... WHERE id = 1`.
- `lib/gateway.ts`: `resolveModel`, `providerChatCompletion(payload)`, no
  provider dimension.
- `app/api/provider/sync/route.ts`: one sync endpoint, no provider parameter.
- CommandCode provider docs, read 2026-10-29.

## Impact Assessment

### Affected Components

- `lib/db.ts` — `providers` table, `models.upstream_slug` / `family` /
  `cost_source`, free-pool provider columns.
- `lib/provider.ts` → split into `lib/providers/` registry, sync, and adapters.
- `lib/gateway.ts` — provider resolution per model.
- `lib/store/models.ts`, `lib/store/provider.ts`, `lib/store/free-pool.ts`,
  `lib/store/usage.ts`, `lib/store/pricing.ts`.
- `lib/store/shared.ts`, `lib/types.ts` — provider summaries.
- `app/api/admin/providers/*` (new), `app/api/provider/sync/route.ts` (legacy
  redirect), `app/admin/(panel)/providers/page.tsx` (new).
- `components/admin/*` — providers table, model cost editor, provider filter.
- `components/catalog/*` — optional upstream label; `owned_by` unchanged.
- `lib/gateway-stream.ts`, `lib/gateway-settle.ts` — protocol-neutral already;
  adapters must emit OpenAI-shaped events and usage.

### Risk Level

- [ ] Critical
- [x] High: catalog integrity, billing accuracy, and secret handling across two
  upstream accounts
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Introduce a first-class provider entity and two protocol adapters behind one
`callProvider(model, payload, signal)` seam. Keep the existing Savant path as
the default `openai` adapter so the migration is additive. Route per model, not
per request; no failover.

### Schema

```sql
CREATE TABLE providers (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('openai','anthropic')),
  base_url TEXT NOT NULL,
  key_env_var TEXT NOT NULL,
  default_headers TEXT NOT NULL DEFAULT '{}',
  supports_balance INTEGER NOT NULL DEFAULT 0,
  supports_subscription INTEGER NOT NULL DEFAULT 0,
  supports_pricing INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  balance_usd REAL,
  rpm INTEGER,
  rpm_plan TEXT,
  subscription_mode TEXT,
  subscription_plan TEXT,
  subscription_token_limit INTEGER,
  subscription_tokens_used INTEGER,
  subscription_tokens_remaining INTEGER,
  subscription_allowed INTEGER,
  subscription_expires_at TEXT,
  synced_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE models ADD COLUMN upstream_slug TEXT NOT NULL DEFAULT 'savant';
ALTER TABLE models ADD COLUMN family TEXT;
ALTER TABLE models ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'unknown';
CREATE UNIQUE INDEX models_upstream_idx ON models(upstream_slug, upstream_id);
```

`models.provider` remains, kept in sync with `family`, until a later cleanup
FID. All reads move to `family` and `upstream_slug`; `provider` is written for
compatibility only. `provider_status` is migrated into `providers` for the
existing provider (`slug = 'savant'`, env `PROVIDER_KEY`,
`PROVIDER_BASE_URL`) and then left unread; it is not dropped in this FID.

Free-pool columns: `free_pool_reservations.provider_slug`,
`free_pool_usage.provider_slug` (nullable for legacy rows; default `savant` for
backfill) with the primary key widened to `(user_id, day)` for the user meter
and `(provider_slug, day)` for provider attribution.

### Protocol adapters

| Concern | `openai` kind | `anthropic` kind |
|---|---|---|
| Endpoint | `POST {base}/chat/completions` | `POST {base}/messages` |
| Auth | `Authorization: Bearer <key>` | `x-api-key: <key>` + `anthropic-version: 2023-06-01` |
| Headers | registry `default_headers` (Savant keeps `src: gate`) | registry `default_headers` |
| Request | passthrough | system extraction, required `max_tokens`, content blocks, tool schema translation |
| Stream | passthrough SSE | map `message_start`, `content_block_delta`, `message_delta`, `message_stop` to OpenAI `chat.completion.chunk` events, then `[DONE]` |
| Usage | `usage.prompt_tokens/completion_tokens` | `message_start.message.usage.input_tokens` + `message_delta.usage.output_tokens` |
| Errors | OpenAI envelope | map Anthropic `{type:"error",error:{type,message}}` to OpenAI envelope, preserving 4xx status and genericizing 5xx |

Adapters are pure translation plus a fetch; the gateway, streaming relay, and
settlement stay protocol-neutral. Claude models on a provider that only supports
`/messages` are exposed with `supported_endpoints` from sync; a model whose
endpoint the adapter cannot serve is not marked in catalog.

### Sync

`syncProvider(slug)`:

1. Resolve provider + credential (missing env var → `status = 'unconfigured'`,
   no throw).
2. Fetch models; when `supports_balance` / `supports_subscription`, fetch those
   too, else record `null` and skip the warning.
3. Build rows with `upstream_slug`, `family` (existing `normalizeFamilyName`),
   `cost_source`:
   - provider pricing metadata → `synced` cost;
   - no pricing metadata → `unknown` cost, row visible to admins, hidden from
     sale until an operator enters cost;
   - free-pool rows (`free/*` + `allowFree`) keep weight and zero cost.
4. `replaceModels(rows, markupBps, slug)` marks `in_catalog = 0` only for that
   `upstream_slug`.
5. Update the provider’s status row and return counts per provider.
6. `syncAllEnabled()` runs each independently; one failure never aborts the
   others, and the response is per-provider.

Public id rule: default provider keeps the raw id (`free/gpt-6-luna`).
Non-default providers publish `{slug}/{upstream_id}`. `resolveModel` accepts the
public id first, then the raw id only when unambiguous. Existing customer calls
against Savant ids are unchanged.

### Cost mapping

- `models.cost_source`: `synced | manual | unknown`.
- Admin cost editor sets input/output cost per model; manual values survive
  every sync.
- A paid row with `cost_source = 'unknown'` cannot be activated
  (`PATCH /api/admin/models` rejects status `active` with an explicit error).
- Sell prices keep the FID-004 model: auto from cost + markup, or manual.

### Free pool (amends FID-009)

- Reservation and usage rows carry `provider_slug`.
- The provider floor reads the effective remaining of the provider serving the
  model: `subscription_tokens_remaining − weighted usage since that provider’s
  sync − that provider’s live reservations`.
- Providers without `supports_subscription` enforce the per-user cap only and
  raise the “capacity unknown” operator warning once per hour; they must not
  block free calls on a stale or absent figure.
- The alert threshold is per provider.

### Admin API and UI

- `GET /api/admin/providers` — list with status, counts, capabilities.
- `POST /api/admin/providers` — create (validates slug, kind, URL, env-var
  name; never accepts a secret).
- `PATCH /api/admin/providers/[slug]` — label, base URL, headers, capabilities,
  enabled, sort order.
- `POST /api/admin/providers/[slug]/test` — credential + `/models` probe; returns
  sanitized status.
- `POST /api/admin/providers/[slug]/sync` and `/api/admin/providers/sync` —
  single and all-enabled.
- Admin Providers page: table with kind, URL, key variable name, capabilities,
  status, last sync, error, model counts, enable toggle, test, sync. Model
  tables gain an upstream column, filter, and inline cost editor.
- The legacy `POST /api/provider/sync` remains as a thin alias to
  `syncAllEnabled()` for local tooling.

### Migration

1. Additive schema; insert `savant` provider from current env, copying the
   existing `provider_status` row.
2. Backfill `models.upstream_slug = 'savant'`, `family = provider`,
   `cost_source = 'synced'` where a cost exists, `manual` where
   `price_source = 'manual'`, else `unknown`.
3. Backfill free-pool rows to `savant`.
4. Verify with `npm run verify` on a copy of the working database; the current
   `data/gateway.db` is not committed and can be rebuilt by a sync.
5. Register CommandCode as a second provider with an unset
   `COMMANDCODE_API_KEY`; it stays `unconfigured` until the operator adds the
   key, so the app behaves exactly as today until then.

### Steps

1. Schema plus migration and provider store (`lib/store/providers.ts`).
2. Split `lib/provider.ts` into `lib/providers/registry.ts`,
   `lib/providers/sync.ts`, `lib/providers/openai.ts`, `lib/providers/anthropic.ts`.
3. Provider-scoped `replaceModels`, cost source rules, public id mapping.
4. Gateway routing through the adapter seam; keep streaming and settlement
   protocol-neutral.
5. Provider-scoped free pool.
6. Admin API, admin UI, model table cost editor and upstream filter.
7. Tests: adapter translation (request, stream chunk mapping, usage, error
   envelopes) with recorded fixtures, registry validation, provider-scoped
   sync/catalog isolation, public id resolution, cost-source gates, free-pool
   provider attribution.
8. Docs: README, `.env.example`, knowledge.md, AGENTS.md layout/vocabulary.

### Verification

- `npm run verify` on the migrated tree with two configured providers and one
  unconfigured provider.
- Adapter tests run without network access.
- A disposable-database receipt: register provider B, sync it, confirm provider
  A’s catalog untouched, call one OpenAI-kind model and one Anthropic-kind model
  with a test key, confirm usage rows carry the right `provider_slug` and the
  free pool attributes consumption to the right provider.
- Secret discipline: grep the tree and API responses for the key value; the
  registry stores only the variable name.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/providers.test.mjs — registry validation and protocol routing
- gate: test tests/anthropic-translate.test.mjs — request/response/stream/usage/error translation
- gate: test tests/provider-catalog.test.mjs — provider-scoped identity, protocol, and cost source
- gate: test tests/free-pool.test.mjs — provider floor, provider block, per-user allowance
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: verify — `npm run verify`

### Verification Receipt

- verified 2026-10-29: `npm run verify` exit 0 — lint clean, typecheck clean,
  79/79 tests, quality PASS over 152 files, 39-route production build.
- Disposable database: a copy of `data/gateway.db` booted against the additive
  migration with both providers seeded, all 45 existing models still on
  `savant`, and `provider_slug` present on `free_pool_reservations` and
  `usage_events`. `/models` returned `200` on the migrated copy.
- Live CommandCode inference: not run — no `COMMANDCODE_API_KEY` or second
  upstream account is configured. Adapter coverage is fixture-based and
  network-free.

## Non-Goals

- No automatic failover, retry-to-another-provider, or weighted load balancing.
  Routing is per model; a failed provider fails its models.
- No embeddings, image, audio, or Responses API translation. Only Chat
  Completions (OpenAI kind) and Messages (Anthropic kind) are served; other
  endpoints stay hidden until an adapter exists.
- No provider credential storage in the database, encrypted or otherwise.
  Secrets stay in `.env.local`; the registry stores the variable name.
- No automatic CommandCode subscription purchase or balance top-up. Funding the
  second upstream account is an operator action outside the app.
- No public provider branding. `owned_by` remains `savant-gateway`.

## Missed Questions

1. **Won’t a second provider break `/v1/models` `owned_by`?** No. `owned_by` is
   the gateway; upstream identity is internal. The public contract is unchanged.
2. **How do model ids collide?** They cannot: rows are unique on
   `(upstream_slug, upstream_id)` and public ids are namespaced for non-default
   providers.
3. **What happens to customers who hold keys?** Nothing. Keys are
   gateway-scoped, not provider-scoped. Routing changes per model, not per key.
4. **Can the free pool still be drained by one provider?** No. Each provider’s
   floor is enforced against that provider’s remaining figure and reservations;
   the per-user daily allowance still applies globally.
5. **What if CommandCode’s pricing page changes?** Costs are operator-entered
   and survive sync; `cost_source = 'synced'` only when the provider publishes
   machine-readable prices.
6. **Which protocol serves Claude on CommandCode?** Anthropic Messages
   (`/provider/v1/messages`). A model advertising `supported_endpoints` without
   a servable endpoint is excluded from the catalog rather than failing at call
   time.
7. **What if the operator only wants one provider enabled?** Supported.
   Disabled providers keep their rows and sync status but publish nothing and
   reject calls.

## Perfection Loop

### Loop 1 — RED

- **RED:** single-provider assumptions in credentials, status, catalog key,
  sync scope, routing, pricing feed, and the free pool.
- **GREEN:** provider entity, protocol adapters, scoped sync, manual costs,
  provider-scoped free pool, admin controls.
- **AUDIT:** design reviewed against `lib/provider.ts`, `lib/store/models.ts`,
  `lib/store/provider.ts`, `lib/gateway.ts`, and the CommandCode provider docs.
  Implementation and gate output are recorded under Implementation Evidence.
- **ADVERSARIAL:** the largest risk is silent routing or catalog damage during
  migration. Mitigations: additive columns with defaults, provider-scoped
  `in_catalog`, and an unconfigured-by-default second provider.
- **CHANGE DELTA:** new record; no prior text.

### Missed Questions (implementation pass)

1. **Does FID-007/008 collide?** Both touch `models`; this FID’s additive
   columns must land first or be co-designed. Sequence: 009 → 010 → 007 → 008.
2. **Where does `family` live for display?** `toModelSummary` keeps returning
   `family`; the UI is unchanged.

### Implementation Evidence

- [x] **Commit SHA:** `957430cb4ad3bebe3a63697a3d281cc383308aea`.
- [x] **File:line ranges:**
  - schema: `lib/schema/columns.ts:1-26`, `lib/schema/providers.ts:1-150`,
    `lib/db.ts:1-343`
  - registry and adapters: `lib/providers/registry.ts:1-188`,
    `lib/providers/catalog.ts:1-118`, `lib/providers/sync.ts:1-240`,
    `lib/providers/request.ts:1-167`, `lib/providers/openai.ts:1-18`,
    `lib/providers/anthropic.ts:1-55`, `lib/providers/types.ts:1-64`,
    `lib/providers/anthropic-request.ts:1-220`,
    `lib/providers/anthropic-response.ts:1-56`,
    `lib/providers/anthropic-stream.ts:1-256`
  - persistence and routing: `lib/store/providers.ts:1-324`,
    `lib/store/provider.ts:1-16` (default-provider compatibility read),
    `lib/store/models.ts:1-307`, `lib/store/free-pool.ts:1-247`,
    `lib/store/usage.ts:1-148`, `lib/store/shared.ts:1-199`,
    `lib/store/overview.ts:1-132`, `lib/gateway.ts:1-330`
  - admin: `app/api/admin/providers/` (five route modules),
    `app/api/admin/models/route.ts:1-85`, `app/admin/(panel)/providers/page.tsx`,
    `components/admin/providers-panel.tsx:1-282`,
    `components/admin/provider-form.tsx:1-162`,
    `components/admin/models-table.tsx:1-302`,
    `components/admin/model-cost-editor.tsx:1-82`
- [x] **Gate output:** `npm run verify` exit 0 (lint clean, typecheck clean,
  79/79 tests, quality PASS over 152 files, 39-route build). Migration receipt
  on a disposable copy is recorded under Verification Receipt.
- [x] **Reproducibility:** copy `data/gateway.db*` to a scratch directory, run
  `DB_PATH=./scratch/gateway.db npm run dev`, load `/models`, then inspect the
  `providers`, `models`, `free_pool_reservations`, and `usage_events` columns.
  Unit and translation gates run with `npm test`; no network is required.
- [x] **Step statuses:** steps 1–8 implemented. Live second-upstream inference
  remains blocked on an operator credential, which is a verification limit,
  not an implementation gap.

## Resolution

- **Closed Date:** 2026-10-29, against
  `957430cb4ad3bebe3a63697a3d281cc383308aea`.
- **Fix Description:** the gateway now has a first-class provider registry and
  routes each model by its provider's protocol. Sync, model identity, costs,
  free-pool floors, usage attribution, and admin controls are provider-scoped;
  the default provider's existing ids and rows survive the additive migration.
- **Tests Added:** `tests/providers.test.mjs` (registry and protocol routing),
  `tests/provider-catalog.test.mjs` (scoped identity, cost source, family),
  `tests/anthropic-translate.test.mjs` (request, response, stream, usage,
  errors), plus the existing `tests/free-pool.test.mjs` provider-floor cases.
- **Verification Evidence:** `npm run verify` exit 0 at commit `957430c` with
  79/79 tests and a 39-route build; disposable-database migration preserved 45
  existing Savant models and seeded both providers. Live CommandCode inference
  was not run.
- **Archived:** `dev/fids/archive/FID-2026-1029-010-multi-provider-registry.md`.

## Lessons Learned

A provider is a domain entity, not an environment variable. The cost of
retrofitting a registry grows with every subsystem that assumes one upstream, so
the provider dimension belongs in the schema before the second integration
lands.
