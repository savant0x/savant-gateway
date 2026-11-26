# FID: InferHub-only upstream consolidation and free-allocation retirement

**Filename:** `FID-2026-1126-001-inferhub-only-upstream-consolidation.md`
**ID:** FID-2026-1126-001
**Severity:** high
**Status:** fixed (slices 1–2 implemented; 3–7 owned by other records)
**Created:** 2026-11-26 00:00
**Automation level:** 3
**YAGNI-Compliance:** Pending — the design deletes a provider row, a billing
mode and their surfaces; the only addition is a default-election guard and its
tests.

---

## Summary

The gateway was built to sell the same catalog from several upstream accounts
and to operate a weighted free pool. The operator has ruled both premises out:
InferHub is the only upstream, and there is no free allocation. This record
consolidates the consequences so the remaining work is one ordered contract
rather than edits scattered across six active records. It authorizes no code by
itself; it names the slices, the owners and the evidence each slice owes.

**Operator ruling 2026-11-26, verbatim:** "switching focus to only use inferhub
as our upstream, which means we no longer have free allocation and a lot of info
has changed".

**Related rulings.** 2026-11-25 (recorded in FID-2026-1125-004): "Remove it
entirely" for the free tier, and "it should be a markup on the base price,
that's how it always was".

## Environment

- **OS:** win32 (Git Bash)
- **Language/Runtime:** Node 24.x, TypeScript strict, Next.js 16 App Router
- **Tool Versions:** npm; gates per `protocol.config.yaml`
- **Commit/State:** Design baseline `b76af36`. Slices 1–2 landed in `d44694e`.

## Detailed Description

### Problem

Six active records still describe a multi-upstream, free-tier product:

- `043` records "free share on `allow_free` only" and a "2.5× markup" as the
  answered offering questions, and a SQLite planning baseline.
- `062` measures the product against an Apinex balance probe and a 200 RPM
  subscription purchase.
- `1120-001` onboards InferHub as a *fourth* provider and its step 2
  (`resale_free_pool`) has already been deleted by `1125-004`.
- `1125-003` treats the publisher election, identity aliases and failover as
  optional follow-ups.
- `1125-004` owns the removal but has six unimplemented slices.
- `011` is about to publish policy text that would name Apinex and describe a
  free tier.

Left alone, the surface keeps advertising and metering a product that has no
supply, and the launch receipt would be measured against a retired provider.

### Expected Behavior

One enabled upstream (`inferhub`) is the only source of catalog rows and the
only provider a completion can route to. Every catalog row is priced per token:
cost from InferHub's published rate or the recorded bid, sell =
`cost × (1 + markup)`. No surface advertises a free allowance, no usage is
multiplied by a weight, and no policy text names a provider that is not used.
The launch receipt is produced against the InferHub-only candidate.

### Root Cause

The billing and registry vocabulary was designed for a multi-upstream,
weighted-free-pool product. Provider identity, group derivation, metering and
copy were each encoded as policy; when the upstream and the commercial model
changed, the records that govern them kept the old product.

### Evidence

```text
active records naming Apinex or the free tier
  043  offering answers, SQLite baseline
  062  item 2 balance probe, capacity purchase
  011  recipient inventory
  1120-001  "fourth registered upstream", free-tier Expected Behavior
  1125-004  the removal itself, slices 2-8 open
  1125-003  election, aliases, failover, stable published row (blocked)

deleted by 1125-004 step 1b
  providers.resale_free_pool  (lib/storage/schema/catalog.ts:187 drops it)
  every free/ row  (refused for every provider)

still in the tree at b76af36 (1125-004 slices 2-8)
  models.allow_free, models.token_weight
  the free billing source, trial and allocation tables
  free-pool panels, guides and API routes
```

## Impact Assessment

### Affected Components

- provider registry and seeds (`lib/storage/schema/catalog-seeds.ts`,
  `lib/schema/providers.ts`)
- catalog import, group derivation and pricing (`lib/providers/*`,
  `lib/model-groups.ts`, `lib/pricing.ts`)
- gateway admission and settlement (`lib/storage/gateway/*`, `billingSource`)
- customer and admin surfaces that name the free tier
- `docs/providers.md`, `docs/business-model.md`, the API reference and the FAQ
- `content/legal/v1.2/` through FID-2026-1104-011

### Risk Level

- [x] High: a partial cut leaves a provider or a billing mode that is priced,
      displayed or metered inconsistently, and a launch receipt measured against
      the wrong upstream.

## Proposed Solution

### Approach

Delete the multi-upstream and free-tier premise in dependency order. Each slice
is independently gated; no slice may leave a surface advertising something the
code no longer does. Where an existing record already owns the work, this record
cites it instead of duplicating it (Law 13).

### Slices

1. **Default election is enforced, not assumed.** One enabled provider holds
   `providers.is_default`; a second enabled row either fails the guard or is
   refused at sync. Tests: `tests/store-providers-postgres.test.mjs`,
   `tests/provider-sync-postgres.test.mjs`.
2. **Apinex retires.** Its seed row is disabled and documented as retired in
   `docs/providers.md`; no public or admin surface presents it as a source. Any
   imported row that only Apinex supplied is hidden rather than repriced. Tests:
   `tests/store-providers-postgres.test.mjs`, the catalog publication suite.
3. **The free allocation goes.** Owned by FID-2026-1125-004 slices 2–8 (price
   math, gateway billing source, schema and ledgers, plans, customer UI, admin
   UI, docs). This record adds no step that duplicates it.
4. **InferHub becomes sellable.** Owned by FID-2026-1120-001 steps 5–7: the
   bid-pinned cost snapshot, the funded usage-frame observation and a measured
   capacity ceiling. Blocked on operator spend and a measured figure.
5. **The router decisions are made.** Owned by FID-2026-1125-003's four blocked
   steps: identity aliases, the election blend, failover, and a stable published
   row for plan inclusions. Blocked on operator rulings.
6. **Policy follows the product.** Owned by FID-2026-1104-011: `v1.2` names
   InferHub as the only upstream and does not describe a free tier.
7. **Acceptance is measured against the InferHub-only candidate.** FID-2026-062
   item 5 states the ceiling against InferHub's tiers; FID-2026-127's five
   observations are recorded against the pinned SHA of this product. No step is
   discharged by this record.

### Verification

Each slice declares its own tests and gate output. The consolidation adds one
reproducible check: with the InferHub-only seed applied, a fresh database
publishes no row from a disabled provider, exposes no free group, and
`/v1/models` answers with `owned_by: "savant-gateway"` for every published row.
A green build is not that check; the check reads the published list against the
provider rows.

### Non-goals

This record does not add a second upstream, does not implement failover, does
not set prices or bids, and does not approve launch. Those are the blocked steps
above and stay with their owners.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, once a slice lands.

### Verification Receipt

- verified: 2026-11-26 — design only; no runtime work is claimed.
- `npm run repository:check`: PASS with this record registered.
- slices 1–2 implemented 2026-11-26:
  - `npm test`: exit 0, 1242 tests / 1226 pass / 0 fail
  - `npm run lint`: exit 0 (0 warnings); `npm run typecheck`: exit 0
  - `npm run quality`: PASS (400-line ceiling, 701 files scanned)
  - `npm run build`: exit 0
  - `npm run test:http`: exit 0, 731 checks PASS
  - `npm run attribution`: PASS (both guards)

## Perfection Loop

### Loop 1 — RED

- **RED:** six active records describe a product with several upstreams and a
  free allowance that the operator has removed; two of them contradict the
  current tree outright (`1120-001` step 2, `043`'s offering answers).
- **GREEN:** one consolidation contract that cites the owning record per slice
  and adds only the missing premise — a single elected upstream.
- **AUDIT:** every cited owner is an active or archived record with its own
  evidence; no slice duplicates another record's steps.
- **ADVERSARIAL:** a "one upstream" rule enforced in seeds but not in routing
  would still serve a second provider's rows. The guard is on the enabled set,
  not on the seed file.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does retiring Apinex delete its catalog rows?** No. They stay as history;
   the publication scope stops serving a row whose provider is disabled, so a
   model InferHub also carries stays published through InferHub's row.
2. **What happens to a customer mid-call when the provider set changes?** The
   change is a registry write, not a request-path branch; an in-flight call
   settles against the provider that served it.
3. **Does removing the free tier refund anyone?** No. Credit and usage rows keep
   their `billing_source`; only new admissions stop existing (FID-2026-1125-004).
4. **Can a second upstream be re-added later?** Only by an explicit operator
   ruling and a new record; the default-election guard is what makes that
   deliberate rather than accidental.
5. **Does this authorize spending on InferHub?** No. Funding and bids are
   operator actions in FID-2026-1120-001 step 5.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `d44694e` implements slices 1–2.
- [x] **File:line ranges:** `lib/storage/schema/catalog-seeds.ts` (`seedProviders`),
      `lib/storage/schema/catalog.ts` (`pickDefaultProvider`),
      `lib/storage/store/providers.ts` (`setDefaultProvider`,
      `setProviderEnabled`), `lib/providers/registry.ts`
      (`DEFAULT_PROVIDER_SLUG`, `providerElectionRefusal`),
      `lib/storage/providers/sync.ts` (`syncAllEnabled`),
      `app/api/admin/providers/route.ts`, `app/api/admin/providers/[slug]/route.ts`,
      `app/api/admin/operations/route.ts`, `lib/providers/sync.ts`
      (Apinex overlay default removed), `docs/providers.md`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `node --test tests/store-providers-postgres.test.mjs
      tests/provider-default-postgres.test.mjs tests/provider-sync-postgres.test.mjs
      tests/provider-inferhub-sync.test.mjs` exits 0; a fresh database reports
      `inferhub` as the only enabled row and the only default
- [x] **Step statuses:** slice 1 implemented; slice 2 implemented; slices 3–7 are
      ordered obligations owned by other active records and 4–5 remain blocked
      on operator inputs

### Code Verification Evidence

- [x] The records and files cited above exist and were read.
- [x] `providers.resale_free_pool` deletion verified at
      `lib/storage/schema/catalog.ts:187` (`f2968ab`).
- [x] Status is `fixed` for implemented slices 1–2. Slices 3–7 retain their separate evidence and approvals.

## Resolution

- **Convergence Date:** 2026-11-26 00:00
- **Fix Description:** slice 1 makes the election the only way to change the
  enabled set: the seeded `inferhub` row is the single enabled default, a fresh
  database elects the enabled row with the lowest `sort_order`, **Make default**
  enables the target and disables every other row in one transaction, enabling a
  second provider or disabling the elected one is refused (`409`), and the
  registration/edit routes refuse an enabled save that is not the election.
  Slice 2 retires Apinex: the `savant` seed ships disabled, the compiled
  `savant` default and the Apinex public-metadata URL are gone (the overlay is
  opt-in via `PROVIDER_PUBLIC_MODELS_URL`), a row only Apinex supplied is hidden
  by the existing enabled-provider publication gate, and `docs/providers.md`
  documents the retirement while the dated Apinex documents carry a historical
  note. Slices 3–7 are owned by FID-2026-1125-004, `1120-001`, `1125-003`,
  `011`, `062` and `127`.
- **Tests Added:** Yes — `tests/store-providers-postgres.test.mjs` covers the
  seeded single source, the refused second enable, the refused default disable
  and the election's disable side effect; `tests/provider-default-postgres.test.mjs`
  covers the InferHub default, the election, the delete guard and the fallback;
  `tests/provider-inferhub-sync.test.mjs` and the remaining seed-aware suites
  were re-baselined. The HTTP operations checks assert the `409` refusal and its
  *Make default* guidance.
- **Archived:** no.

## Lessons Learned

A commercial model that changes once must change in the register as well as the
code, or the next launch receipt measures a product that no longer exists.
Consolidate the premise in one contract and cite the owners of each slice,
rather than restating their steps in a seventh record.
