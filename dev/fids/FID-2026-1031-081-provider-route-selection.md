# FID: Cheapest-provider routing for a shared model catalog

**Filename:** `FID-2026-1031-081-provider-route-selection.md`
**ID:** FID-2026-1031-081
**Severity:** high
**Status:** verified
**Created:** 2026-10-31 22:15
**Automation level:** 2
**YAGNI-Compliance:** Pending

---

## Summary

The operator will run more than one upstream. When two providers sell the same
model, the public catalog must keep one entry and serve the cheaper provider;
models a new provider adds must appear without touching code. Today a public id
resolves to exactly one provider row: `gpt-6-astra` and `apixo/gpt-6-astra` are
two catalog entries, a second sync cannot influence the first, and nothing
compares cost. This FID adds a provider-neutral route group, selects the
cheapest servable provider per model, keeps the published id stable, and records
the serving provider's cost so pricing and analytics stay truthful.

**Process note (disclosed):** implementation of this change began before this
record was written. The order was wrong. This record now holds the analysis, the
converged design and the verification contract the implementation must satisfy;
no gate or commit claim was made before it existed.

## Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node >= 22.18.0, Next.js 16.4.3, better-sqlite3 13.0.3
- **State:** `main` at `36f81d3`, plus uncommitted routing work
- **Providers:** `savant` (apinex, default), `apixo` (registered, disabled),
  Twigpine expected next

## Detailed Description

### Problem

`models.id` is the public id and `models.upstream_slug` is the only provider a
row can be served by. `publicModelId` namespaces a non-default provider's rows,
so the same model from two upstreams is two unrelated catalog rows. The gateway
resolves one id to one row; there is no comparison, no replacement and no single
entry per model.

Consequences with a second provider:

- `/models` would list `gpt-6-astra` and `apixo/gpt-6-astra` as different
  products at different prices, even when they are the same weights.
- A cheaper provider cannot take over a model without the operator disabling the
  incumbent by hand and asking customers to change their model string.
- Recorded cost comes from the row's own `input_price_micros`; serving a model
  from another provider without changing that row would report a cost that was
  never paid.

### Expected Behavior

- One published catalog entry per model.
- The published id does not change when the serving provider changes.
- Serving goes to the cheapest provider that can actually complete a billed
  call, with cost and protocol taken from that provider.
- A model that exists only on the new provider is published once it is priced.
- Adding a provider stays a registry + sync operation, with no per-provider code.

### Root Cause

The catalog was designed for one upstream: identity, routing and cost all live on
one row. Multi-provider support was added as a namespaced duplicate, not as a
route.

### Evidence

```text
lib/providers/registry.ts: publicModelId() → `${providerSlug}/${upstreamId}`
lib/providers/index.ts:   getProvider(model.upstreamSlug) → one provider
lib/store/models.ts:      replaceModels() upserts by public id only
public catalog rows on 2026-10-31: savant only, no route comparison
```

## Impact Assessment

### Affected Components

- `lib/model-identity.ts` — provider-neutral identity (new)
- `lib/model-routing.ts` — pure route planner (new)
- `lib/schema/routes.ts` — `route_group`, `is_primary`, `served_*` (new)
- `lib/store/routes.ts` — reconciliation (new)
- `lib/store/models.ts`, `shared.ts`, `model-sql.ts`, `providers.ts`
- `components/admin/models-table.tsx`, `model-cost-editor.tsx`

### Risk Level

- [x] High: a wrong publication rule removes models from the public catalog or
  routes a call to a provider that cannot serve it

## Proposed Solution

### Approach

Identity (`route_group`) is computed from the upstream id, not the provider.
Routing ranks the servable rows in a group by blended cost (3 input : 1 output),
then input cost, then provider order. The published row is the stable, unscoped
id; the serving row may be any provider. The serving provider's identity, cost
and protocol are denormalized onto the published row (`served_*`), so the gateway,
pricing view and analytics all read one truth without a join per request.
Auto-priced published rows follow the serving cost.

### Steps

1. `canonicalModelKey` folds case, separators, the `family/` path and release
   stamps; variants (`abliterated`, `-pro`, version bumps) stay distinct.
2. Schema: `route_group`, `is_primary`, `served_provider_slug`,
   `served_upstream_id`, `served_protocol`, `served_cost_input_micros`,
   `served_cost_output_micros`; additive, with a backfill.
3. Sync stores `route_group`; `reconcileRoutes()` runs after sync, cost, price,
   status, markup and provider enable/disable/delete.
4. `planModelRoutes` (pure) picks published and serving rows. A disabled
   published row hides the group; an unpriced or unknown-cost row is never
   servable.
5. `toGatewayModel` uses `served_*` when present; public scope gains
   `is_primary = 1`; admin rows carry own cost, serving provider and routes.
6. Tests: `tests/model-identity.test.mjs`, `tests/model-routing.test.mjs`.
7. Non-goal: cross-provider failover on an upstream error. The next candidate is
   known (ranking), but automatic retry is a separate hot-path change.
8. Non-goal: importing Apixo text prices; the upstream publishes none.

### Verification

Pure planner and identity tests prove the selection rules; the existing HTTP
suite proves the catalog and call path still serve the single-provider
deployment. Gates below.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-identity.test.mjs
- gate: test tests/model-routing.test.mjs
- gate: test
- gate: test:http
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-31 (local tree)
- lint: exit 0, zero warnings (one `--fix` pass on `lib/route-reconcile.ts`)
- typecheck: exit 0 (first run failed with TS2802 on `MapIterator` and two implicit-any parameters; fixed by iterating `Array.from(...)`)
- test tests/model-identity.test.mjs: exit 0 (5 pass)
- test tests/model-routing.test.mjs: exit 0 (10 pass)
- test tests/route-reconcile.test.mjs: exit 0 (6 pass; the first run failed on a real defect — every row stored the winning `served_*`, which would have sent a pinned `apixo/<id>` call to another provider; only the published row now carries it)
- test: exit 0 (410 pass)
- test:http: exit 0 (750 checks plus the trial suite)
- quality: PASS, 361 files (first run FAILED at `models.ts` 416 and `types.ts` 418 lines; fixed by extracting `lib/model-route-types.ts` and `lib/route-reconcile.ts`, not by weakening the gate)
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** One id, one provider; no comparison; a second provider duplicates the
  catalog and cannot replace an incumbent.
- **GREEN:** Identity + reconciliation + served projection.
- **AUDIT:** planned against the files above.
- **ADVERSARIAL:** Identity can over-merge (`gpt-6` vs `gpt-6-astra`) or
  under-merge (`claude-opus-4.6` vs `claude-opus-4-6`). The key strips only
  separators and trailing release stamps; both cases are tested explicitly.
- **CHANGE DELTA:** initial.

### Missed Questions

1. **What if the cheapest route is unpriced?** It is not servable; the next
   cheapest priced route wins. An unpriced published row stays hidden.
2. **What if the operator disables the published row?** The group is hidden. A
   disable is a master switch; another provider is not promoted under a name the
   operator took down.
3. **Does a pinned id still work?** Yes: `apixo/<id>` resolves to that row and is
   served by it. Pinned rows are not published as duplicates because they are
   not primary.
4. **Can the served cost drift from the published price?** Auto-priced rows are
   repriced from the serving cost on every reconciliation; manual prices are
   never overwritten.
5. **What happens when a provider is deleted?** Its rows go; reconciliation
   republishes the group through the remaining rows or hides it.
6. **Free pool rows?** They are priced by group and cost zero, so they win their
   group and stay free; they are not charged.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** pending the commit recorded below
- [x] **File:line ranges:** `canonicalModelKey` in `lib/model-identity.ts`,
  `planModelRoutes`/`isServableRoute` in `lib/model-routing.ts`,
  `reconcileRoutesIn` in `lib/route-reconcile.ts`, `reconcileRoutes` in
  `lib/store/routes.ts`, `listAllModels`/`replaceModels` in
  `lib/store/models.ts`, `toGatewayModel`/`toAdminModelSummary` in
  `lib/store/shared.ts`, `PUBLIC_MODEL_SCOPE` in `lib/store/model-sql.ts`,
  `routeSchema`/`backfillRouteGroups` in `lib/schema/routes.ts`,
  `deleteProvider`/`setProviderEnabled` in `lib/store/providers.ts`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "reconcileRoutesIn\\|canonicalModelKey\\|served_provider_slug" lib`
- [x] **Step statuses:** 1–6 implemented, 7 deferred (failover is a separate
  hot-path FID), 8 blocked (Apixo publishes no text prices)

### Code Verification Evidence

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence: sync → reconcile → `listModels` →
  `/v1/models` and `/v1/chat/completions` → `toGatewayModel`
- [ ] FID status reflects the actual implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** Two real defects. The quality gate failed with `models.ts` at 416
  lines and `types.ts` at 418. More seriously, reconciliation wrote the winning
  `served_*` onto every row in a group, so a pinned `apixo/<id>` call would have
  been forwarded to whichever provider won the group.
- **GREEN:** Types moved to `lib/model-route-types.ts`; reconciliation moved to
  `lib/route-reconcile.ts` over a database handle, which also made it testable.
  Only the published row receives `served_*`; every other row resolves to
  itself.
- **AUDIT:** `tests/route-reconcile.test.mjs` asserts the secondary row keeps a
  null served route, and the pinned path is exactly `toGatewayModel`'s fallback
  to the row's own identity.
- **ADVERSARIAL:** A provider that resells different weights under an id another
  provider uses would be merged by identity. The rule trusts the id; a wrong id
  is an upstream data problem, and pinned ids remain the escape hatch. The HTTP
  suite is single-provider, so two-provider selection is proven at the
  reconciliation and planner level, not end-to-end through the gateway with a
  second live account.
- **CHANGE DELTA:** 18%.

### Loop 3 — Final convergence

- **RED:** A serving switch mid-flight could bill one provider's cost against
  another provider's request.
- **GREEN:** No change needed: `handleChatCompletions` resolves the model once
  before admission and passes that snapshot through hold, dispatch and
  settlement, so an in-flight call keeps the route it was admitted on while new
  calls see the new winner.
- **AUDIT:** `lib/gateway.ts` uses `settleModel` for `openCallSettlement`, the
  upstream call and `settleCall`; `usage_events.provider_slug` is written from
  the same snapshot.
- **ADVERSARIAL:** Reconcile runs on every sync and every pricing change, inside
  one immediate transaction, and reprices only `price_source = 'auto'` rows. A
  manual price is untouched, which the reconciliation test asserts.
- **CHANGE DELTA:** 2%.

## Resolution

- **Closed Date:** 2026-10-31 after the commit below
- **Fix Description:** Provider-neutral `route_group` on every catalog row;
  cheapest servable provider per model; stable published id; `served_*`
  identity, protocol and cost on the published row; admin visibility of every
  competing route; automatic reconciliation after sync, cost, price, status,
  markup and provider changes.
- **Tests Added:** Yes — `tests/model-identity.test.mjs`,
  `tests/model-routing.test.mjs`, `tests/route-reconcile.test.mjs`.
- **Verification Evidence:** receipt above; `npm test` 410 pass,
  `npm run test:http` 750 checks plus the trial suite.
- **Archived:** after the commit below

## Lessons Learned

pending
