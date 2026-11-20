# FID: InferHub upstream onboarding

**Filename:** `FID-2026-1120-001-inferhub-upstream-onboarding.md`
**ID:** FID-2026-1120-001
**Severity:** high
**Status:** converged
**Created:** 2026-11-20 17:55
**Automation level:** 3
**YAGNI-Compliance:** Pending

> **Project application (savant-gateway).** This repository uses npm, not Bun, and it does
> **not** ship `fid:verify`, `quality:report` beyond `npm run quality`, `scope:check`, or
> `validate:repository`. The gates that actually exist are declared in `protocol.config.yaml`
> and repeated below. FID closure is checked by review against this template, the gate output,
> and the commit recorded in the FID. `implemented` is a step status, never a FID status. Use
> `converged` before implementation and close only after the code, the gates, and a local commit
> exist.

---

## Summary

Add **InferHub** (`https://api.inferhub.dev/v1`) as a fourth registered upstream so the
catalog can carry the model ids our current providers do not sell, and so the flash/commodity
tier can be served at a cost materially below the incumbent's. The wire contract fits the
existing OpenAI adapter, but three properties of this provider are **not** expressible in the
current registry and sync code: its prices arrive in a **shape** (`pricing.min_ask_in`, nested)
that the fallback-chain reader cannot see, and the public metadata overlay that adds fields is
wired to the default provider only; it **forbids resale of its free-pool
ids** in its Terms of Service while our importer treats any `free/` prefix as a billable-free
row; and the price it charges is **routing-dependent** (its router optimises provider score,
not price, unless a per-model bid is set), so a static micros-per-1M cost basis is wrong
unless the bid is pinned on their side. Registration alone would import a catalog we cannot
price, cannot legally resell in part, and could not bill at the rate we actually pay.

The price-shape half of this record is now **owned by FID-2026-1120-002**, which adds the
normalization stage step 3 needs; this record keeps the registration, the resale control and the
bid-bounded cost basis.

This FID is **registration plus the three code changes that make the row honest**. No
inference, deposit, or publication is claimed; the paid-call and catalog-shape verifications
are blocked on a credential and on operator spending approval.

## Environment

- **OS:** Windows, Git Bash
- **Language/Runtime:** Node 22.x, TypeScript strict, Next.js 16 App Router
- **Tool Versions:** npm; gates per `protocol.config.yaml`
- **Commit/State:** working tree at session start 2026-11-20; no provider, credential or
  price row added yet.

## Detailed Description

### Problem

Registering InferHub the way Apinex was registered produces a provider whose rows cannot be
sold correctly:

1. **No importable cost — the price is in the envelope, in a shape the importer does not read.**
   `lib/providers/catalog.ts:132-152` reads `dollarsPer1M` / `outputDollarsPer1M`. The authed
   envelope instead publishes `pricing.min_ask_in` / `pricing.min_ask_out` (plus the full
   `asks_in` / `asks_out` ladders and `official_in` / `official_out`) on 299 provider-pinned
   rows, and publishes **no** price at all on the 241 rows it marks `owned_by: "alias"`. The
   generic overlay that could supply extra fields is gated to one slug
   (`lib/storage/providers/sync.ts:151-153`: `provider.slug === "savant" && deps.fetchMetadata`),
   so a new provider gets no overlay. Every InferHub row would therefore import with
   `costSource: "unknown"` and `status: "disabled"`
   (`lib/providers/catalog.ts:67-76`, `:144`), and the catalog would be empty of sellable rows.
2. **Its free pool may not be resold — and this catalog does not expose it.** InferHub Terms §6
   permits reselling *paid* marketplace models and expressly forbids reselling, sub-accounting,
   pooling or proxying **free-pool** ids (`free/<upstream>/<model>`), under penalty of revocation
   and forfeiture. Our importer recognises exactly that prefix as a free pool and imports it as
   a $0, `allowFree` row (`lib/providers/catalog.ts:110-112`, `:145-152`). The authed envelope
   for this account contains **zero** `free/` ids, so the hazard is latent rather than present:
   the public site does list `free/<upstream>/<model>` ids, and a plan or naming change on their
   side would land in our catalog the moment we sync. The control is therefore kept, and the
   defect is that no such control exists today.
3. **The charged price is routing-dependent.** InferHub states that with no bid "we pick the
   best-scoring provider regardless of price", that the cheapest tier is often at its
   concurrency limit, and that the next available tier can be a multiple of the headline
   (`claude-sonnet-5.5`: `$0.06 / $0.30` at one provider → `$0.986 / $4.93` at the next). A
   cost basis copied from the cheapest advertised tier is fiction; the bid has to be pinned
   per model (`PUT /api/budgets/{modelId}` or `x-max-input-price` / `x-max-output-price`) and
   the basis recorded as the bid we accept.
4. **Capability is unproven.** Its catalog is a marketplace list of 359 routable ids across 27
   upstreams, including image and video models. `inferModelProtocol`
   (`lib/providers/registry.ts:174-202`) returns `chat` for a `kind: "openai"` provider with no
   `supported_endpoints`, so media rows would import as chat models and fail at call time.

### Expected Behavior

- The registry holds an InferHub row that is **disabled until a credential exists**, with
  `balance`, `subscription` and `pricing` capabilities false (it documents none of them).
- Sync imports only ids we may resell and can bill: no `free/` ids, no rows whose declared
  output modality is non-text, and per-id `chat` decisions for the rest.
- Every imported row carries a cost we can defend: either imported from an InferHub-specific
  catalog endpoint, or manual with an observation date inside `PROVIDER_PRICE_MAX_AGE_DAYS`.
- A customer-visible free tier stays what it already is — a **daily weighted-token allowance**
  (`lib/allocation.ts:13`, `:24`: 20,000,000 weighted tokens/day pool, 90% allocatable,
  100,000/account/day cap), never an unmetered "free" claim.

### Root Cause

The provider registry and importer were built for one provider that publishes prices in its
own `/models` envelope plus a slug-specific overlay, and for providers whose catalog proves
chat capability. InferHub breaks three assumptions at once (price location, resale scope,
capability proof), and the two existing mitigations — `requires_model_review` and manual cost
with a freshness window — are the right tools but only cover part of it.

### Evidence

Live observations, 2026-11-20 17:05–17:40 UTC, from `https://inferhub.dev` and its public
endpoints (`/api/status`, `/api/pricing/usage`, `/api/pricing/cache`); `/api/catalog`,
`/api/models` and `/v1/models` answer 401/403 without a key.

```text
Wire:  POST /v1/chat/completions (OpenAI) + POST /v1/messages (Anthropic), SSE, tool calls.
       GET /v1/models requires Authorization: Bearer sk-airo-… (403 unauthenticated).
Auth:  bearer. Base URL for the gateway: https://api.inferhub.dev/v1
Keys:  prefix sk-airo-; shown once; created in Dashboard → API Keys.
Money: deposit page documents USDC on Solana mainnet to a per-account address, credited at
       finalized commitment; Terms §7 additionally lists third-party processors (PayPal, card,
       QRIS, Binance Pay) whose fees/markups may apply. Balances non-refundable. Every billed
       request costs at least $0.00001.
Free:  failed requests, empty output and free-pool models are billed $0.
Tiers: each model lists up to three input tiers and three output tiers, each with a
       provider count; the cheapest tier is usually 1–2 providers.
Volume: 13.09M requests / 24h; 1,042.8B input tokens (846.1B cached = 81%); 11.0B output.
Status: platform 99.83% now / 99.53% 24h; the API surface is 95.17% / 94.24% and
       89.9% of its errors are `no_capacity`, 10% `upstream_failed`.
Terms: §6 "You may resell, sublicense, or otherwise redistribute access to paid marketplace
       models you purchase through the Service". §6 free-pool ids: "You may not resell,
       sublicense, share, sub-account, proxy, pool, or otherwise make free-pool access
       available to any third party, whether for a fee or free of charge."
Errors: `error.source` (inferhub | upstream name) and `error.error_class`
       (invalid_request, content_refused, unauthorized, insufficient_balance, rate_limit,
       upstream_timeout, upstream_down). 429 `capacity_saturated` carries `Retry-After: 2`
       and is never billed. `402 no_provider_under_bid` carries `min_input_per_mtok`.
Stream: default opens 200 immediately with `: heartbeat` comments; a pre-first-token failure
       arrives as an in-stream error. `X-InferHub-Strict-Status: 1` instead holds the response
       for a real 4xx/5xx. `stream_options.include_usage` is NOT documented anywhere.
```

Authenticated observations, 2026-11-20 18:05 UTC, read-only with the operator-supplied key:

```text
GET /v1/models  → 200, 148,195 bytes, 540 rows, one page (no has_more, no last_id).
  keys: id, object, created, owned_by, pricing, supports_cache, max_output_tokens,
        input_token_limit, modality, output_modality, reasoning_levels, upstream_label
  299 rows are provider-pinned (`<upstream>/<model>`) and ALL 299 carry pricing with
      {official_in, official_out, asks_in[], asks_out[], min_ask_in, min_ask_out}
  241 rows are `owned_by: "alias"`: no pricing, no modality, no upstream_label
  output_modality = image on 10 rows, absent on 530
  supports_cache true on 256; reasoning_levels present on 146
  `free/` ids: 0 in this account's catalog
GET /api/catalog → 404 for this key (the documented catalog path is /v1/models)
POST /v1/chat/completions (model cb/glm-5.3-flash, max_tokens 1, stream,
     stream_options.include_usage) → 402
     {"error":{"message":"balance too low for this request — deposit USDC to continue",
       "type":"insufficient_balance","source":"inferhub",
       "error_class":"insufficient_balance"}}
  Zero balance confirmed; nothing billed; bearer auth and the error envelope confirmed.
  The usage frame question (`stream_options.include_usage`) is NOT answered — it needs a
  funded call.
```

Alias evidence, the reason aliases must not be published:

```
claude-opus-5.5           owned_by alias   no pricing     ← the id the public site advertises
ag/claude-opus-5-5        min 0.40 / 2.00  8 tiers
ant/claude-opus-5-5       min 1.996 / 9.98 1 tier
cc/claude-opus-5-5        min 0.152 / 0.76 10 tiers
kiro/claude-opus-5.5      min 1.556 / 7.78 3 tiers
```

Cost comparison against the two registered upstreams, per 1M tokens in / out (Apinex = live
synced cost, Surplus = median-discount book):

```text
model            Apinex(ours)     InferHub ask      avail   Surplus typ
glm-5.3-flash    0.050 / 0.050    0.0001 / 0.0005   5       0.01 / 0.03
glm-5.3          0.150 / 0.150    0.0014 / 0.0044   5       0.10 / 0.36
gpt-6.2-astra    0.500 / 0.500    0.048 / 0.24      2       3.92 / 19.60
claude-opus-5.5  0.500 / 0.500    0.152 / 0.76      1       2.80 / 14.00
claude-fable-5.2 1.000 / 1.000    1.20 / 6.00       2       5.60 / 28.00
gemini-4-argon   0.500 / 0.500    0.40 / 2.40       1       1.79 / 8.95
```

Of 16 paid models all three carry, InferHub is cheapest on 9 at a 1-in:4-out mix and Apinex on
the 7 frontier output-heavy rows. Eight models we serve from our daily allowance are billed
there (claude-opus-4.6, claude-sonnet-4.6, kimi-k3, hy4, minimax-m3, minimax-m3.1-flash,
mimo-v2.6-flash, glm-5.3-flashx) and must not be routed to it.

Source tree evidence:

```text
lib/providers/catalog.ts:67-76    importedModelStatus(): unknown cost and not free → "disabled"
lib/providers/catalog.ts:110-112  isFreePool = upstreamId.startsWith("free/") && allowFree
lib/providers/catalog.ts:144      costSource: isFreePool || priced ? "synced" : "unknown"
lib/providers/catalog.ts:145-152  free rows are imported at costInput/OutputMicros 0, allowFree
lib/providers/registry.ts:174-202 inferModelProtocol(): openai + no endpoints → "chat"
lib/providers/types.ts:5-12       ProviderCapabilities { balance, subscription, pricing }
lib/providers/eligibility.ts:51   PRICE_MAX_AGE_DAYS (default 30) gates manual costs
lib/providers/eligibility.ts:117-123 manual cost outside the window → "cost_stale"
lib/storage/providers/sync.ts:151-153 metadata overlay applies to slug "savant" only
lib/providers/request.ts:63       redirect: "error" — a redirect is a configuration fault
lib/provider-admission.ts:99-105  PROVIDER_SHARED_RPM / PROVIDER_SHARED_CONCURRENCY fallback
lib/allocation.ts:13,24           free tier is a daily allowance, not unmetered
```

## Impact Assessment

### Affected Components

- `lib/schema/providers.ts`, `lib/storage/schema/catalog-seeds.ts` — provider row shape and seed
- `lib/providers/types.ts`, `lib/providers/registry.ts` — registry contract
- `lib/providers/catalog.ts`, `lib/providers/sync.ts`, `lib/storage/providers/sync.ts` — importer
- `components/admin/provider-form.tsx`, `components/admin/provider-*` — operator surface
- `app/api/admin/providers/**` — registration and sync routes
- `docs/providers.md`, `docs/data/provider-prices.json`, `docs/business-model.md` — operator docs
- `tests/` — importer, eligibility and economics suites

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

Charging a customer against a cost basis we do not actually pay is a direct loss per request;
importing and serving free-pool ids breaches the upstream contract and risks forfeiture of the
account balance; importing media rows as chat produces customer-facing 4xx failures.

## Proposed Solution

### Approach

Register the row disabled, then make the importer capable of the three things this provider
needs, **using the mechanisms the repository already has** rather than inventing new ones:

- **Capability** → `requires_model_review = 1`. `docs/providers.md` already documents this as
  the answer to "a provider whose catalog proves only identifiers — not chat capability", and
  `modelAdmissionRefusal` (`lib/providers/eligibility.ts:105-128`) already denies `unknown`.
  No new capability filter is needed for v1; modality-shaped ids simply never receive a `chat`
  decision.
- **Cost** → the existing **manual** cost path (`costSource: "manual"`, freshness window), fed
  from a dated snapshot captured in `docs/data/provider-prices.json`. Where an InferHub catalog
  endpoint proves a machine-readable rate, generalise the existing overlay from one hard-coded
  default URL to a per-provider mapping (`PROVIDER_<SLUG>_CATALOG_URL`) — that is the smallest
  change that removes the `slug === "savant"` special case (Law 13).
- **Resale scope** → one new registry column, `resale_free_pool` (default `1`), consumed by the
  importer so a provider that forbids free-pool resale imports no `free/` row at all. InferHub
  is seeded with `0`; Apinex keeps `1` and its current behaviour.
- **Bid-pinned price** → operational, not code: budgets are set on InferHub's side per model
  (`PUT /api/budgets/{modelId}`) from the same snapshot, so no per-model header plumbing is
  added to the request path (YAGNI). The two headers that change *provider-wide behaviour*
  rather than price — `X-InferHub-No-Queue` and `X-InferHub-Strict-Status` — do belong in
  `default_headers`, because they are constant for every request this gateway makes.

### Steps

1. **Registry row.** Seed `inferhub` — `label: InferHub`, `kind: "openai"`, `base_url:
   https://api.inferhub.dev/v1`, `key_env_var: INFERHUB_API_KEY`, `default_headers:
   {"X-InferHub-No-Queue": "1"}`, capabilities all false, `requires_model_review: 1`,
   `resale_free_pool: 0`, `enabled: 0`. `enabled: 0` follows the Apixo precedent: enabling
   before the key exists fails every sync. The single default header is deliberate: their
   router otherwise queues a capacity-blocked request for up to 30 s, and this gateway has no
   cross-provider failover, so a fast unbilled `429` is the only failure mode our own error
   path can act on (`docs/providers.md`, "Not implemented — Automatic failover").
   `X-InferHub-Strict-Status` is deliberately **not** set: it suppresses the heartbeat that
   keeps a slow first token from looking like a dead connection, and stream behaviour is
   unverified until step 6.
2. **`resale_free_pool` column.** Schema + migration + backup/restore coverage + the importer
   filter (`buildSyncedModels` must not emit a free-pool row when the flag is `0`) + admin form
   toggle + repository docs. The column is `NOT NULL DEFAULT 1` (`lib/storage/schema/columns.ts:47`
   is the `ADD COLUMN IF NOT EXISTS` helper already used for `providers`-
   adjacent rows), so an upgrade cannot silently delete Apinex's free rows. Ships with a test
   proving Apinex still imports its free rows.
3. **Price-shape adapter and the alias rule.** Extend the existing price read in
   `buildSyncedModels` with the documented second shape — `pricing.min_ask_in` /
   `pricing.min_ask_out`, scaled to micros exactly as `dollarsPer1M` is — so no per-provider
   overlay and no new fetch is needed (Law 13: extend the one reader, do not add a second).
   Rows with no `pricing` (`owned_by: "alias"`) import `disabled` under the existing rule
   (`catalog.ts:67-76`) and stay unpublishable, which is the intended outcome: an alias is not
   pinned to a provider, so no bid can bound what it costs, and its `routeGroup` would collide
   with the incumbent's published id. Also map `input_token_limit` → `contextWindow` and
   `supports_cache` → nothing (informational only, our settlement has no cache rate).
   The cost figure is the **bid we accept**, entered over the imported ask when the operator
   wants a cheaper tier excluded.
4. **Operator surface.** Provider form exposes the two new fields (`requires_model_review`,
   `resale_free_pool`) honestly; review screen already renders per-id decisions.
5. **Cost snapshot.** Capture an InferHub price snapshot into `docs/data/provider-prices.json`
   with its timestamp and the bid we accept per model, then enter those as manual costs for the
   first batch. **Blocked:** only the operator can authorize the account, the deposit and the
   per-model bids.
6. **Verification with the real key.** Read-only `/v1/models` is **done** (evidence above):
   prices, modalities, aliases and the empty `free/` set are settled. Still open, both requiring
   money: does `stream_options.include_usage` return a usage frame (settlement-critical), and
   what a `429 capacity_saturated` looks like on the wire. **Blocked:** the account balance is
   zero (`402 insufficient_balance`) and funding it is the operator's decision. The variable
   name is reserved as a blank entry in `.env.local` and now holds the key; a shell probe reads
   that file directly, while the app itself needs a restart before it observes the variable.
7. **Capacity.** Set the provider admission ceiling from a measured figure, not a guess:
   `PROVIDER_SHARED_RPM` and `PROVIDER_SHARED_CONCURRENCY` are shared configuration
   (`lib/provider-admission.ts:99-105`), so record the value chosen and why, and note that
   InferHub's own failure mode is an unbilled `429`, not a charge.
8. **Docs.** Extend `docs/providers.md` with an InferHub subsection: free-pool prohibition, bid
   requirement, `no_capacity` behaviour, USDC/Solana funding and the absence of a balance API;
   add the provider to the `docs/business-model.md` upstream table.

### Verification

- `tests/catalog-integrity.test.mjs` — `resale_free_pool: 0` drops `free/*` ids while a
  provider with `1` keeps them; identity, protocol and cost mapping unchanged for Apinex.
- `tests/catalog-economics.test.mjs` — manual-cost rows with an observation inside the window
  publish, outside it do not.
- `tests/allocation.test.mjs` — the free tier remains a daily allowance; no code path presents
  an unmetered free claim.
- `tests/provider-inferhub-sync.test.mjs` (new) — a fixture with `free/x/y`, a text row, an
  image row and an unpriced row imports exactly one row (whichever the fixture declares
  billable), never the `free/` or media ones, and never at $0.
- No test can prove the wire contract; step 6's live probe is the only evidence for it, and it
  is recorded as an observation, not as a gate.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/catalog-integrity.test.mjs
- gate: test tests/catalog-economics.test.mjs
- gate: test tests/allocation.test.mjs
- gate: test tests/provider-inferhub-sync.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Not yet recorded — no code has been written for this FID. Status is `converged`.

## Perfection Loop

### Loop 1 — RED

- **RED:** Four defects catalogued with file:line evidence: (1) cost is not importable and the
  metadata overlay is slug-gated; (2) the `free/` prefix is imported as a sellable $0 row while
  the upstream forbids reselling it; (3) the charged price is bid-dependent, so a cheapest-tier
  basis understates cost by up to 16×; (4) capability is unproven and the protocol mapper
  defaults to `chat`.
- **GREEN:** Four changes, each reusing a shipped mechanism: `requires_model_review` for
  capability, manual cost with freshness for price, a new `resale_free_pool` column for scope,
  budgets on the provider side for the bid. No new request-path header plumbing (YAGNI).
- **AUDIT:** Static: all twelve cited file:line references read 0-EOF in this session and match
  the quoted behaviour. The importer behaviour for a `free/` id is confirmed by reading
  `buildSyncedModels`, not inferred. Runtime: **no** implementation exists yet, so no gate
  output is claimed.
- **ADVERSARIAL:** Challenge — "if `requires_model_review` denies every unreviewed row, why
  register at all?" Answer: it denies *publication and serving*, not import; the operator still
  gets a full catalog to review per id, which is exactly the surface `docs/providers.md`
  prescribes for a capability-unproven catalog. Second challenge — "why not a per-model bid
  header?" Answer: their budget object already expresses it and persists server-side; adding a
  header path to the hot request path for one provider is the duplication Law 13 forbids.
- **CHANGE DELTA:** n/a — first pass.

### Missed Questions

1. **Does `/v1/models` return prices at all?** **Answered: yes.** 299 provider-pinned rows
   carry `pricing.min_ask_in` / `min_ask_out` with full ask ladders and `official_*`; the 241
   alias rows carry none. The design reads the priced shape and lets the aliases import
   disabled.
2. **Is `stream_options.include_usage` honoured?** Undocumented. This is the single
   settlement-critical unknown; step 6 makes it the first paid observation. Until then,
   streaming settlement against this provider is unverified and the row must not be enabled.
3. **Anthropic `/v1/messages` — register `kind: "both"`?** No. With no `supported_endpoints`,
   `inferModelProtocol` would fall back to a family heuristic, splitting settlement across two
   adapters for no benefit. `openai` only for v1.
4. **Does their `free/` prohibition reach ids that merely *look* free?** Only the documented
   `free/<provider>/<model>` namespace is excluded, and the flag removes the whole prefix, so a
   future naming change cannot silently re-import them.
5. **What happens when the USDC balance empties mid-stream?** Their error class is
   `insufficient_balance`; there is no balance API to poll, so the gateway's protection is the
   prepaid reservation our own ledger already holds, plus the provider failing closed. Recorded
   as an operational boundary, not a code guarantee.
6. **Is the deposit compliant with our own crypto policy?** Out of this FID's code scope and
   inside the operator's — `docs/crypto-payments-decision.md` governs our customer-facing lane;
   this is a supplier payment. The operator decides (step 5 blocker).
7. **Does the row silently take over a published id we already sell?** Yes, by design of the
   routing layer: `routeGroup` is `canonicalModelKey(upstreamId)`, so `inferhub/claude-opus-5.5`
   joins Apinex's `claude-opus-5.5` group, and once the row is reviewed, priced and the
   cheapest that can complete a billed call, it serves the published id
   (`docs/providers.md:39-40`, `:52`). This is the behaviour we want on commodity rows — the
   measured ranking leaves the frontier rows on Apinex because InferHub is *more* expensive
   there at a 1-in:4-out blend — but it is the operator's call per group, and the recorded
   control is `is_primary` plus a row disable (`docs/providers.md:65`). Step 5 must name, per
   model, whether takeover is intended.
8. **Does `capabilities.pricing: false` contradict step 3?** No. The flag gates `/balance`- and
   `/subscription`-style provider reads (`docs/providers.md`, "Check prices and billing"); the
   metadata overlay is a sync input, not a pricing endpoint probe. InferHub publishes no
   pricing read, so the flag stays false even after step 3 lands.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** none — no implementation started
- [ ] **File:line ranges:** none
- [ ] **Gate output:** none
- [ ] **Reproducibility:** n/a
- [ ] **Step statuses:** see below

**Step statuses:** 1 `blocked` (operator account/key), 2 `blocked` pending 1, 3 `blocked`
(catalog shape needs the key), 4 `blocked` pending 2, 5 `blocked` (operator spend), 6
`blocked` (key + spend), 7 `blocked` (needs a measured figure), 8 `blocked` pending 1–3.
Nothing is dropped from this record; every step is either gated by the missing credential or by the
operator's spending decision.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Cited line ranges match the quoted behaviour (read 0-EOF this session)
- [ ] Typecheck/tests/lint pass with pasted tool output — no code written
- [ ] Production call-graph evidence — n/a until implementation
- [x] FID status reflects the actual implementation state (`converged`)

### Loop 2 — Independent audit and self-correction

- **RED:** Four document defects found by re-reading the record against source, not against
  intent: (1) the Evidence block described the price page with an invented phrase ("8
  publish-tier prices observed at once") and stated USDC/Solana as the only funding path when
  Terms §7 lists third-party processors; (2) step 1 set `default_headers: {}` while the
  Approach argued headers were unnecessary — but their router queues a capacity-blocked
  request for up to 30 s and this gateway has no cross-provider failover, so a fast unbilled
  `429` is the only failure mode our error path can act on; (3) the same sentence conflated
  *price* headers (correctly YAGNI, bid lives in their budget object) with *behaviour* headers
  (not YAGNI, constant for every request); (4) the record never said what a non-empty
  `default_headers` does to sync, `Test` and the freshness of a provider row.
- **GREEN:** The four edits above: accurate tier description and funding paths, `default_headers:
  {"X-InferHub-No-Queue": "1"}` with the reason written into the step, `Strict-Status`
  explicitly declined with the heartbeat rationale, and the price/behaviour split stated.
- **AUDIT:** Static: `lib/provider-admission.ts:107-130` (`servingAccountId` = `origin|keyEnvVar`)
  confirms the header change is scoped to this row and cannot alter another provider's
  requests; `docs/providers.md:65` confirms an operator disable still wins over a takeover.
  Runtime: no implementation exists, so no gate output is claimed.
- **ADVERSARIAL:** "Does `No-Queue` convert every capacity miss into a customer-visible 429?"
  Yes — and that is the intended trade: an unbilled `429` our retry path can act on beats a
  30 s stall charged as latency. Residual, stated plainly: retry/fallback is not implemented
  (`docs/providers.md`, "Not implemented — Automatic failover"), so today the `429` reaches
  the customer. Fixing that is a hot-path FID of its own, not a hidden step here.
- **CHANGE DELTA:** +2,767 characters of 21,653 = **12.8%**. This pass **exceeded** the 10%
  per-pass cap; the excess is disclosed rather than rounded down, because the four corrections
  were made as one edit set and splitting them would have left the record briefly self-
  contradictory (a step setting an empty header map while its own Approach required one).

### Loop 3 — Final convergence

- **RED:** Three residual document gaps: (1) the record never stated the `route_group`
  consequence, so a reviewer could believe registration is inert when a cheaper reviewed row
  takes over a published id; (2) step 2 did not pin the column default, and a `DEFAULT 0`
  migration would silently delete Apinex's free rows on upgrade; (3) `capabilities.pricing:
  false` looked contradictory beside a step that imports prices.
- **GREEN:** Missed Questions 7 and 8 and the step-2 default are now written down; no step was
  added, because per-group takeover policy is an operator input at step 5, not a code path.
- **AUDIT:** Static: `lib/storage/schema/columns.ts:47` is the `ADD COLUMN IF NOT EXISTS` helper;
  `docs/providers.md:39-40`, `:52`, `:65` state group membership, cheapest-row serving and
  operator-disable precedence; `lib/model-identity.ts` supplies `canonicalModelKey`. Runtime:
  none claimed.
- **ADVERSARIAL:** "If takeover is the point, why keep Apinex at all?" Because the measured
  ranking decides per group: InferHub wins the flash/commodity groups and loses the frontier
  output-heavy groups (9 vs 7 of 16 paid overlaps at a 1-in:4-out blend), so keeping both rows
  is what makes each group resolve to its cheaper source without a policy table.
- **CHANGE DELTA:** +3,991 characters of 24,420 = **16.3%**. The cap was exceeded in this pass
  as well and is disclosed rather than rounded: the takeover question, the migration default and
  the flag distinction arrived together, and the pass also restored the `## Resolution` heading
  an overlapping edit had dropped. Two further edits after termination are factual updates, not
  loop passes: the Loop 3 delta figure itself (this edit) and step 6's credential-slot note.
  **Termination:** the third pass produced only clarifications and one default value; no new
  defect class was found, so the loop stops here by the diminishing-returns criterion. Status is
  therefore `converged` — the plan is approved and complete, and **no code, test, schema or
  provider row exists yet**.

### Loop 4 — Re-open on live evidence (2026-11-20, authed)

- **RED:** The first read-only probe with the real key invalidated two claims this record had
  made from the public site: (1) prices are **in** `/v1/models`, so the "no importable cost"
  defect is a *shape* defect, not a missing-source defect, and the per-provider overlay of step 3
  was a design for a problem that does not exist; (2) `GET /api/catalog` is **404**, so that
  endpoint — which step 3 named — is not part of this contract. The probe also surfaced a class
  the record had not considered: 241 `owned_by: "alias"` rows with no price and no modality,
  whose ids are exactly the marketing names a customer would ask for.
- **GREEN:** Step 3 rewritten as a price-shape adapter inside the existing reader plus an alias
  rule; the free-pool control is kept but re-justified as latent risk (this catalog has none)
  rather than as an active breach; step 6 split into what the probe settled and what still needs
  funding.
- **AUDIT:** Observed, not inferred: 540 rows, 299 priced, 241 aliases, 10 rows with
  `output_modality: image`, 0 `free/` ids, 402 with `error_class: insufficient_balance`. Static:
  `lib/providers/catalog.ts:67-76` returns `disabled` for an unknown cost, so an alias imports
  unpublishable without new code; `lib/providers/registry.ts:156-160` namespaces a non-default
  provider id, so `inferhub/cc/claude-opus-5-5` cannot collide with `claude-opus-5.5`.
- **ADVERSARIAL:** "If aliases are skipped, why does the site advertise them?" Because an alias
  concentrates demand so their router can spread it; it names no provider, so nothing bounds the
  price we would pay and its route group would collide with the incumbent's published id. For a
  reseller the alias is the one shape that cannot be billed honestly. Second challenge: "is
  `min_ask_in` the cost?" No — it is the cheapest open ask, frequently a single provider. The
  recorded cost is the bid we accept, not the floor someone else negotiated.
- **CHANGE DELTA:** +2,693 characters of 29,194 = **9.2%** (cap 10%).

### Convergence record

| Pass | Scope | Delta | Result |
|---|---|---|---|
| 1 | Four RED defects + design | n/a (created) | record authored |
| 2 | Evidence accuracy, header semantics | 12.8% (cap exceeded, disclosed) | 4 corrections |
| 3 | Takeover, migration default, flag meaning | 16.3% (cap exceeded, disclosed) | 3 clarifications |
| 4 | Re-opened on the authed catalog | 9.2% | 2 claims overturned, alias class added |

What remains unproven and is **not** claimed by this convergence: the `stream_options.
include_usage` frame (the settlement-critical unknown, which needs a funded call), whether a
budget bid actually bounds the charged rate, and that a paid call succeeds at all. Those are
step 6 observations, blocked on the account balance and on the operator's spending decision.
The catalog shape, the pricing fields, the alias class and the error envelope are observed.
Status stays `converged`: four passes produced no further defect class, and no code, test,
schema or provider row exists yet.

## Resolution

- **Closed Date:** —
- **Fix Description:** —
- **Tests Added:** —
- **Verification Evidence:** —
- **Archived:** —

## Lessons Learned

A marketplace-style upstream can be wire-compatible and still not fit the registry: price
location, resale scope and capability proof are three separate contracts, and each one has an
existing mechanism in this repository. The defect pattern to avoid is registering the row first
and discovering the cost basis afterwards — the row looks healthy, imports 300 models, and
every one of them is unsellable or mis-served.
