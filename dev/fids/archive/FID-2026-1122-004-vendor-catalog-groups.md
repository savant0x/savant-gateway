# FID: Import vendor catalog group notes and pooled capacity

**Filename:** `FID-2026-1122-004-vendor-catalog-groups.md`
**ID:** FID-2026-1122-004
**Severity:** medium
**Status:** closed
**Created:** 2026-11-22 23:05
**Automation level:** 3
**YAGNI-Compliance:** Verified

> **Project application (savant-gateway).** This repository uses npm, not Bun, and it does
> **not** ship `fid:verify`, `quality:report` beyond `npm run quality`, `scope:check` or
> `validate:repository`. The gates that actually exist are declared in `protocol.config.yaml`
> and repeated below. FID closure is checked by review against this template, the gate output
> and the commit recorded in the FID.

---

## Summary

The vendor publishes a second document beside `/v1/models`: a catalog of **prefix groups**, each
naming its publisher slug, label, status, how many publishers are currently pooled behind it
(`activeProviders`, four figures on the largest groups) and — on five of twenty-seven — a
`systemPromptNote` describing a system-prompt transformation the vendor performs. Nothing in the
gateway reads that document, so an operator approving a model cannot see that its capacity is one
account (`anthropic` 0, `openai` 0) or that its prompt is being rewritten upstream. The audit
recorded this as F-8 and F-20; this record imports the document into a provider-scoped snapshot and
shows it in the admin catalog, with no effect on routing, pricing or customer prompts.

## Environment

- **OS:** Windows 11, Node 22.x
- **Language/Runtime:** TypeScript strict (ESM, `.ts` extension imports), PostgreSQL via `pg`
- **Tool Versions:** npm; PGlite for the local engine
- **Commit/State:** `f9cd872` on `main`

## Detailed Description

### Problem

`grep -rn "api/catalog" lib app components` returns no match: `/v1/models` is the only read
(`lib/storage/providers/sync.ts:87-113`). The vendor's group document therefore cannot reach the
operator surface, and the two facts that decide whether a model is safe to publish — pooled
capacity and an upstream prompt rewrite — are invisible in `/admin/catalog`.

### Expected Behavior

A provider that publishes a group document has it read on sync, stored per prefix, and shown in the
admin catalog with its own label. The snapshot never affects admission, pricing, routing or the
prompt we send.

### Root Cause

The sync was built for one document. The overlay mechanism (`fetchMetadata`, `lib/providers/sync.ts`)
covers per-model extra fields from a map, and group-level facts have no field to land in.

### Evidence

```text
$ curl -s https://inferhub.dev/api/catalog | jq 'length, .[0] | keys'
27
["activeProviders","enabled","id","label","models","prefix","slug","status","systemPromptNote"]

$ curl -s https://inferhub.dev/api/catalog | jq -r '.[] | select(.systemPromptNote != null) | .prefix'
claude-code
codebuddy
codebuddy-cn
kiro
codex

$ curl -s https://inferhub.dev/api/catalog | jq -r '.[] | "\(.prefix) \(.activeProviders)"' | sort -k2 -nr | head -3
qwencloud-alibaba 22466
mistral-vibe 17787
codebuddy 4222
```

Captured 2026-11-22 into `.scratch/inh-live/inferhub.dev_api_catalog.json`; the audit records the
same figures (§1.1, F-20).

## Impact Assessment

### Affected Components

- `lib/providers/catalog-groups.ts` — new pure parser
- `lib/providers/{types,registry,request,sync}.ts` — the provider-scoped URL and the read
- `lib/storage/providers/sync.ts`, `lib/storage/store/provider-catalog-groups.ts` — the snapshot
- `lib/storage/schema/{catalog,billing}.ts` — the table and the column
- `app/admin/(panel)/catalog/page.tsx`, `components/admin/provider-catalog-sections.tsx` — display

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a new outbound read on a schedule; bounded by being best-effort and provider-scoped
- [ ] Low

## Proposed Solution

### Approach

A provider names an absolute group-document URL the same way it names a balance URL. One pure
parser understands the document by **content** (an array of objects with a string `prefix` and a
`models` array), not by provider slug. The sync replaces the provider's snapshot inside the same
transaction that stores the catalog counts, and the failure path adds a warning instead of failing
a sync whose real input is `/v1/models`.

### Steps

1. **Registry field.** `providers.catalog_url TEXT`, `ProviderRecord.catalogUrl`, and validation
   shared with `balanceUrl` through one `parseProviderUrl` helper so the two cannot drift
   (`lib/providers/{types,registry}.ts`, `lib/storage/schema/catalog.ts`, `lib/schema/providers.ts`,
   `lib/storage/store/{provider-rows,providers}.ts`).
2. **One parser, content-shaped.** `readCatalogGroups(payload)` accepts a bare array or an object
   carrying `data` / `groups` / `catalog`, requires each entry to have a non-empty `prefix`, drops
   duplicate prefixes keeping the first, reads `models.length` as the model count, `activeProviders`
   as a non-negative integer (else `null`), and `systemPromptNote` as a trimmed string capped at 500
   characters (empty becomes `null`). A payload with no array is an error, so a shape change warns
   instead of silently storing an empty snapshot. Empty array is a valid snapshot.
3. **Snapshot table.** `provider_catalog_groups` keyed by `(provider_slug, prefix)` with slug,
   label, status, enabled, active providers, note, model count and `synced_at`
   (`lib/storage/schema/billing.ts`).
4. **Replace, never merge.** `replaceProviderCatalogGroups(db, slug, groups, syncedAt)` deletes the
   provider's rows and inserts the new set in one transaction
   (`lib/storage/store/provider-catalog-groups.ts`); `listProviderCatalogGroups(db)` groups them by
   provider slug for the page.
5. **Read it during a sync.** `ProviderSyncDeps.fetchCatalogGroups` is optional and supplied by
   `lib/providers/sync.ts` only when `provider.catalogUrl` is set, using the same absolute-URL fetch
   as the balance read (one helper, `lib/providers/request.ts`). The call is best-effort: a failure
   appends `catalog groups unavailable` to the sync warnings and leaves the previous snapshot alone
   (`lib/storage/providers/sync.ts`).
6. **Show it without implying it routes.** The admin catalog gains, per provider with a snapshot:
   the number of prefix groups, total pooled provider slots, the three largest pools by name, and a
   warning line for prefixes whose `systemPromptNote` is set (the note text in the row title). The
   card states that the document is vendor metadata, not a routing or pricing input
   (`components/admin/provider-catalog-sections.tsx`, `app/admin/(panel)/catalog/page.tsx`).
7. **Seed and document.** The InferHub row carries `catalog_url =
   'https://inferhub.dev/api/catalog'` (a one-time migration fills it only where still null);
   `docs/providers.md` and CHANGELOG record what the snapshot is and is not.

### Verification

- `tests/provider-catalog-groups.test.mjs` — both envelopes, duplicate prefixes, `null` capacity,
  note trimming and the cap, a missing array, and an empty array.
- `tests/provider-catalog-groups-postgres.test.mjs` — a second sync replaces the first, another
  provider's rows are untouched, and an empty snapshot deletes only that provider's rows.
- `tests/providers.test.mjs` — `catalogUrl` accepts http(s), refuses credentials and other schemes,
  and an empty value becomes `null`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-catalog-groups.test.mjs
- gate: test tests/provider-catalog-groups-postgres.test.mjs
- gate: test tests/providers.test.mjs
- gate: test tests/provider-inferhub-sync.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-11-22T23:58:00Z
- `npm run verify`: **PASS**, 12/12 gates, 172.2s
- check: exit 0
- storage:check: exit 0
- config:check: exit 0
- repository:check: exit 0 (13 active FIDs at run time)
- test: exit 0 — **1231/1231 pass, 0 skipped**
- test:postgres: exit 0 — 20/20
- quality: exit 0 (400-line ceiling, 703 files)
- build: exit 0
- test:visual-builds-browser: exit 0
- test:http: exit 0
- test:recovery: exit 0
- deployment:receipt: exit 0
- summary: `.verify/summary.json`

## Perfection Loop

### Loop 1 — RED

- **RED:** The document is unread. `grep -rn "api/catalog" lib app components` → no match; the only
  catalog read is `/models` (`lib/storage/providers/sync.ts:87-113`). The facts it carries are the
  ones that decide publication safety (pooled capacity, prompt rewrite) and they appear nowhere in
  `/admin/catalog`.
- **GREEN:** Steps 1-7.
- **AUDIT:** The insertion points exist and are reachable: `saveProviderCatalogSync` runs inside
  `syncProvider` after `replaceModels` (`lib/storage/providers/sync.ts:188`), and
  `ProviderCatalogSections` receives `providers` from `app/admin/(panel)/catalog/page.tsx:52-56`, so a
  new prop has one caller to update. The transport for an absolute URL already exists
  (`lib/providers/request.ts:85-94`) and is reused rather than copied.
- **ADVERSARIAL:** "Is this a second catalog that can contradict `/models`?" It is a snapshot with
  its own table and its own label; nothing joins it to `models`, and the display says so. "Does a
  failing group read hide a broken provider?" No: the model sync's own errors still fail loudly, and
  the enrichment failure adds a warning the operator sees in the sync summary.
- **CHANGE DELTA:** n/a (initial record).

### Missed Questions

1. *Should the note change what we send as a system prompt?* No. Importing a vendor's rewrite into
  our request path would change customer prompts silently; it is displayed as fact.
2. *Should pooled capacity feed admission?* No. It is a vendor claim about its own pool, not a rate
  limit we can enforce; admission keeps using RPM and the balance read.
3. *What about providers whose document is a different shape?* The parser matches by content and
  throws on a non-array, so a different shape produces a warning rather than a wrong snapshot.
4. *Does the snapshot survive a delisting?* It is replaced per sync, so it always describes the last
  successful read; a failed read leaves the previous one and says so in the warnings.
5. *Is the document public?* No: `/api/catalog` answers 401 without a key, so the read uses the
  provider's credential — the same trust boundary as everything else on that origin.

### Implementation Evidence

- [x] **Commit SHA:** `4bdc562` (`feat(catalog): import the vendor's prefix-group document and
  show its pools`), pushed to `main`; pre-push gates passed.
- [x] **File:line ranges:** parser `lib/providers/catalog-groups.ts:28,68-97`; URL field and
  validator `lib/providers/registry.ts` (`parseOptionalProviderUrl`), record
  `lib/providers/types.ts`, column `lib/storage/schema/catalog.ts:30,153`; one-time fill
  `lib/storage/schema/catalog.ts:205-214`; seed `lib/storage/schema/catalog-seeds.ts`; transport
  `lib/providers/request.ts` (`fetchProviderUrl`); read wiring `lib/providers/sync.ts:73-82` and
  `lib/storage/providers/sync.ts:204-219`; store `lib/storage/store/provider-catalog-groups.ts:26`;
  display `components/admin/provider-catalog-sections.tsx:9-63,164-166` and
  `app/admin/(panel)/catalog/page.tsx:20-27,56-59`; admin field
  `components/admin/provider-form.tsx`.
- [x] **Gate output:** `npm run verify` PASS, 1231/1231 tests (receipt above).
- [x] **Reproducibility:** `grep -rn catalog_url lib` names the column, record, store and seed;
  `grep -rn replaceProviderCatalogGroups lib` returns the store and its one caller.
- [x] **Step statuses:** 1-7 `implemented`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist and carry the change.
- [x] Implementation matches the Proposed Solution, step by step.
- [x] Typecheck/tests/lint pass with the pasted output above.
- [x] Production call-graph evidence: `syncProvider` (`lib/storage/providers/sync.ts:204`) →
  `deps.fetchCatalogGroups` (`lib/providers/sync.ts:73`) → `fetchProviderUrl` →
  `readCatalogGroups` → `replaceProviderCatalogGroups`; the display hop is
  `listProviderCatalogGroups` (`lib/store-facade/catalog.ts`) → page →
  `components/admin/provider-catalog-sections.tsx:165`. Both ends are reachable from a shipped route.
- [x] FID status reflects the implementation state.

### Loop 2 — Independent audit and self-correction

- **RED:** Two defects found by the gates and by reading my own diff. (1) `npm run lint` failed with
  a prettier warning on the new component's parameter list — zero warnings is the bar. (2) The admin
  provider form did not carry `catalogUrl`, so saving a provider from `/admin/providers` would have
  written `NULL` over the seeded document URL: a silent data loss the tests would not have caught,
  because the store test writes through the store rather than the form.
- **GREEN:** Reformatted the signature; added `catalogUrl` to `ProviderDraft`, `EMPTY_PROVIDER`,
  `draftFromProvider`, `providerPayload` and a "Catalog groups URL (optional)" field, mirroring the
  balance field exactly.
- **AUDIT:** `npm run lint` exit 0 with zero warnings; `tests/provider-inferhub-sync.test.mjs`
  proves the seeded row keeps its URL through an operator edit, and the store test now asserts the
  seeded `catalogUrl` too.
- **ADVERSARIAL:** "Does an unsaved blank field wipe the URL?" `parseOptionalProviderUrl` turns an
  empty string into `null`, so clearing the field deliberately removes the document; the field shows
  the current value, so an operator sees what they would clear.
- **CHANGE DELTA:** ~10% of the FID text (two findings, the field, this loop).

### Loop 3 — Final convergence

- **RED:** Residual limits, named: the snapshot only exists after a sync, so a disabled or
  unreachable provider shows none; the parser reads one shape family, so a vendor with a different
  document produces a warning rather than a snapshot; and pooled capacity is the vendor's own claim,
  not something this gateway verifies.
- **GREEN:** No code change. All three are stated in `docs/providers.md` and on the card ("Vendor
  metadata, read at the last sync. Not a routing, admission or pricing input").
- **AUDIT:** `grep -rn provider_catalog_groups lib app` shows only the schema, the store and the page
  read — no gateway, pricing or prompt path imports it, which is the boundary this record claims.
- **ADVERSARIAL:** "Could a note reach a customer?" No: the card is in `/admin`, and the only stored
  text is rendered in an admin `title` attribute.
- **CHANGE DELTA:** 0% (documentation only).

## Resolution

- **Closed Date:** 2026-11-22 24:05
- **Fix Description:** A provider names its prefix-group document in `catalog_url`; sync reads it,
  stores a per-prefix snapshot in `provider_catalog_groups` (replaced wholesale, failure keeps the
  old one and warns), and `/admin/catalog` shows group count, pooled slots, largest pools and every
  prefix whose system prompt is rewritten upstream. Nothing else reads it.
- **Tests Added:** Yes — `tests/provider-catalog-groups.test.mjs` (9),
  `tests/provider-catalog-groups-postgres.test.mjs` (4), a sync wiring case in
  `tests/provider-sync-postgres.test.mjs`, a validator case in `tests/providers.test.mjs`, and the
  seeded URL in `tests/store-providers-postgres.test.mjs`.
- **Verification Evidence:** `npm run verify` PASS — 12/12 gates, 1231/1231 tests, 0 skipped.
- **Archived:** 2026-11-22 24:10 EST — implementation `4bdc562`, pushed to `main`.

## Lessons Learned
The defect worth remembering is the one no test covered: a new registry field that the admin form
row does not carry is silently erased the first time an operator saves that provider. An additive
field is not finished at the schema and the store — the form is a writer too, and it was found by
reading the diff rather than by a failing gate.
