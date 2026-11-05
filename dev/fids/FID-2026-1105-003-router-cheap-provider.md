# FID: router.cheap provider integration

**Filename:** `FID-2026-1105-003-router-cheap-provider.md`
**ID:** FID-2026-1105-003
**Severity:** high
**Status:** fixed
**Created:** 2026-11-05 14:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

> **Project application (savant-gateway).** This repository uses npm, not Bun,
> and it does not ship `fid:verify`, `quality:report` beyond `npm run quality`,
> `scope:check`, or `validate:repository`. The gates that actually exist are
> declared in `protocol.config.yaml` and repeated below. FID closure is checked
> by review against this template, the gate output, and the commit recorded in
> the FID. `implemented` is a step status, never a FID status. Use `converged`
> before implementation and close only after the code, the gates, and a local
> commit exist.

---

## Summary

Integrate router.cheap as a provider through the existing registry, provider-scoped
sync, admin controls, OpenAI chat adapter, shared admission and settlement paths.
The account catalog is an identifier list, not a chat-capability or price catalog.
A separate reseller price feed and a public endpoint feed provide evidence, but
neither proves the root model key's billing basis, the serving source or model
identity. This FID defines a durable, operator-reviewed chat-eligibility decision
per provider and exact upstream model id; a per-provider review flag so existing
providers keep their current semantics; and a rule that only reviewed chat models
with known positive input and output costs and a valid sell price may publish,
route or serve. It records the three feeds for operator review but does not import
their prices automatically. The design is implemented in the working tree; no
paid inference, funding or reseller management write was performed.

## Environment

- **OS:** Windows (win32), commands run through bash.
- **Language/Runtime:** Node.js `v24.21.0`; TypeScript strict; Next.js `16.4.3`; React `19.3.0`.
- **Tool Versions:** npm; PostgreSQL `17.11` pinned through `@embedded-postgres/windows-x64`; PGlite for unit fixtures; `node --test`.
- **Commit/State:** baseline commit `d874b9d` (`docs(fids): close FID-009 and authorize FID-013A`). The FID, the census, `SCOPE.md`, `dev/fids/README.md` and `docs/providers.md` are uncommitted working-tree changes. Both `ROUTER_CHEAP_API_KEY` and `ROUTER_CHEAP_RESELLER_API_KEY` are present in `.env.local`; their values were used only as bearer headers and were never printed, logged or written to a document.

## Detailed Description

### Problem

The authenticated `GET https://router.cheap/v1/models` returns the OpenAI list
envelope with 76 entries, but each entry carries only `id`, `object`, `created`
and `owned_by`. It carries no endpoint types, costs, context windows, tool or
vision support, free access or rate limits. The response includes `tts-1`,
`grok-imagine-video-1.5` and other non-chat ids.

`buildSyncedModels` passes an absent `supported_endpoints` to
`inferModelProtocol`. For `kind: "openai"`, an empty endpoint list returns
`"chat"`, so importing the whole response would represent every media model as a
chat model. The current cost parser reads only `dollarsPer1M` and
`outputDollarsPer1M`, which this response does not contain; every row would
arrive with `costSource: "unknown"` and import disabled. A second, independent
risk sits in that parser: a missing or zero output figure falls back to the input
figure, which would invent an output rate if a future feed supplied only one
side.

The authenticated reseller `GET /api/reseller/v1/prices` returns 76 plan rows
with `available`, `source`, `billing`, customer prices in configured units and
`cost_*_usd` figures. The public `GET /api/pricing` returns 76 rows with
`supported_endpoint_types`, `billing_expr`, `pricing_version` and tier metadata.
Neither feed proves that a root model key is billed like a reseller customer,
which source will serve a family, or whether account or key model mapping
substitutes a different model. A one-minute cached price snapshot is not a
request-time guarantee.

### Expected Behavior

The operator can register and operate router.cheap through the existing admin
systems, with catalog discovery, chat eligibility, costs, sell prices,
publication, routing and settlement kept distinct. Every discovered row appears
in the operator inventory with its eligibility and unknown price visible. Only a
row whose exact provider and upstream id have an operator-recorded `chat`
decision, a known positive input cost, a known positive output cost and a valid
sell price may be published, selected as a serving route or admitted by the
gateway. Unknown stays unknown and is not served. Existing providers keep their
current behavior because the review flag defaults off.

A sync failure must not erase another provider's models, a manual cost, a sell
price, a manual group assignment, an operator disable or a recorded eligibility
decision. A delisted model keeps its decision; if it returns, the decision is
still there. The reserve host is not used automatically. No paid call is retried
on another route after a failure.

### Root Cause

- `lib/providers/registry.ts:196` returns the default protocol for an OpenAI
  provider when no endpoint list is present: `if (input.kind === "openai") return "chat";`.
- `lib/providers/catalog.ts:83` (`buildSyncedModels`) accepts that default and
  has no capability decision; `lib/providers/catalog.ts:131` contains the output
  fallback: `outputRaw == null || outputParsed === 0 ? inputUsd : outputParsed;`.
- `lib/model-routing.ts:53` (`isServableRoute`) checks provider enabled, active
  status, catalog membership, known cost and any sell price, but it does not
  check chat eligibility. `lib/model-routing.ts:79` (`planModelRoutes`) can
  therefore select a namespaced review-provider row as the serving route for an
  unscoped published id.
- `lib/storage/store/model-sync.ts:138` preserves the previous row status:
  `current?.status ?? importedModelStatus(...)`. A row that was active can stay
  active when a later sync reports an unknown cost, so the runtime gate must not
  trust status alone.
- `lib/storage/store/model-sql.ts:63` (`PUBLIC_MODEL_SCOPE`) checks active,
  primary, group visibility, sell price and manual-cost freshness, but it does
  not check chat eligibility or a positive output cost.
- `lib/storage/gateway/resolution.ts:21` (`resolveModel`) resolves an exact
  public id, aliases and then an upstream id; `lib/storage/gateway/call.ts:138`
  admits it after checking only `model.status` and `provider.enabled`. A direct
  namespaced id therefore bypasses a public-list-only eligibility filter.
- `lib/storage/schema/catalog.ts` has provider, group, model, price and route
  columns, but no per-provider or per-model capability decision.
  `lib/storage/schema/catalog-seeds.ts:123` (`seedProviders`) hard-codes savant,
  commandcode and apixo, so a disabled router.cheap preset is a seed change.
- `lib/storage/store/models.ts:94` refuses to activate a row only when
  `cost_source === "unknown"`; it does not require positive input and output
  costs or a chat decision. `setModelCost` at `lib/storage/store/models.ts:146`
  writes `cost_observed_at` and `cost_source = 'manual'`, but it accepts zero
  figures.

### Evidence

Read-only probes on 2026-11-05, no inference and no management write. The model
and reseller requests used bearer credentials loaded from `.env.local`; no
credential value appears in this record.

```text
GET https://router.cheap/v1/models -> 200, 76 rows, 76 unique ids, 0 duplicates
  fields: [id, object, created, owned_by]
  samples: tts-1, grok-4.6, claude-haiku-4-5

GET https://router.cheap/api/pricing -> 200, 76 rows
  row fields: billing_expr, billing_mode, billing_multiplier, cache_ratio,
    completion_ratio, context_length, description, enable_groups, model_name,
    model_price, model_ratio, owner_by, pricing_version, quota_type,
    supported_endpoint_types, vendor_id
  top-level: pricing_version, supported_endpoint, usable_group, vendors
  pricing_version: a42d372ccf0b5dd13ecf71203521f9d2

GET https://router.cheap/api/reseller/v1/prices -> 200, 76 rows
  plan_id: 144, plan_version: 2, pricing_mode: markup, unit_name: "$"
  row fields: model, group, source, billing, available, input_per_million,
    output_per_million, cache_read_per_million, per_request,
    cost_input_per_million_usd, cost_output_per_million_usd,
    cost_per_request_usd
  sample: claude-fable-5, available true, billing tokens, source kiro,
    cost_input_per_million_usd 0.36, cost_output_per_million_usd 1.80,
    input_per_million 0.468, output_per_million 2.34, cache_read_per_million 0.0468

GET https://router.cheap/api/reseller/v1/customers?limit=1 -> 200, 0 rows,
  has_more false

Three-source exact-name join:
  76 listed; 68 plan-available; 50 token-billed (42 available);
  47 token-billed rows labelled openai by the public feed;
  39 of those are plan-available; 13 image, 11 video, 5 speech.
  A zero cost on an unavailable row is not a free price.
```

The audit snapshot with the full model list and per-row figures is
`dev/audits/2026-11-05-router-cheap-model-census.md`. The public pricing feed
labels endpoint types; it does not prove a successful chat request, source
selection or request-time charge. The reseller costs are reseller-customer
figures, not proof of root-key billing. The model API guide states that model
mapping can replace the requested model and that the operator pays for the model
and source that actually serve the request; the requested id alone is not proof
of identity or cost.

Planning baseline on the same tree:

```text
npm run lint -> exit 0
npm run typecheck -> exit 0 (Types generated successfully)
node --test tests/providers.test.mjs tests/provider-sync.test.mjs
  tests/provider-readiness.test.mjs tests/provider-sync-postgres.test.mjs
  -> 31 tests, 31 pass, 0 fail, 0 skipped
npm run quality -> PASS (400-line ceiling, 633 files scanned)
npm run build -> exit 0
```

The earlier record claimed `npm run repository:check` exit 0 while this FID was
`analyzed`. That is not reproducible: the active-status contract rejects the
status before the design is considered.

```text
npm run repository:check -> exit 1
  - dev/fids/FID-2026-1105-003-router-cheap-provider.md:
      active status analyzed is not allowed
  - dev/fids/FID-2026-1105-003-router-cheap-provider.md:
      promised test path does not exist: tests/router-cheap-provider.test.mjs
```

## Impact Assessment

### Affected Components

- `lib/providers/registry.ts`, `lib/providers/catalog.ts`,
  `lib/providers/model-list.ts`, `lib/providers/openai.ts` and
  `lib/providers/request.ts`.
- `lib/storage/schema/catalog.ts`, `lib/storage/schema/catalog-seeds.ts`,
  `lib/storage/store/model-sync.ts`, `lib/storage/store/models.ts`,
  `lib/storage/store/model-sql.ts`, `lib/storage/providers/sync.ts`.
- `lib/providers/types.ts`, `lib/storage/store/provider-rows.ts` and
  `lib/storage/store/providers.ts` for the `requires_model_review` read path
  and its preservation on update.
- `lib/model-routing.ts`, `lib/route-reconcile.ts`,
  `lib/storage/gateway/resolution.ts`, `lib/storage/gateway/call.ts`,
  `lib/projections.ts`, `lib/storage/store/subscription-access.ts`.
- Provider and pricing administration under `components/admin/`,
  `app/api/admin/`, `app/admin/(panel)/providers/`, `app/admin/(panel)/pricing/`.
- `docs/providers.md`, the operator first-run guide and the focused provider,
  sync, HTTP and PostgreSQL suites.
- There is no `.env.example`, `.env.sample` or `.env.template` in this tree; the
  environment-variable names are documented in `docs/providers.md`, and the
  values live only in `.env.local`.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: incorrect model eligibility or cost can misrepresent service or
  cause incorrect accounting; upstream availability and pricing are not proven
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Register `router-cheap` as a provider row with label `router.cheap`, kind
`openai`, base URL `https://router.cheap/v1`, key variable
`ROUTER_CHEAP_API_KEY`, empty default headers and all three capability flags
false. Seed it disabled, `status` `unconfigured`, `sort_order` 40, through an
`INSERT ... ON CONFLICT DO NOTHING` in `seedProviders`. The `rsk_` management
token is not a model credential and is not stored in the provider row; it is
used only by a server-side, read-only review surface for the reseller price
list. No router.cheap customer, customer key, wallet, plan or webhook is
created. Savant keeps its own customer keys, ledger, holds and settlement.

Add a durable per-provider review flag and a per-model decision. The provider
row gets `requires_model_review INTEGER NOT NULL DEFAULT 0`; the router.cheap
seed sets it to 1, so every existing provider keeps its current behavior. A new
table `model_eligibility` is keyed by `(provider_slug, upstream_id)` with
`decision` in `('chat', 'unsupported', 'unknown')`, `source`, `observed_at` and
an optional `note`. It is created with `CREATE TABLE IF NOT EXISTS`; no existing
row is rewritten. Absence means unknown, which is not eligible. A decision
survives a catalog refetch and a delisting; it is not deleted when a model
disappears. The operator can set or revise a decision in the provider review
UI. The default for a review-required provider is unknown and denied. No
prefix, family, price, OpenAI envelope or empty endpoint list is evidence of
chat capability.

A single rule decides eligibility:
`requires_model_review = 0 OR decision = 'chat'`. It is implemented once as a
SQL predicate in `model-sql.ts` and once as a pure TypeScript helper in a new
`lib/providers/eligibility.ts`; both are covered by the same table-driven tests
so they cannot drift. The effective route for a published row is
`COALESCE(served_provider_slug, upstream_slug)` plus
`COALESCE(served_upstream_id, upstream_id)`; a namespaced direct row uses its
own provider and upstream id.

Enforce the rule at every selection point, not only in the public list:

1. **Public projection.** `PUBLIC_MODEL_SCOPE` gains an eligibility predicate
   for the effective route. For a review-required paid route it requires the
   effective cost figures (`COALESCE(served_cost_input_micros,
   input_price_micros)` and the output equivalent) and the effective sell
   prices to be greater than zero, and it applies the manual-cost freshness
   guard to the effective route (`COALESCE(served_provider_slug, upstream_slug)`
   plus `COALESCE(served_upstream_id, upstream_id)`), not only to the published
   row's own cost. The public list cannot show an ineligible or stale route.
2. **Route reconciliation.** `RouteCandidate` carries `requiresReview`,
   `decision` and the manual-cost observation time; `isServableRoute` rejects a
   review-required row unless the decision is `chat`; for a paid group it also
   requires positive input and output costs, positive sell prices and, when the
   cost is manual, an observation inside `PROVIDER_PRICE_MAX_AGE_DAYS`.
   `planModelRoutes` must not use an
   ineligible namespaced row as the fallback `publishedId`; if the unscoped
   row is ineligible, the group is hidden rather than promoted under another
   provider's name. Reconcile after every decision, cost, price, status and
   provider change.
3. **Direct ids and alternative routes.** `getModelForGateway` returns the
   effective route's review state and decision in `GatewayModel`;
   `handleChatCompletions` refuses an ineligible model before authentication of
   the upstream call, so a client-supplied `router-cheap/<id>`, an alias or a
   non-primary row cannot bypass the gate. The same resolved model feeds
   `resolveSubscriptionAccess`, so a subscription entitlement snapshot cannot
   admit an ineligible row.
4. **Alternative candidates.** The candidate filter applies to every row in the
   `route_group`, not only to the published id. A cheaper but unverified
   equivalent never wins, and a previously published price or subscription
   snapshot never gains an unreviewed route.

Do not automatically import the reseller or public price feed into `models`.
The two feeds use different units and scopes, and root-key billing is unproved.
The operator review surface may show the three sources side by side with
`source`, `observed_at`, plan id/version and availability, but it must not write
a cost from them. Cost entry stays the existing manual path: the operator
records input and output cost, the server writes `cost_source = 'manual'` and
`cost_observed_at`, and the existing 30-day manual-cost freshness guard
(`PROVIDER_PRICE_MAX_AGE_DAYS`, default 30) applies. For a review-required paid
row, activation is refused unless eligibility is `chat`, input cost is greater
than zero, output cost is greater than zero and a valid sell price exists. The
shared importer's output-equals-input fallback must never supply a router.cheap
output rate; this design does not use it because the model list has no costs,
and any future automatic feed requires an explicit provider-specific rule plus a
new FID and evidence.

The operator must attest, with a dated observation, that the model key has no
model-mapping rule and that the Routing page source for each family is the
intended source. The gateway cannot detect upstream substitution from the
request id or response. The FID records this as an external observation and a
residual risk, not as a test. Use a conservative manual cost (the higher of the
observed reseller `cost_*_usd` and the public list equivalent) rather than a
base tier or a customer-unit figure.

Reuse `openAiChat` and the existing streaming settlement. The provider sends
bearer auth only to `https://router.cheap/v1`; the reseller token is never sent
to the model endpoint. The transport must tolerate SSE `: PING` keepalives,
`include_usage` frames, `[DONE]` and an error object delivered after HTTP 200,
and must continue to settle a cancellation or a missing usage frame
conservatively. No prompt, full provider payload or secret is logged. Current
shared admission returns 503 when no trustworthy RPM ceiling exists; configure
the shared fallback deliberately and keep that refusal when it is absent. Do not
treat another provider's observed limit as this account's limit. The reserve
host is not registered and no paid call is retried automatically.

### Steps

1. **Seed, schema and flag flow.** Add the disabled `router-cheap` preset and
   the `requires_model_review` column; create `model_eligibility` and its
   indexes; extend `ProviderRecord`, `toRecord` and the provider store so the
   flag is readable; make `updateProvider` preserve it unless the review action
   changes it. No reseller customer, key, balance or management write.
2. **Review surface and persistence.** Extend provider discovery and admin
   review with the three-source evidence view, exact-id validation, reversible
   `chat`/`unsupported`/`unknown` decisions and a clear unknown-cost state.
   Preserve decisions across refetch and delisting.
3. **Enforcement.** Apply the eligibility, positive-cost and sell-price rule in
   `PUBLIC_MODEL_SCOPE`, `isServableRoute`, `planModelRoutes`,
   `getModelForGateway` and `handleChatCompletions`, including direct-id,
   alternative-route and subscription paths.
4. **Verification.** Add `tests/router-cheap-provider.test.mjs` and extend the
   provider, sync, PostgreSQL and disposable HTTP suites with a local mock:
   catalog envelope, exact ids, unsupported modalities, unknown default,
   persistence across refetch, malformed and partial catalogs, zero and missing
   cost, absent and returned models, provider isolation, operator decisions,
   direct-id and alternative-route bypass attempts, streaming and
   non-streaming, `: PING`, error-after-200, `include_usage`, `[DONE]`,
   cancellation, missing usage, credit reservation and settlement. No real
   inference.
5. **Closure.** Run the declared gates, grep production callers for
   `requires_model_review` and the eligibility helper, document the operator
   workflow and residual observations, commit, then close and archive with the
   actual receipt. Separately record real-provider observations; no paid
   inference or resale permission is claimed until observed.

### Verification

`tests/router-cheap-provider.test.mjs` is the focused artifact. It does not
exist yet; it is created in step 4. A converged FID may name a planned test
path; an implemented record may not, and `npm run repository:check` enforces
that distinction.

The test must prove both sides of the rule: a review-required row with no
decision is hidden and refused, while a reviewed chat row with positive input
and output costs and a valid sell price can publish and serve through the real
admin-to-sync-to-route path. It must attempt a direct `router-cheap/<id>` call,
an alias call, a non-primary alternative route and a subscription path, and
show each is refused before an upstream call. It must show a sync failure leaves
another provider's catalog, a manual cost, a sell price and a decision intact,
and that a delisted model returns with its prior decision.

The mock stream fixtures cover `: PING`, an error object after 200,
`include_usage`, `[DONE]`, a cancellation and a missing-usage frame, with hold
and settlement assertions. The three-source join is exercised with exact ids, a
plan mismatch, missing rows, an unavailable-to-available transition, USD versus
customer units, pricing-version drift, tier/time metadata and an adversarial
expression string; an unsupported or unbounded price fails closed before
reservation and dispatch. No reseller token appears in a model request header
or a client response. The disposable HTTP suite runs the real admin sync route
against a local mock. The mandatory two-connection proof and full `verify` are
closure gates.

## Verification Gates

Planning gates for this design (run against the current tree):

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/providers.test.mjs — `node --test tests/providers.test.mjs`
- gate: test tests/provider-sync.test.mjs — `node --test tests/provider-sync.test.mjs`
- gate: test tests/provider-readiness.test.mjs — `node --test tests/provider-readiness.test.mjs`
- gate: test tests/provider-sync-postgres.test.mjs — `node --test tests/provider-sync-postgres.test.mjs`
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: repository:check — `npm run repository:check`
- gate: attribution — `npm run attribution`

Closure gates (required after implementation):

- gate: test tests/router-cheap-provider.test.mjs — `npm test`
- gate: test tests/http.test.mjs — `npm run test:http`
- gate: verify — `npm run verify`, including the real PostgreSQL and HTTP
  suites and the two-connection proof

### Verification Receipt

Planning baseline, 2026-11-05. The code gates pass on commit `d874b9d` with the
working-tree documentation changes; `repository:check` fails while this record
is `analyzed` and names its planned test, and is re-run after the status flips
to `converged`.

```text
lint: exit 0
typecheck: exit 0
focused tests: 31 passed, 0 failed, 0 skipped (provider, sync, readiness,
  provider-sync-postgres on PGlite)
quality: exit 0 (400-line ceiling, 633 files scanned)
build: exit 0
repository:check: exit 1 before convergence (status analyzed; planned test absent)
attribution: re-run after the document and register edits
```

The read-only probes in Evidence are dated 2026-11-05 and are not a paid
inference, balance, resale-permission or request-time-price receipt. The
closure receipt must add the focused test, the HTTP suite, `npm run verify`, the
implementation commit, `CHANGELOG.md` and the archive move.

## Perfection Loop

### Loop 1 — RED

- **RED:** The record did not follow the template: `Environment` lacked the four
  named fields, the risk checklist was incomplete, `Resolution` lacked the five
  required fields, the receipt was prose, and the loop had no measured change
  deltas. The Status was `analyzed`, which `repository:check` rejects for an
  active FID and which blocks the operator-authorized implementation. The
  affected-components list named a nonexistent `.env.example`. The design named
  no exact enforcement point for direct ids or alternative routes. The cost
  discussion demanded refusal of paid dispatch until root-key billing was
  independently proved, which conflicts with the existing manual-cost mechanism
  and would make the provider unusable. The importer's output-equals-input
  fallback was not addressed. A previously active row can remain active after
  its cost becomes unknown. The provider seed and capability flags were not
  specified, and the PostgreSQL suite was described as a real-PostgreSQL proof
  although it runs on PGlite.
- **GREEN:** Rewrote the record to the template; set the design to a
  per-provider review flag so existing providers keep their semantics; added the
  durable eligibility decision and the four enforcement points; made manual cost
  the explicit operator evidence with a conservative ceiling and the 30-day
  freshness guard; required positive input and output costs at activation and
  at route selection; specified the disabled seed and zero capability flags;
  replaced the false `.env.example` reference; distinguished the PGlite suite
  from the mandatory PostgreSQL proof; and recorded the real pre-convergence
  `repository:check` failure.
- **AUDIT:** `lib/providers/registry.ts:196` returns `chat` for an OpenAI
  provider with no endpoints. `lib/providers/catalog.ts:131` falls back to the
  input rate. `lib/model-routing.ts:53` does not test chat eligibility, and
  `lib/model-routing.ts:79` can select a namespaced row as serving.
  `lib/storage/store/model-sync.ts:138` preserves `current.status`.
  `lib/storage/store/model-sql.ts:63` lacks eligibility and positive-output
  checks. `lib/storage/gateway/resolution.ts:21` resolves direct ids, and
  `lib/storage/gateway/call.ts:138` admits on status and provider enabled only.
  `lib/providers/types.ts:12` defines `ProviderRecord` without the flag and
  `lib/storage/store/provider-rows.ts:81` maps the row without it; a grep for
  `requires_model_review` in both files returns no matches, so the field must be
  added rather than assumed. The probes returned four 200 responses with
  76/76/76/0 rows and no secrets in output. Focused baseline: 31/31.
- **ADVERSARIAL:** A list response is not authority for chat compatibility,
  price, source, model identity, resale permission, rate limits or failover. A
  vendor expression is untrusted input. A request id is not proof of the
  serving model. A previously active row is not proof of a current cost. A
  successful management read is not a successful model call.
- **CHANGE DELTA:** 22,574 → 36,183 characters (+60.29%). This is the template
  conformance repair, not a bounded loop pass, and it exceeds the 10% per-pass
  circuit breaker; the deviation is recorded, not claimed as compliance.

### Missed Questions

1. **Does the OpenAI list envelope prove chat capability?** No. The fields are
   identifiers only; eligibility is an explicit operator decision.
2. **Does `available` mean a funded root-key call will succeed?** No. It means
   the reseller plan admits the model; balance, source, mapping and request-time
   price remain separate.
3. **Are reseller customer units the same as upstream USD cost?** No. The sample
   row shows 0.36 USD cost and 0.468 customer units; the plan applies a markup.
4. **Can the public endpoint label be trusted as a completed chat call?** No.
   It is vendor-declared metadata; retain review.
5. **Does a synced row's active status prove a current known cost?** No.
   `current?.status ?? ...` preserves an earlier active status, so the runtime
   gate must test the cost itself.
6. **Can an existing provider be affected by the new rule?** No, if the review
   flag defaults to 0. Only router.cheap is seeded with 1 in this design.
7. **Is the reserve host interchangeable?** Unverified. It is not registered
   and no paid call is retried.
8. **Can a real model request test this?** No. The no-spend instruction stands;
   use a local mock and the read-only feeds.
9. **Is a management token a model key?** No. `rsk_` and `sk-` are distinct;
   the management token stays on the server and never goes to `/v1`.
10. **Is the planned test allowed to be absent?** Yes for a `converged` design;
    `repository:check` rejects it for any other active status.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** No commit yet. The implementation is an uncommitted
  working-tree change; closure still requires a real commit and archive move.
- [x] **File:line ranges:** `lib/providers/eligibility.ts:34` (`isModelEligible`)
  and `:91` (`modelAdmissionRefusal`), 1-146; `lib/storage/schema/catalog.ts:27`
  (provider column), `:47` (eligibility table) and `:147` (additive column);
  `lib/storage/schema/catalog-seeds.ts:201` (disabled preset);
  `lib/storage/store/model-sql.ts:30` (`MODEL_SELECT`) and `:106`
  (`PUBLIC_MODEL_SCOPE`); `lib/model-routing.ts:62` (`isServableRoute`) and
  `:110` (`planModelRoutes`); `lib/storage/gateway/resolution.ts:52`
  (`modelRefusal`); `lib/storage/gateway/call.ts:149` (admission refusal);
  `lib/storage/store/eligibility.ts:36` (review list) and `:78` (decision
  write); `lib/projections.ts:222` (effective review state).
- [x] **Gate output:** `npm run lint` exit 0; `npm run typecheck` exit 0;
  `npm test` 1,055 tests with 1,048 pass, 0 fail, 7 environment-gated skips;
  `npm run quality` PASS (400-line ceiling, 637 files); `npm run build` exit 0;
  `npm run repository:check` PASS (Node 24, 11 gates, 12 active FIDs);
  `npm run attribution` PASS; `git diff --check` exit 0. The focused
  `tests/router-cheap-provider.test.mjs` is 9/9.
- [x] **Reproducibility:** The seed, flag, table, helper, review route and
  enforcement sites are grep-reproducible; the focused suite creates its own
  PGlite schema and does not call a real provider.
- [x] **Step statuses:** Step 1 `implemented`; step 2 `implemented` (review API
  and inline panel); step 3 `implemented` (public scope, route planning,
  gateway admission, subscription path); step 2 `implemented` for exact-id
  decisions, the unknown-cost state and the inline review panel, but the
  read-only three-source price comparison is not included in this pass; step 4
  `implemented` (nine focused tests and a local PGlite path); step 5
  `implemented` except the commit and archive move, which remain pending. No
  step is presented as fully closed while that comparison is absent.

### Code Verification Evidence

- [x] Existing files referenced in Affected Components exist; the new helper,
  table, review route, panel and test now exist too.
- [x] Implementation matches the enforced Proposed Solution: the seed is
  disabled and review-required, decisions persist by exact id, and all four
  selection points apply the rule. The read-only three-source price comparison
  is deferred; no price import exists.
- [x] Typecheck, lint, the focused tests, quality and build pass with pasted
  output below.
- [x] Production call-graph evidence: `handleChatCompletions` resolves the
  effective route, then refuses before admission or dispatch; reconciliation
  and the public scope apply the same decision.
- [x] FID status reflects the actual state: `fixed`, not closed; the commit and
  archive move are still pending.

> Every PASS and FAIL in AUDIT cites `path/to/file.ts:LINE` plus quoted code or
> exact command output. The access probes are the exact commands above; the
> values they returned are recorded without credentials.

### Loop 2 — Independent audit and self-correction

- **RED:** A public-list filter alone still leaves the direct-id path and the
  alternative-route path open. A global eligibility table would hide every
  existing provider, because absence would mean unknown for all of them. A
  positive sell price is not a positive output cost; `isServableRoute` checked
  only "any sell price", and `PUBLIC_MODEL_SCOPE` did not require a positive
  output cost. The `published` fallback could name an ineligible namespaced row
  even when no eligible row could serve it. The manual-cost path is the only
  lawful cost basis in this pass; an automatic import must not be inferred from
  the three-source review. The new flag had no declared path through
  `ProviderRecord`, `toRecord` or the provider update, so the general admin
  form could clear it or the runtime could not read it.
- **GREEN:** Added the per-provider `requires_model_review` flag so existing
  providers are unchanged. Added the effective-route predicate to both the
  public scope and the gateway. Required positive input and output costs and
  positive sell prices for a paid review-provider row at activation and route
  selection. Required `publishedId` to be null or an eligible row when the
  fallback would otherwise promote an ineligible namespaced row. Stated that
  the review surface is read-only for prices and that manual entry is the cost
  basis. Added the direct-id, alias, non-primary and subscription bypass cases
  to the verification contract. Named the flag's type and store read path and
  required `updateProvider` to preserve it unless the review action changes it.
- **AUDIT:** `lib/storage/store/model-sql.ts:63` shows the current scope's
  sell-price and freshness checks and no eligibility or output-cost check.
  `lib/model-routing.ts:53-79` shows the candidate filter and the fallback
  `published` selection. `lib/projections.ts:179` shows the effective route
  (`row.served_provider_slug ?? row.upstream_slug`). `lib/storage/gateway/call.ts:138`
  shows the current admission check. `lib/storage/store/models.ts:94` shows the
  activation check is only `cost_source === "unknown"`. `lib/providers/types.ts:12`
  defines `ProviderRecord` without the flag and
  `lib/storage/store/provider-rows.ts:81` maps the row without it; the grep
  above returns no matches, so the field must be added. The refined join
  reproduces 47 token/chat-labelled and 39 available exactly.
- **ADVERSARIAL:** A direct `router-cheap/<id>` request, a legacy alias, a
  non-primary group member and a subscription snapshot are four different
  ways to reach the same unverified row; the rule must be applied after
  resolution, not only in the catalog query. A group whose unscoped row is
  ineligible must disappear, not silently promote another provider. A manual
  cost is an operator decision, not a verification claim; the record must say
  so.
- **CHANGE DELTA:** measured below; this pass changed the design's enforcement
  and review semantics without adding implementation.

### Loop 3 — Final convergence

- **RED:** The remaining unknowns are external: the root key's billing basis,
  the account and key model mapping, the serving source per family, the real
  account RPM and the resale permission. The public and reseller feeds can
  change within a minute. A previously recorded decision can become stale. A
  manual cost can drift. The design cannot turn these into code facts.
- **GREEN:** The design fails closed on every one of them: unknown eligibility
  is denied, unknown or zero cost is not activated, a stale manual cost is
  withheld by the existing freshness guard, an unmapped or unverified source is
  an operator observation rather than an inferred equivalence, and no paid
  request is retried on an unverified route. The review surface records source
  and observation time. The residual risk is stated in Resolution rather than
  hidden in a passing test.
- **AUDIT:** The deep audit found no further actionable design change after the
  Loop 2 corrections. The exact commands and citations in Loop 1 and Loop 2
  were re-checked against the tree; the active-status failure is resolved by the
  final `converged` status, and the planned test is allowed for that status.
  The code gates remain green and the read-only probes remain the only
  provider evidence.
- **ADVERSARIAL:** A future automatic price import, a new model mapping, a
  changed source or a changed account limit invalidates this design's
  assumptions. Each requires a new observation and, for an automatic import, a
  new implementation record with its own evidence. This FID does not claim
  otherwise.
- **CHANGE DELTA:** 0.0% in this pass. The independent audit produced no
  actionable change; termination is by zero actionable improvements, not by a
  silent trim.

### Measured Loop Receipt

| Pass | Start | End | Delta | 10% cap |
| --- | --- | --- | --- | --- |
| Pre-loop template repair | 22,574 | 36,183 | +13,609 (+60.29%) | exceeded; recorded as a structural repair, not a pass |
| Loop 1 | 36,183 | 36,443 | +260 (+0.72%) | within |
| Loop 2 | 36,443 | 37,565 | +1,122 (+3.08%) | within |
| Loop 3 | 37,565 | no design edit | 0 substantive | within |

Loop 1 corrected the effective-route freshness and cost wording and replaced
the initially unmeasured receipt with an honest pre-loop statement. Loop 2
added the `requires_model_review` read path, its preservation on update, and
the `ProviderRecord`/`toRecord` audit citation. Loop 3 flipped the status and
added this receipt; the audit produced no further actionable design change.
The pre-loop repair remains a recorded deviation: it was a template
conformance rewrite, not loop convergence, and it is not presented as
cap-compliant.

Final gates, run after the status flip:

```text
repository-check: PASS (Node 24, 11 gates, 12 active FIDs, root links and current docs consistent)
attribution-guard: PASS (no coding-agent credit found)
attribution-document-guard: PASS (no governed credit line)
git diff --check: exit 0
```

Code gates were run on the same tree before these documentation-only edits:
lint exit 0, typecheck exit 0, 31/31 focused tests, `quality` PASS (633 files),
and build exit 0. No code changed after them.

## Resolution

- **Closed Date:** Not closed. The implementation is complete in the working
  tree; closure waits on the implementation commit, full closure gates and the
  archive move.
- **Fix Description:** Implemented the disabled `router-cheap` preset with
  `requires_model_review = 1`, the `model_eligibility` table keyed by provider
  and exact upstream id, the shared eligibility/freshness rule, and enforcement
  in `PUBLIC_MODEL_SCOPE`, route reconciliation, gateway admission and the
  subscription path. Added the reviewed-decision API and inline admin panel,
  activation guards for positive input/output costs and sell prices, and
  persistence across refetch and delisting. Existing providers keep their
  current semantics because the flag defaults to 0. No paid inference, balance
  check, reseller customer or management write was performed.
- **Tests Added:** Yes. `tests/router-cheap-provider.test.mjs` has nine tests:
  the review flag, cost/sell/freshness refusal, namespaced fallback exclusion,
  stable-name hiding, seed state, decision persistence across refetch and
  delisting, activation/publication, and gateway projection. No real provider
  call is made.
- **Verification Evidence:** `npm run lint` exit 0; `npm run typecheck` exit 0;
  `npm test` 1,055 tests (1,048 pass, 0 fail, 7 skips gated on
  `TEST_DATABASE_URL`); `npm run quality` PASS (637 files); `npm run build` exit
  0; `npm run repository:check` PASS (Node 24, 11 gates, 12 active FIDs);
  `npm run attribution` PASS; `git diff --check` exit 0. The focused
  `tests/router-cheap-provider.test.mjs` is 9/9, 0 skipped. The four read-only
  probes returned 200 with 76/76/76/0 rows. No paid inference, balance check,
  resale permission or request-time price is claimed.
- **Archived:** Not archived. The record remains active in `dev/fids/` because
  the implementation is uncommitted and the full closure gates have not yet
  produced a commit receipt.

## Lessons Learned

Template conformance is a machine-checked contract, not prose: an active
`analyzed` FID fails `repository:check`, and a promised test path is only allowed
while the record is `converged`. An OpenAI-compatible model list establishes
identifiers, not modality, price, source or permission to serve. Separate feeds
have separate units and scopes, and a base tier is not a ceiling. Eligibility
must be enforced after model resolution and on every candidate route, not only
in the public list. Existing fallbacks that are safe for one provider (default
chat, output-equals-input) are unsafe for another and need an explicit
provider-scoped rule.
