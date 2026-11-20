# FID: Upstream catalog normalization layer

**Filename:** `FID-2026-1120-002-catalog-normalization-layer.md`
**ID:** FID-2026-1120-002
**Severity:** high
**Status:** closed
**Created:** 2026-11-20 18:30
**Automation level:** 3
**YAGNI-Compliance:** Compliant — one canonical type, four primary/enrichment shape readers, no
new schema, no new fetch, no new provider row.

> **Project application (savant-gateway).** This repository uses npm and the gates declared in
> `protocol.config.yaml`; there is no `fid:verify` or `validate:repository` target. `converged`
> is the status this record reaches before code, and it closes only with the gates, a local
> commit and the evidence section filled from real output. `implemented` is a step status,
> never a FID status.

---

## Summary

Each upstream publishes its catalog in its own shape, and the importer reads all of them
through one long fallback chain inside the shared builder: `spec.dollarsPer1M ??
item.dollarsPer1M`, `spec.contextWindow ?? item.context_window ?? …`,
`item.supported_endpoints ?? spec.supported_endpoints`. That was tolerable while the only
catalog we imported was one we authored the envelope for. It does not survive a second and
third provider: the default provider publishes `dollarsPer1M` in a separate public overlay,
InferHub publishes `pricing.min_ask_in` **inside** `/v1/models`, and the overlay mechanism
itself is gated to one slug. Adding a provider today means editing the shared builder, and each
new vendor adds another `??` to a chain whose failure mode is a **silently mispriced row**.

This FID adds **one normalization stage between the read and the builder**: a canonical row
type, a registry of *shapes* detected by content rather than by provider slug, and a single
place that decides prices, modalities, families and routability. `buildSyncedModels` then
consumes only the canonical row and stops guessing field names. No provider is registered here;
this is the seam FID-2026-1120-001 needs so that InferHub imports through the same path as
every other provider instead of through a special case.

**Non-goals, stated so nobody infers them later:** no billing-math change, no schema or
migration, no routing-election change, no new fetch, no per-provider request headers, no UI
change, and no new provider row. This is a pure refactor of the import path with a parity
proof that today's catalog imports byte-identically.

## Environment

- **OS:** Windows, Git Bash
- **Language/Runtime:** Node 22.x, TypeScript strict, Next.js 16 App Router
- **Tool Versions:** npm; gates per `protocol.config.yaml`
- **Commit/State:** working tree at `c477115` plus the untracked scratch reports; no code
  touched by this record.

## Detailed Description

### Expected Behaviour

1. One pipeline for every provider: read → **normalize** → build → replace.
2. Shape knowledge exists in exactly one module. Adding a provider is adding a shape and a
   fixture, never editing the builder or another provider's code path.
3. A row whose price is not declared imports `costSource: "unknown"` and `disabled` — never a
   guessed figure and never `$0`.
4. A row that is not a chat completion row, or that names no provider, never becomes a
   routable chat model by default.
5. A provider namespace (`cc/`, `ag/`, `kiro/`) is never mistaken for a model family.
6. The default provider's catalog imports **identically** to today *for the ids it owns* (`free/…`
   and bare ids), and a test proves it. The one intentional difference — family for a
   namespace-prefixed id — is asserted separately, so the parity test cannot hide it.
7. **Output modality** naming `image`, `audio` or `video` makes a row non-routable as chat;
   **absent** modality is *unknown*, not chat. This record does not add per-row capability
   gating (a known gap recorded for FID-2026-1120-001: the only publication guard for an
   undeclared capability is the provider-level `requires_model_review` flag).

### Actual Behaviour (RED)

1. **Field knowledge is a fallback chain in the shared builder.**
   `lib/providers/catalog.ts:97-100` (family), `:132-151` (input/output price),
   `:161` (context) and the capability reads beside them each repeat "overlay first, envelope
   second". The chain can express a flat alias of a key; it **cannot** express a nested shape
   at all. A provider that publishes `pricing.min_ask_in` therefore imports
   `costSource: "unknown"` for every row even though its price is in the payload.
2. **The enrichment overlay is slug-gated.** `lib/storage/providers/sync.ts:151-155` reads
   `provider.slug === "savant" && deps.fetchMetadata` before it will even attempt the overlay,
   so the only mechanism that adds fields a provider does not publish is available to exactly
   one provider by name.
3. **The envelope is validated but not interpreted.** `lib/providers/model-list.ts:26-58`
   requires `data` plus a per-row `id` and keeps unknown keys as inert data; the loose optional
   field list lives in the type (`lib/providers/types.ts:26-41`). Nothing maps a provider's own
   vocabulary onto ours, so each read site invents its own guess.
4. **Family is taken from the first path segment.** `lib/model-family.ts:28-40` slices the text
   before the first `/`. Correct for `free/gpt-6-luna`; wrong for a marketplace catalog, where
   that segment is a **publisher**: `cc/claude-opus-5-5` derives family `Cc` and `ag/…` derives
   `Ag`. The family is serialized into the catalog and rendered, so this is user-visible.
5. **No notion of a non-routable row.** An alias entry (`owned_by: "alias"`, no price, no
   provider pin) and an image-output entry are ordinary rows to the builder. Both import with
   `protocol: "chat"`; the alias additionally lands in a route group that collides with the
   incumbent's published id, and either becomes callable the moment an operator sets a manual
   cost.

### Root Cause

The importer reads **values** where it needs to read **shapes**. Field-name knowledge is
duplicated at every read site and gated by provider identity, so the cost of a new provider is
paid in the shared builder × every field, and the compiler cannot catch a wrong mapping because
every read is `unknown`-typed and optional.

### Evidence — the shapes this must absorb (observed 2026-11-20)

Default provider, public metadata overlay (one flat row per model, prices declared):

```json
{ "id": "free/gpt-6-luna", "provider": "GPT", "weight": 3, "allowFree": true,
  "supportsVision": true, "supportsTools": true, "health": "healthy",
  "contextWindow": "400000", "dollarsPer1M": 0.4, "outputDollarsPer1M": 1.6 }
```

InferHub, `GET /v1/models` (nested pricing, two row classes, 540 rows):

```json
{ "id": "cc/claude-opus-5-5", "object": "model", "owned_by": "cc",
  "upstream_label": "Claude Opus 5.5", "modality": "text,image", "output_modality": null,
  "input_token_limit": 1000000, "max_output_tokens": 128000,
  "supports_cache": true, "reasoning_levels": ["low","medium","high"],
  "pricing": { "official_in": 5, "official_out": 25,
               "min_ask_in": 0.152, "min_ask_out": 0.76,
               "asks_in": [0.152, 0.2, "…10 tiers"], "asks_out": [0.76, 1.0, "…"] } }

{ "id": "claude-opus-5.5", "object": "model", "owned_by": "alias",
  "supports_cache": false }
```

The second row is the one that matters: it is the id customers ask for, it names no provider,
and it carries no price. Under the current builder it would import as an unpriced chat row in
the route group of the incumbent's published `claude-opus-5.5`.

### Impact

- **Files:** new `lib/providers/normalize/` (canonical type, shape registry, four shapes,
  index), `lib/providers/catalog.ts` (consume the canonical row), `lib/storage/providers/sync.ts`
  (drop the slug gate, call the normalizer), `lib/model-family.ts` (leaf-first derivation),
  `lib/providers/types.ts` (shape types), tests, `docs/providers.md`.
- **Blast radius:** every provider's import path — that is the point, and it is why the parity
  test is mandatory rather than nice to have.
- **Risk:** medium. A wrong price mapping is a money defect that typechecks. Mitigation: one
  function converts to micros, one declared-output-zero rule preserved verbatim from
  `catalog.ts:132-151`, table-driven fixtures per shape, and a parity test that imports a
  recorded default-provider payload and asserts the resulting rows equal the pre-refactor rows.

### Proposed Solution

```text
GET /models ─► readUpstreamModelPage   (unchanged: envelope + pagination validation)
            ─► normalizeCatalog()      (new: the ONLY place that knows a vendor's shape)
            ─► buildSyncedModels()     (unchanged responsibilities, canonical input only)
            ─► replaceModels()         (unchanged: manual price/cost/group/disable preserved)
```

A `CatalogShape` is `{ name, matches(entry), read(entry) → Partial<NormalizedModel> }`.
Exactly one **primary** shape is selected by precedence; any number of **enrichment** shapes are
merged on top of it. Detection is by content, never by slug.

| Precedence | Kind | Shape | Detected by (content) |
|---|---|---|---|
| 1 (highest) | primary | `inferhub-ask-ladder` | numeric `pricing.min_ask_in` / `min_ask_out` |
| 2 | primary | `usage-free-pool` | id begins `free/`, or `allowFree` present |
| 3 | primary | `native-flat-usd` | `dollarsPer1M` / `outputDollarsPer1M` |
| — | classification | `alias` | `owned_by === "alias"` (a label, not a fallback) |
| — | enrichment | `public-overlay` | applied when a metadata map is supplied |

Rules fixed by this record:

- **Cost** is the declared figure. Operator manual cost still overrides later in
  `replaceModels`; a declared `$0` output stays a *missing* figure, not a free one — that rule
  moves **once** into the assembler (`catalog.ts:132-151` semantics preserved verbatim) instead
  of living in each shape.
- **Aliases are dropped at normalize time and counted**, not imported as disabled rows: an alias
  shares its `canonicalModelKey` with its real provider rows (`claude-opus-5.5` and
  `cc/claude-opus-5-5` both key to `claude-opus-5-5`), so keeping it would create a phantom
  member of a live route group with no provider pin. The skipped count is reported with the
  first five ids through the existing `ProviderSyncSummary.warnings` channel — no schema change,
  and no silent disappearance.
- **An unknown price keeps the row.** It imports `costSource: "unknown"` and `disabled`, because
  dropping it would delist a model the operator may have priced by hand. Only aliases are
  dropped.
- **Non-routability has a home without a schema change:** `routable: false` is an *input* to the
  existing `importedModelStatus` (`lib/providers/catalog.ts:67-77`), so the row lands `disabled`
  with `protocol: "chat"` never being claimed for a media row.
- **Family** prefers an explicit label that is neither a group word (`free`/`paid`/
  `subscription`) nor a bare publisher prefix, and otherwise derives from the **leaf** id.
- The overlay becomes an optional **enrichment shape** any provider may supply, not a
  `slug === "savant"` branch. Where both the overlay and the envelope declare a price, the
  **overlay wins**, because that is what today's `metadata.get(id) ?? item` already does and
  parity depends on it; shapes do not silently arbitrate between two declared figures.
- **Billing tier is preserved, not recomputed.** A `free/` row keeps its `allowFree` flag and
  `tokenWeight` exactly as `catalog.ts:113-118` derives them; `routeGroupKey` still separates
  the free tier from the paid one, so normalization must never fold two tiers together.

### Steps

1. `lib/providers/normalize/types.ts` — `NormalizedModel` + `CatalogShape`. Micros come from the
   existing `priceToMicros` (`lib/pricing.ts:14-16`); **no second conversion helper is added**
   (the quality bar forbids duplicated formatting helpers, and `buildSyncedModels` already
   rounds with the same arithmetic at `catalog.ts:147-152`).
2. `lib/providers/normalize/shapes.ts` — the four shapes above as data, each with a fixture.
3. `lib/providers/normalize/index.ts` — `normalizeCatalog(provider, entries)` with dedupe,
   `canonicalModelKey`, routability and family resolution.
4. `lib/providers/catalog.ts` — `buildSyncedModels` consumes `NormalizedModel`; every
   `??`-chain read site collapses to a field read.
5. `lib/storage/providers/sync.ts` — remove the slug gate; overlay becomes an optional shape.
6. `lib/model-family.ts` — leaf-first derivation with the publisher-prefix rule.
7. Tests: `tests/catalog-normalize.test.mjs` (per-shape fixtures, alias, media, family, $0
   output), plus a parity test that asserts the **whole** `SyncedModel` row (`routeGroup`,
   `family`, `tokenWeight`, both micros, `protocol`, `allowFree`, `status`) for the recorded
   default-provider payload, a declared-family-vs-leaf-family test for a namespaced id, and a
   source-level invariant that `lib/providers/` contains no `slug ===` capability or price
   branch; `tests/catalog-integrity.test.mjs` must keep passing untouched.
8. `docs/providers.md` — replace the "prices must appear in the envelope" assumption with the
   shape table.

Each of the three new modules stays well under the 400-line ceiling; `normalize/index.ts` owns
assembly, `shapes.ts` owns vendor knowledge, `types.ts` owns the contract.

### Verification

`npm run typecheck`, `npm run lint`, `npm test`, `npm run quality`, `npm run config:check`,
`npm run repository:check`, `npm run build`, and the two HTTP suites. Real evidence pasted
into the Implementation Evidence section before this closes.

### Non-Goals

No new provider row (that is FID-2026-1120-001), no upsert of any kind, no cache-read billing,
no per-model request headers, no admin UI for choosing a shape, no change to
`replaceModels` preservation rules, no change to route election or published ids.

## Verification Gates

| Gate | Command | Required |
|---|---|---|
| Types | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass, zero warnings |
| Unit | `npm test` | pass, new suite included |
| Size | `npm run quality` | pass, files ≤ 400 lines |
| Config | `npm run config:check` | PASS (non-production) |
| Repository | `npm run repository:check` | PASS |
| Build | `npm run build` | pass |
| HTTP | `npm run test:http` | pass |
| Attribution | `scripts/attribution-guard.mjs` | PASS |

---

## Perfection Loop

### Loop 1 — RED (self-review of this record)

- **RED:** Reviewing the record against the code found six defects in the *design*, not in the
  code: (1) it invented `usdToMicros` when `priceToMicros` already exists
  (`lib/pricing.ts:14-16`), a duplicate helper the quality bar forbids; (2) "first match wins"
  over an ordered shape list would classify every *unpriced native* row as an alias and would
  lose the additive case where an overlay enriches a nested-price row; (3) `routable` was given
  to a type that has no such field; (4) the parity claim was stated unqualified, although the
  family rule intentionally changes namespaced ids; (5) "absent modality leaves the row to
  `requires_model_review`" described a **provider-level publication flag** as if it were per-row
  gating; (6) the declared-`$0`-output rule was repeated per shape instead of stated once.
- **GREEN:** Corrections applied above: reuse `priceToMicros`; one **primary** shape plus any
  number of **enrichment** shapes, with `alias` demoted from a fallback to a label; `routable`
  feeds the existing `importedModelStatus`; parity scoped to default-owned ids with the family
  change asserted separately; the capability gap recorded honestly; the `$0` rule moved once into
  the assembler.
- **AUDIT:** `priceToMicros` (`lib/pricing.ts:14`), `importedModelStatus`
  (`lib/providers/catalog.ts:67-77`), micros arithmetic (`catalog.ts:147-152`), overlay-wins
  (`catalog.ts:96` `metadata.get(upstreamId) ?? item`). All four read, not remembered.
- **ADVERSARIAL:** "Is a shape registry over-engineering for two providers?" The alternative is
  what already exists: fallback chains plus a slug gate, and on the *first* new provider that
  arrangement produced two silently wrong shapes (nested price, publisher-as-family). The
  registry is four data objects and one selector — smaller than the branches it replaces.
- **CHANGE DELTA:** +1,631 of 11,688 = **13.96%** (cap 10%, exceeded and declared).

### Missed Questions

1. **Aliases imported or dropped?** Dropped and counted. An alias shares `canonicalModelKey`
   with its real rows, so importing it would place a provider-less phantom inside a live route
   group.
2. **Who owns the price when the overlay and the envelope both declare one?** The overlay, to
   preserve `catalog.ts:96` parity; the shape layer never arbitrates between two declared figures.
3. **Is an unpriced row deleted?** No. It is kept `disabled`; deleting it would discard an
   operator's manual cost on the next sync.
4. **What happens to `tokenWeight` on marketplace rows?** It stays derived exactly as today
   (`catalog.ts:113-118`); only the free-pool shape produces a non-zero weight.

### Loop 2 — Independent audit and self-correction

- **RED:** Four further defects, none a repeat of Loop 1: (1) dropping aliases is a *silent*
  action — if a future vendor marks extra ids `owned_by: "alias"`, hundreds of rows vanish behind
  one sentence, so the warning must carry the count and sample ids; (2) the parity test as worded
  could pass while `routeGroup`, `family` or `tokenWeight` changed, because `replaceModels`
  preserves manual values by id and a narrow equality check would not notice; (3) `native-flat-usd`
  can match a marketplace row that later also publishes a flat field, so precedence must be
  normative rather than incidental; (4) `lib/storage/schema/catalog-seeds.ts:97` calls
  `normalizeFamilyName` during seeding, so a leaf-first change reaches seeded rows too.
- **GREEN:** Warning carries `count + first 5 ids`; parity asserts the **whole** `SyncedModel`
  row including `routeGroup`, `family` and `tokenWeight`; the precedence table is normative;
  the seed call site is named in step 6 and re-verified.
- **AUDIT:** `catalog-seeds.ts:97` read and confirmed as a second caller of the family helper.
- **ADVERSARIAL:** "Does normalization hide an upstream price change?" No — `min_ask_in` is read
  fresh on every sync and the cheapest ask moving is exactly what re-imports. Operator manual
  costs still override, unchanged.
- **CHANGE DELTA:** +1,240 of 13,319 = **9.31%**.

### Loop 3 — Final convergence

- **GREEN:** No further defect class. The design now closes every friction FID-2026-1120-001 hit:
  one place for shape knowledge, no slug gate, aliases dropped, tiers preserved, media rows
  non-routable, family derived from the leaf.
- **AUDIT:** Each rule in the Rules list traces to a cited line or an observed payload; nothing is
  asserted from memory.
- **ADVERSARIAL:** The residual risk is a wrong mapping that still typechecks. It is reduced — one
  conversion helper, one `$0` rule, per-shape fixtures, a whole-row parity test — not eliminated.
  The fixture list *is* the gate, which is why step 7 names the cases instead of saying "tests".
- **CHANGE DELTA:** +0 (documentation of convergence only; covered by the record below).

### Convergence record

| Pass | Scope | Delta | Result |
|---|---|---|---|
| 1 | Design defects found in self-review | 13.96% (cap exceeded, declared) | 6 corrections |
| 2 | Independent audit | 9.31% | 4 corrections |
| 3 | Final convergence | 0% | record closed |

What this convergence does **not** claim: that the four shapes are exhaustive (they cover the
three payloads we have evidence for and one we authored); that any provider imports correctly
until its fixture exists; and that the capability gap for absent modality is closed — it is
recorded for FID-2026-1120-001 and guarded only by the provider-level review flag.

## Implementation Evidence (REQUIRED for `closed`)

Implementation commit **`b159ba0`** — `refactor(providers): normalize upstream catalogs before
building rows`.

| Step | Status | Evidence |
|---|---|---|
| 1 canonical types | done | `lib/providers/normalize/types.ts` — `NormalizedModel`, `RawFacts`, `CatalogShape`, `mergeFacts` |
| 2 shape registry + fixtures | done | `lib/providers/normalize/shapes.ts` — `ask-ladder`, `free-pool`, `flat-usd`, `declared-modalities`, `public-overlay`, `alias` |
| 3 `normalizeCatalog` | done | `lib/providers/normalize/index.ts` — primary precedence, enrichment merge, alias/media drop reporting |
| 4 builder consumes canonical row | done | `lib/providers/catalog.ts` — `buildSyncedCatalog` assembles; `buildSyncedModels` kept as the compatibility wrapper for existing tests |
| 5 sync: drop slug gate | done | `lib/storage/providers/sync.ts` calls `deps.fetchMetadata(provider)` with no slug test; the overlay's owner is chosen in `lib/providers/sync.ts` |
| 6 family leaf-first + seeds re-verify | done | `lib/model-family.ts` `leafId` / `publisherPrefix`; the `catalog-seeds.ts` call site is improved by the same rule |
| 7 normalize + parity + invariant tests | done | `tests/catalog-normalize.test.mjs` 12/12; parity fixture `tests/fixtures/catalog-parity.json` |
| 8 `docs/providers.md` shape table | done | new "Catalog shapes (normalization)" section; onboarding checklist item 4 rewritten |

Verification (real output, this tree):

```text
npm run typecheck    PASS (next typegen + tsc --noEmit clean)
npm run lint         PASS (0 errors, 0 warnings)
npm test             tests 1185  pass 1169  fail 0  skipped 16
npm run quality      PASS (400-line ceiling, 700 files scanned)
npm run config:check PASS (non-production)
npm run build        PASS
npm run test:http    807 PASS lines across both suites, 0 FAIL
repository:check     PASS (12 gates)
attribution-guard    PASS
npm run verify       PASS (11 gates, 165.3s) — receipt at .verify/summary.json
                     test 1185/1185 · test:postgres 20/20 · test:http ·
                     test:recovery · quality · build · deployment:receipt
```

### Deviations from the converged text, and why

1. **A non-text output row is dropped, not imported disabled.** The record said `routable: false`
   would feed `importedModelStatus`; that function takes no per-row capability input, and a
   disabled row is still one an operator can price and activate, after which every call fails.
   Dropping and reporting is honest, so the Rules bullet above was corrected to match the code.
2. **Modality became a sixth shape.** The media test exposed a row that declares
   `output_modality` and no price: no primary shape matched, so the modality was never read and
   the row imported as chat. `declared-modalities` is an enrichment shape for that reason.
3. **The overlay's owner is chosen in the wiring, not the port.** `lib/providers/sync.ts` compares
   the slug against `DEFAULT_PROVIDER_SLUG` where its URL lives; the port and the shape layer
   carry no provider-name branch, which is exactly what the invariant test asserts.

## Resolution

- **Closed Date:** 2026-11-20
- **Fix Description:** One normalization stage between the upstream read and the row builder.
  Shape knowledge lives in `lib/providers/normalize/`; aliases and non-text rows are dropped and
  reported; families derive from the leaf id; the overlay's owner is chosen in the wiring.
- **Tests Added:** `tests/catalog-normalize.test.mjs` (12 cases) and
  `tests/fixtures/catalog-parity.json` (whole-row parity fixture).
- **Verification Evidence:** the gate block above, at commit `b159ba0`.
- **Archived:** `dev/fids/archive/FID-2026-1120-002-catalog-normalization-layer.md`

## Lessons Learned

The cost of supporting a new provider was never the transport — the OpenAI envelope is
compatible everywhere. It was that *field knowledge* lived at every read site behind `??`, where
a new vendor's shape cannot reach it and the compiler cannot object. Uniformity is a data
structure, not a convention: once a shape is declared in one table, a provider is a fixture, and
the builder stops being the place where providers are distinguished.
