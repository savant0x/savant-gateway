# FID: Provider identity, model family, and price group

**Filename:** `FID-2026-1029-005-provider-family-group-semantics.md`
**ID:** FID-2026-1029-005
**Severity:** medium
**Status:** converged
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
- used for `owned_by` in `/v1/models` (`lib/../app/v1/models/route.ts:25`);
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

### Loop 2 — Independent audit and self-correction

- **RED:** Pending implementation.
- **GREEN:** Pending.
- **AUDIT:** Pending.
- **ADVERSARIAL:** Pending.
- **CHANGE DELTA:** Pending.

### Loop 3 — Final convergence

- **RED:** Pending final audit.
- **GREEN:** Pending.
- **AUDIT:** Pending.
- **ADVERSARIAL:** Pending.
- **CHANGE DELTA:** Pending.

## Resolution

- **Closed Date:** Pending.
- **Fix Description:** Pending.
- **Tests Added:** Pending.
- **Verification Evidence:** Pending.
- **Archived:** Pending.

## Lessons Learned

Pending.
