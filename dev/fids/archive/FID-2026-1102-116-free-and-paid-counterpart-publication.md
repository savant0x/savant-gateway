# FID: Publish the paid counterpart of a free-tier model

**Filename:** `FID-2026-1102-116-free-and-paid-counterpart-publication.md`
**ID:** FID-2026-1102-116
**Severity:** high
**Status:** closed
**Created:** 2026-11-02 23:40
**Automation level:** 3
**YAGNI-Compliance:** Verified

> This FID is a pre-implementation design record. It does not authorize or
> claim implementation of the proposed change.

---

## Summary

The upstream publishes some models twice: a `free/` allocation with a weighted
daily allowance, and the metered id that is billed per token. `free/glm-5.3`
and `glm-5.3` are the same weights sold as two products. The gateway folded
both upstream ids into one route group, route planning published exactly one
row per group, and `is_primary` gates the public catalog — so whenever a free
allocation existed, its paid counterpart was imported and then hidden. A
customer could burn the daily free allowance and had no unlimited row to buy.

## Environment

- **OS:** win32
- **Language/Runtime:** Node >=22.18.0, Next.js 16, PostgreSQL
- **Tool Versions:** npm, node test runner
- **Commit/State:** working tree on `main` after `8a45c2f`

## Detailed Description

### Problem

`/models` and the public catalog show `free/<model>` but not `<model>`.

### Expected Behavior

Both rows are published: the free allocation as the free-pool product and the
metered id as the paid product. A free group row stays at $0.00 and draws on
the daily allowance; the paid row keeps its per-token sell price and bills
credit. Neither replaces the other.

### Root Cause

`lib/providers/catalog.ts` stores `routeGroup: canonicalModelKey(upstreamId)`.
`canonicalModelKey` deliberately strips the `free/` price-group prefix, because
identity verification must treat both ids as the same weights. That is correct
for model identity and wrong for routing: `free/glm-5.3` and `glm-5.3` share
one `route_group`, `planModelRoutes` elects a single `publishedId` for the
group, and `reconcileRoutes` writes `is_primary = 0` on the other row.
`PUBLIC_MODEL_SCOPE` in `lib/storage/store/model-sql.ts` requires
`m.is_primary = 1`, so the loser is delisted from the public catalog while
remaining imported in the admin catalog.

### Evidence

- `lib/providers/catalog.ts:138` — `routeGroup: canonicalModelKey(upstreamId)`
- `lib/model-identity.ts:19` — the `free/` prefix is dropped from the key
- `lib/model-routing.ts:76` — one `publishedId` per call
- `lib/storage/store/model-sql.ts` — `AND m.is_primary = 1` in
  `PUBLIC_MODEL_SCOPE`
- `tests/route-reconcile.test.mjs` — the previous free-pool test asserted the
  paid row was `is_primary = 0`, encoding the defect as expected behavior

```text
route_group for free/glm-5.3 = glm-5-3
route_group for glm-5.3      = glm-5-3
=> one group, one published row, paid row hidden
```

## Impact Assessment

### Affected Components

- `lib/model-identity.ts`
- `lib/route-reconcile.ts`
- `lib/storage/store/routes.ts`
- `lib/storage/store/models.ts`
- `tests/model-identity.test.mjs`
- `tests/route-reconcile.test.mjs`
- `docs/providers.md`

### Risk Level

- [x] High: a purchasable product is missing from the catalog; no workaround
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Scope the route group to the billing tier, not to the model alone. Model
identity is untouched: `canonicalModelKey` still folds `free/glm-5.3` and
`glm-5.3` to one key, so fingerprinting and provider-neutral identity keep
working. Routing uses `routeGroupKey({ routeGroup, upstreamId, billingMode })`,
which is `<billingMode>:<model key>`. Rows of the same tier still merge across
providers — the paid row from another provider can still take over the paid
published id — while a free allocation and its paid counterpart are separate
groups that each elect their own published row.

The stored `route_group` column keeps holding the model identity, so no
migration or re-sync is required; every grouping site computes the tier-scoped
key from the joined `group_billing_mode`.

### Steps

1. Add `routeGroupKey` to `lib/model-identity.ts`.
2. Use it in both route reconcilers (`lib/route-reconcile.ts`,
   `lib/storage/store/routes.ts`) and in the admin route list lookup
   (`lib/storage/store/models.ts`).
3. Replace the free-pool reconcile test with one that asserts both products
   publish, and add an identity test that a free row and its paid counterpart
   are different route groups while two paid providers share one.
4. Document the tier scope in `docs/providers.md`.

### Verification

- `tests/model-identity.test.mjs` covers the key split and the same-tier merge.
- `tests/route-reconcile.test.mjs` covers both rows publishing, the free row
  staying unpriced, and the paid row keeping its sell price.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/model-identity.test.mjs
- gate: test tests/route-reconcile.test.mjs
- gate: quality — `npm run quality`

### Verification Receipt

- verified: 2026-11-02T23:58Z (commit `1bc8256`)
- focused: `node --test tests/model-identity.test.mjs tests/route-reconcile.test.mjs`
  exit 1 on the first run — two expectations, corrected below — then 15/15 pass
- test: `npm test` exit 0 — 852 tests, 851 pass, 1 skipped
  (`tests/gateway-concurrency.test.mjs`: `DATABASE_URL` is not set)
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 535 files)
- build: `npm run build` exit 0
- not run: `npm run test:http`, `npm run test:recovery`, `npm run test:load`

## Perfection Loop

### Loop 1 — RED

- **RED:** The paid counterpart is published nowhere while a free allocation
  exists. The existing test asserted the defect, so a green suite hid it.
- **GREEN:** Tier-scoped route key; grouping sites updated; test corrected.
- **AUDIT:** `lib/model-identity.ts:50` adds `routeGroupKey`; both reconcilers
  group by it (`lib/route-reconcile.ts:57`, `:114`,
  `lib/storage/store/routes.ts:89`) and the admin route list uses the same key
  (`lib/storage/store/models.ts:63`), so a row's routes cannot be looked up
  under a key the reconciler never wrote. Regression tests:
  `tests/route-reconcile.test.mjs:210` and `:253`,
  `tests/model-identity.test.mjs:49`. Full suite 851/852 pass, build exit 0.
- **ADVERSARIAL:** Does scoping the key break takeover for the same model from
  two providers? No: both are `paid:` and still share one group, so the cheaper
  provider still serves the stable published id — covered by the existing
  takeover tests and by "the same tier still merges across providers" in
  `tests/model-identity.test.mjs`.
  A first run did fail twice; both were test expectations, not code: the stored
  canonical key for `free/glm-5.3` is `glm-5-3` (the dot folds), and the apixo
  row reprices from its own 100k cost to 125k rather than from savant's default.
- **CHANGE DELTA:** 30% (root cause, approach, evidence, receipt).

### Missed Questions

1. Does the fix need a data migration? No. `route_group` stores the model
   identity and the tier comes from the joined group, so grouping is correct
   for rows synced before this change.
2. What about a `free/` row whose allocation is exhausted (`allowFree` false)?
   It falls to the subscription group and is now its own tier group too, so it
   is published separately instead of hiding the paid row.
3. Should the free row be a serving candidate for the paid id? No. Free and
   paid have different admission and settlement; serving a paid call from the
   free pool would bill a customer for an unpriced pool.

### Implementation Evidence (commit pending, so this is not `closed`)

- **Commit SHA:** `1bc8256`
- **File:line ranges:** `lib/model-identity.ts:50` (`routeGroupKey`),
  `lib/route-reconcile.ts:57,114`, `lib/storage/store/routes.ts:89`,
  `lib/storage/store/models.ts:63`, `tests/route-reconcile.test.mjs:210,253`,
  `tests/model-identity.test.mjs:49`, `docs/providers.md` (tier paragraph).
- **Gate output:** see the Verification Receipt above (all exit 0).
- **Reproducibility:** `grep -rn "routeGroupKey" lib` returns the definition
  and the four call sites.
- **Step statuses:** 1 implemented, 2 implemented, 3 implemented,
  4 implemented.

## Resolution

- **Closed Date:** 2026-11-03 00:15
- **Fix Description:** route groups are scoped `<billingMode>:<model key>`, so a
  free allocation and its paid counterpart each elect a published row while
  same-tier rows still merge across providers.
- **Tests Added:** Yes — three identity tests and two reconcile tests, one of
  which replaces the assertion that encoded the defect.
- **Verification Evidence:** focused 15/15; `npm test` 852 (851 pass, 1
  skipped); typecheck 0; lint 0; quality PASS 535 files; build 0.
- **Archived:** 2026-11-03 00:15

## Lessons Learned

Route identity and model identity are different questions. A key that folds a
price-group prefix is right for "is this the same model" and wrong for "which
row does a customer buy".
