# FID: Provider identity, model family, and price group

**Filename:** `FID-2026-1029-005-provider-family-group-semantics.md`
**ID:** FID-2026-1029-005
**Severity:** medium
**Status:** closed
**Created:** 2026-10-29 02:55 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The catalog stores the upstream public-metadata `provider` sentinel (`"Free"`)
as if it were the product provider. Twenty-one rows currently carry
`provider = "Free"` — the eleven free-pool rows and ten subscription-only rows.
The OpenAI-compatible model list publishes `owned_by: "Free"`, and the UI
labels the field “Provider”. Savant Gateway is the provider; free, paid, and
subscription are price groups; the model family is GPT, Claude, DeepSeek, and
so on.

This FID separates those three concepts everywhere they surface. It does not
change routing, credit math, or pricing.

## Environment

- **OS:** Windows 11 (Git Bash)
- **Runtime:** Node `v24.21.0`, Next.js `16.4.3`, React `19.3.0`
- **State:** `1e020d5` on `main`; clean working tree
- **Observed:** `GET /api/models` returns
  `{"provider":"Free", ...}` for `free/deepseek-v4-pro-0813`; DB has 21
  `provider='Free'` rows.

## Detailed Description

### Problem

`lib/provider.ts` uses `spec.provider` from the upstream metadata when present,
falling back to `"Free"` for ids under `free/`. The upstream value for the
free/subscription pool is the group name `"Free"`, not a model family. That
value is then:

- stored in `models.provider`;
- returned as `provider` from `/api/models` and admin pricing;
- used for `owned_by` in `/v1/models` (`app/v1/models/route.ts:25`);
- displayed under a “Provider” column in the public catalog, landing preview,
  and analytics table;
- used by `accessFor` and overview counts as a group signal.

The result tells clients and operators that the provider is “Free”. It also
makes free DeepSeek, GPT, and Claude rows share one meaningless “provider”.

### Expected Behavior

- **Provider** is always Savant Gateway. `/v1/models` publishes
  `owned_by: "savant-gateway"`.
- **Family** is the model line (GPT, Claude, DeepSeek, Gemini, GLM, Kimi, Grok,
  Muse, Tencent, Jev Group, Other). It is returned as `family`, never as
  `provider`.
- **Group** is `free`, `paid`, or `subscription`, derived from the catalog row
  and its free-pool flag. It is returned as `group` by `/v1/models` and as
  `access` by the UI data shape.
- No catalog row stores or emits `"Free"` as a family.
- UI labels say “Family” and “Group”, not “Provider” and “Access”.
- The public catalog page states the provider identity explicitly.

### Root Cause

The rebuild reused the upstream metadata vocabulary without translating it to
the product’s domain. The upstream field is a grouping label for its pools; the
gateway needs three separate concepts and only modeled one column.

### Evidence

```text
$ node -e "select provider, count(*) ... group by provider"
Free      21
GPT        5
Jev Group  4
Gemini     3
DeepSeek   3
Claude     3
GLM        2
Tencent    1
Muse       1
Kimi       1
Grok       1

$ curl -s /api/models | ...
{"id":"free/deepseek-v4-pro-0813",...,"provider":"Free",...}
```

## Impact Assessment

### Affected Components

- New `lib/model-family.ts` — pure family normalization and the gateway
  identity is read from `config/site.ts`.
- `lib/provider.ts` — stop treating `"Free"` as a family; derive family from
  the model id when upstream only supplies the group.
- `lib/db.ts` — one boot migration rewriting legacy `provider='Free'` rows.
- `lib/types.ts` — `ModelSummary.family`, `AnalyticsModel.family`,
  `SyncedModel.family`; `access` remains the UI group.
- `lib/store/shared.ts`, `lib/store/models.ts`, `lib/store/overview.ts`,
  `lib/store/analytics.ts` — mapping and group counts.
- `app/v1/models/route.ts` — `owned_by`, `family`, `group`.
- `components/catalog`, `components/landing`, `components/admin` — labels and
  field references.
- `app/models/page.tsx` — provider identity and group wording.
- Docs: README, knowledge, AGENTS (if terminology changes are needed).
- Tests: new `tests/model-family.test.mjs`.

### Risk Level

- [x] Medium: an API shape change and a boot-time data rewrite. Routing and
  money math are untouched. The migration is idempotent and only targets
  `lower(provider) = 'free'`; a failed normalization leaves the old label, not
  a broken catalog.

## Proposed Solution

1. Add `config/site.ts` provider identity (`savant-gateway`) and
   `lib/model-family.ts` with a small label map and `normalizeFamilyName`.
2. In the sync, set `family = normalizeFamilyName(id, spec.provider)`; use
   `id.startsWith("free/")` for the free/subscription pool, not the family.
3. Add a boot migration that rewrites legacy `provider='Free'` rows to the
   inferred family.
4. Rename the serializable field from `provider` to `family` on model and
   analytics shapes; map the DB column once in `lib/store/shared.ts`.
5. Publish `owned_by: "savant-gateway"`, `family`, and `group` from
   `/v1/models`. Keep the UI `access` field as the group.
6. Relabel the public catalog, landing preview, admin catalog/pricing, and
   analytics to Family and Group; add the provider identity to `/models`.
7. Update docs and add unit tests for mapping and fallback behavior.
8. Run gates, live sync, API checks, close the FID, commit, push.

### Verification

- `tests/model-family.test.mjs` covers known labels, `free/` stripping,
  unknown fallback, and non-free provider preservation.
- `npm run verify` exit 0.
- Live: sync 45 models; DB has zero `provider='Free'`; `/api/models` has
  `family` and no `provider`; `/v1/models` has `owned_by: "savant-gateway"`,
  `family: "DeepSeek"` for a free DeepSeek row, and `group: "free"`; UI shows
  Family and Group; filter by family still returns rows.
- Existing pricing and admin receipts remain green.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-family.test.mjs
- gate: test tests/pricing.test.mjs
- gate: quality
- gate: build
- gate: verify

## Perfection Loop

### Loop 1 — RED

- **RED:** `provider='Free'` is stored for 21 rows; `/v1/models` says
  `owned_by: "Free"`; UI calls the family field Provider.
- **GREEN:** Normalize family, add provider identity, group field, migration,
  labels.
- **AUDIT:** DB query, API response, UI copy.
- **ADVERSARIAL:** A sync must not resurrect “Free”; an existing DB must be
  repaired without a sync; a family filter must not collapse free rows into one
  group; no pricing/routing behavior may change.
- **CHANGE DELTA:** baseline.

### Missed Questions

1. **Does the upstream “Free” value describe a provider?** No. It describes the
   pool/group. The family must come from the model id or metadata when the
   metadata is not a group sentinel.
2. **Should the free group be inferred from `allowFree` or the id?** The
   `free/` id is the stable pool signal. `allowFree` can be true on paid rows;
   the weighted free pool remains `free/` + `allowFree`.
3. **Is the database column renamed?** No. `models.provider` remains the
   internal family column; the public/admin serializable field is `family`.
   This avoids a destructive schema migration while removing the incorrect
   API vocabulary.
4. **What happens to an unknown family?** Title-case the id prefix; never
   return `Free`.
5. **Does this change model access?** No. It changes labels and payload keys;
   `accessFor` still returns free/subscription/paid from the same row flags.

### Verification Receipt

- verified: 2026-10-29T06:58:00Z (local 2026-10-29 02:58 EDT)
- tree: `ecc15ac` (feature) plus the closure documentation in the closing
  docs commit
- `npm run lint`: exit 0, no warnings
- `npm run typecheck`: exit 0
- `npm test`: exit 0, 30 tests / 30 pass / 0 fail
- `npm run quality`: exit 0, PASS (400-line ceiling, 92 files scanned)
- `npm run build`: exit 0, 20 routes
- `npm run verify`: exit 0

```text
ℹ tests 30
ℹ pass 30
ℹ fail 0
quality: PASS (400-line ceiling, 92 files scanned)
VERIFY_EXIT=0
```

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `ecc15ac` — `feat(catalog): separate provider, family,
      and price group (FID-2026-1029-005)`.
- [x] **File:line ranges:**
  - `config/site.ts:4-7` — provider identity (`name`, `slug`).
  - `lib/model-family.ts:1-57` — known family map, id inference, and group
    sentinel normalization.
  - `lib/provider.ts:250-278` — sync uses `normalizeFamilyName`; the free
    group is the `free/` id plus the allow-free flag.
  - `lib/db.ts:232-253,279` — idempotent boot repair for legacy
    `provider='Free'` rows.
  - `lib/store/shared.ts:99-117` — group classification and `family:
    row.provider` mapping.
  - `lib/store/overview.ts:26-35` — paid/subscription counts keyed by the id
    group, not the family.
  - `lib/store/analytics.ts:104-160` — `family` alias and payload.
  - `app/v1/models/route.ts:26-29` — `owned_by: "savant-gateway"`, `family`,
    `group`.
  - `app/api/models/route.ts:14-15` — top-level provider identity.
  - `components/catalog/model-catalog-table.tsx:206-208` — Family/Group
    headers, family filter and sort.
  - `components/admin/models-table.tsx:187-188` — admin Family/Group columns.
  - `components/admin/pricing-table.tsx:222-223` and
    `components/admin/pricing-row.tsx:88` — pricing Family/Group columns.
  - `components/admin/analytics-models.tsx:40,63` — analytics Family column.
  - `app/models/page.tsx:38-48` — provider identity and price-group copy.
- [x] **Gate output:** pasted in Verification Receipt above; raw log kept at
      `/tmp/sg-verify-family.log` during the session.
- [x] **Reproducibility:** `grep -n "export function familyFromModelId"
      lib/model-family.ts` → `29`; `grep -n "owned_by" app/v1/models/route.ts`
      → `26`; `grep -n "normalizeLegacyFamilies" lib/db.ts` → `232` and
      `279`.
- [x] **Step statuses:** all eight Proposed Solution steps **implemented**;
      no blocked or deferred steps.

### Code Verification Evidence

- [x] Files exist and the production build resolved all 20 routes.
- [x] Implementation matches the solution, including the idempotent legacy
      repair and the API rename from `provider` to `family`.
- [x] Lint, typecheck, tests, quality, and build pass with pasted output.
- [x] Production call-graph evidence: live boot migrated 21 rows; a live sync
      imported 45 models and left `free_sentinel = 0`; `/api/models` returned
      `provider: "Savant Gateway"` and `family: "DeepSeek"` with no legacy
      `provider` key; `/v1/models` returned `owned_by: "savant-gateway"`,
      `family: "DeepSeek"`, `group: "free"`; `/models` rendered Family and
      Group columns and `Provider: Savant Gateway`.
- [x] FID status reflects the actual state: closed against `ecc15ac` after the
      gates and live receipts above.

### Loop 2 — Independent audit and self-correction

- **RED:** The first implementation left `owned_by: model.provider`, so the
  API would have published `owned_by: "Free"` even after the sync fix. The
  public and admin tables still had a Provider column, and the internal sync
  sorted by the old field name.
- **GREEN:** `/v1/models` now uses `siteConfig.provider.slug`; all model
  shapes use `family`; the legacy boot migration runs before any page can read
  the catalog; the UI labels and filters were renamed.
- **AUDIT:** The live checks found `provider: "Savant Gateway"`, family
  DeepSeek for `free/deepseek-v4-pro-0813`, group `free`, and zero `Free`
  strings in the `/v1/models` payload. A sync after the boot repair stayed at
  zero sentinels.
- **ADVERSARIAL:** A fresh sync is the path that previously reintroduced the
  label; it was run after the fix and checked at the DB and API layers. The
  migration only matches `free`/empty provider values and is safe to re-run.
- **CHANGE DELTA:** 9% (owned_by, API shape, and label corrections).

### Loop 3 — Final convergence

- **RED:** Final risks: a stale server process serving the old payload, an
  unmigrated DB, an admin table with a header but no cell, or a family filter
  that no longer works.
- **GREEN:** The production server was restarted on the rebuilt bundle; the
  DB migration ran; every table row count was checked against its header; the
  public family filter and provider pill were verified in the rendered HTML.
- **AUDIT:** `/models` 200 and admin overview/catalog/pricing/analytics 200;
  public DB families are GPT, Claude, DeepSeek, Gemini, GLM, Kimi, Grok, Muse,
  Tencent, Jev Group, Minimax, Mimo, Qwen, Hy4 with no `Free`; quality scans
  92 files; build lists 20 routes.
- **ADVERSARIAL:** The serializable field rename is breaking for any external
  consumer of `/api/models`; this repository has no such consumer and the API
  is documented. `models.provider` remains a legacy internal column name by
  design, documented in knowledge.md, rather than a risky schema rename.
- **CHANGE DELTA:** 1% (record and copy corrections only).

## Resolution

- **Closed Date:** 2026-10-29 02:59 EDT
- **Fix Description:** Savant Gateway is now the provider identity. Model
  families are normalized from the id when upstream metadata supplies the
  `Free` group sentinel, legacy rows are repaired at boot, and syncs cannot
  reintroduce the sentinel. `/v1/models` publishes `owned_by:
  "savant-gateway"`, `family`, and `group`; `/api/models` publishes the
  provider identity and `family`. Public and admin tables use Family and Group
  labels and the public catalog states the provider explicitly.
- **Tests Added:** Yes — `tests/model-family.test.mjs` covers known families,
  prefix stripping, unknown fallbacks, group-sentinel normalization, and
  preservation of real family labels. Total suite: 30 tests.
- **Verification Evidence:** `npm run verify` exit 0; live boot migration,
  sync, database, `/api/models`, `/v1/models`, and rendered-page receipts
  above.
- **Archived:** 2026-10-29 02:59 EDT — moved to `dev/fids/archive/` with this
  receipt.

## Lessons Learned

Upstream vocabulary is not product vocabulary. A field named `provider` that
carries a group sentinel is a defect waiting to surface in an API, and adding a
new label at the UI is not enough: fix the storage boundary, the sync, and the
serializable shape together. Re-run a sync after a normalization fix, because
that is the path that can write the bad value back. Keep a migration for
legacy rows so a database that is not synced immediately still tells the
truth.
