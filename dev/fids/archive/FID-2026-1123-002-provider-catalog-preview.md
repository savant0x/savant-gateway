# FID: Keyless provider catalog preview

**Filename:** `FID-2026-1123-002-provider-catalog-preview.md`
**ID:** FID-2026-1123-002
**Severity:** medium
**Status:** fixed
**Created:** 2026-11-23 21:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

An operator cannot see what an upstream would give them before paying for it.
`syncProvider` refuses to read a catalog at all unless the provider's key
variable is configured (`lib/storage/providers/sync.ts:156`), and the only other
read path — the enable-time sync — needs the same key. For InferHub, whose
`/v1/models` is publicly readable (507 rows, `GET` 200 without a credential on
2026-11-22), that gate is our own, not the vendor's: the operator had to buy a
key before the panel could answer the one question that decides the purchase.
This FID adds a preview that reads a provider's catalog with no credential when
none is configured, reports exactly what a sync would import and what it would
refuse, and writes nothing.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `3c14b5e` on `main` (clean)

## Detailed Description

### Problem

Three surfaces read an upstream catalog, and all three require a secret:

| Surface | Path | Gate |
| --- | --- | --- |
| Sync | `POST /api/admin/providers/{slug}/sync` | `providerKeyConfigured` → zero-row summary |
| Enable-time read | `PATCH /api/admin/providers/{slug}` | same gate, then `syncProvider` |
| Test | `POST /api/admin/providers/{slug}/test` | `providerFetch` → `getProviderKey` throws |

The gate is correct for import: rows a keyless gateway cannot serve must never
reach the public catalog, and a `401` from an Import that "worked" would be a lie.
It is wrong for *reading*: the decision the operator has to make before funding a
wallet is "which models, at what price, would this provider add?", and no surface
answers it without a paid credential.

The audit recorded this as F-1 (`docs/research/inferhub-upstream-audit.md:437`):
`docs/providers.md` said `/v1/models` answers 403 unauthenticated, the live
surface answers 200 with 507 rows, and the sync gate makes a keyless preview
impossible even where the vendor allows it.

### Expected Behavior

With an admin session and nothing else, the operator asks for a preview and gets:

1. the number of upstream rows read, and how many would import, split the way a
   sync splits them (free, paid, subscription-only);
2. the exact refusals a sync would report (alias-only rows, non-text output,
   free-pool rows when resale is not permitted);
3. whether the read was **keyless** or used the configured key, stated plainly;
4. a small sample of rows with their input/output cost per 1M tokens, so the
   price question is answered with numbers;
5. an unchanged database: no rows imported, no `synced_at`, no enable, no
   balance read, no content rematch.

### Root Cause

The credential is applied by `providerHeaders` (`lib/providers/request.ts:33`),
which calls `getProviderKey` and throws when the variable is empty. There is no
way to build the provider's headers *without* a credential, so every read path
that uses the transport inherits "no key, no read". The sync gate above it is a
second, independent guard on the same assumption.

### Evidence

```text
$ node -e 'process.env.INFERHUB_API_KEY=""; …'
# live, 2026-11-22, no credential:
GET https://api.inferhub.dev/v1/models → 200, 507 rows

$ grep -n "providerKeyConfigured" lib/storage/providers/sync.ts
156:  if (!providerKeyConfigured(provider.keyEnvVar)) {
157:    return unconfiguredSummary(provider);

$ grep -n "getProviderKey" lib/providers/request.ts
18:  throw new ProviderConfigError(
```

## Impact Assessment

### Affected Components

- `lib/providers/request.ts` — header construction and transport
- `lib/providers/auth-headers.ts` — per-kind credential headers
- `lib/providers/preview.ts` (new) — the preview orchestration
- `app/api/admin/providers/[slug]/preview/route.ts` (new) — admin endpoint
- `components/admin/provider-preview.tsx` (new) — the panel card
- `components/admin/providers-panel.tsx` — the Preview action
- `docs/providers.md` — how to preview without a key

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: no data path changes; a new read-only surface plus one optional
      branch in header construction.

## Proposed Solution

### Approach

Split "headers with a credential" from "headers that may omit one", and add a
preview module that composes the existing pieces — `fetchUpstreamModels` for
pagination and envelope validation, `buildSyncedCatalog` for counting — with a
transport that carries no credential when the variable is empty. Nothing in the
preview path touches the database, so "writes nothing" is structural rather than
promised.

### Steps

1. `authHeaders` takes `key: string | null`; a null key omits `Authorization` and
   `x-api-key` while keeping `Accept`, the provider's `defaultHeaders` and the
   Anthropic `anthropic-version` wire header. `providerHeaders` keeps its hard
   requirement; new `providerPreviewHeaders`/`providerPreviewFetch` read the key
   if present and otherwise proceed keyless. One fetch implementation, no copy.
2. `lib/providers/preview.ts`: `previewProviderCatalog(provider, deps?)` returns
   `{ keyless, upstreamRows, imported, free, paid, subscriptionOnly, refused:
   { alias, media, freePool }, sample }` and takes no database handle. A malformed
   envelope or a non-2xx answer throws with the provider's own text, so the route
   reports the failure instead of a zero.
3. `POST /api/admin/providers/[slug]/preview` — admin-guarded, `NO_STORE`, 404 for
   an unknown slug, `502` with a sanitized message for an upstream failure.
4. `components/admin/provider-preview.tsx` renders the counts, the refusals, the
   keyless/keyed statement and the cost sample; the panel adds one Preview button
   and one `previewing` state. `Test` is disabled when this runtime cannot see the
   key, because the preview is the surface that answers that case.
5. `tests/provider-catalog-preview.test.mjs`: keyless headers omit both credential
   headers and keep `defaultHeaders`/`anthropic-version`; keyed headers carry the
   bearer token; counts and refusals equal `buildSyncedCatalog` on the same input;
   a free-pool refusal appears when `resaleFreePool` is false; a `401` throws with
   the provider's message; pagination is followed with the injected transport.
6. `docs/providers.md` gains "Preview a catalog without a key", naming what preview
   does *not* do (import, enable, read a balance, prove the credential).

### Non-goals

- Preview never imports, enables, prices, or publishes. A keyless row is not a
  servable row.
- No secret is used, stored or echoed; `keyless` is a boolean about this runtime's
  environment, not a value.

### Verification

`node --test tests/provider-catalog-preview.test.mjs` plus the full gates. Live:
a keyless preview of the InferHub row in a process whose environment has no
`INFERHUB_API_KEY` must return the real catalog counts, and a keyed preview
through the running admin panel must return the same counts with `keyless: false`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-catalog-preview.test.mjs
- gate: test tests/providers.test.mjs
- gate: quality
- gate: verify

### Verification Receipt

- verified: 2026-11-23T22:05:00Z
- lint: exit 0 (`npm run check`)
- typecheck: exit 0
- test tests/provider-catalog-preview.test.mjs: exit 0 — 8/8 cases
- test tests/providers.test.mjs: exit 0 (`npm test`)
- quality: exit 0 (400-line ceiling, 712 files)
- verify: exit 0 — 12/12 gates, 1259/1259 tests, 0 skipped, 183.5s

```text
verify: PASS
  PASS          check           exit 0
  PASS          storage:check   exit 0
  PASS          config:check    exit 0
  PASS          repository:check exit 0
  PASS          test            exit 0 · 1259/1259 tests, 0 skipped
  PASS          test:postgres   exit 0 · 20/20 tests, 0 skipped
  PASS          quality         exit 0
  PASS          build           exit 0
  PASS          test:visual-builds-browser exit 0
  PASS          test:http       exit 0
  PASS          test:recovery   exit 0
  PASS          deployment:receipt exit 0
  duration      183.5s
```

## Perfection Loop

### Loop 1 — RED

- **RED:** the only read path is keyed, and `getProviderKey` throws before the
  request is built, so "read without a key" cannot be expressed at all. A second
  guard in `syncProvider` returns an empty summary, which reads as "provider has
  no models" rather than "we did not ask".
- **GREEN:** steps 1–6 above.
- **AUDIT:** to be recorded in Loop 2 with the real gate output.
- **ADVERSARIAL:** the strongest objection is that a keyless read returns a
  catalog the provider will refuse to serve: rows the preview shows are not rows
  we can sell. The answer is that the preview is labelled as a read, reports
  `keyless: true` in the response and in the card, and the import path keeps its
  hard gate — nothing in the public catalog changes.
- **CHANGE DELTA:** 0% — first convergence pass.

### Missed Questions

1. **Should `syncProvider` itself go keyless?** No. An unconfigured provider must
   not import rows the gateway cannot serve; that would publish models whose every
   call answers 503. The gate stays, and the preview is a separate surface.
2. **Should the preview reuse `buildSyncedCatalog`?** Yes — it is pure and is the
   same code the sync uses, so "what would import" is computed by the importer
   rather than by a second estimator that could drift.
3. **Does a keyless preview leak anything?** It sends the provider's configured
   `defaultHeaders` and `Accept`, exactly as a sync does, and adds no customer or
   operator data. The credential is simply absent.
4. **What if the provider requires auth even for `/models`?** The preview returns
   the provider's own error text through the route's 502, which is the honest
   answer and the signal to configure the key.
5. **Should `Test` stay enabled without a key?** No. `Test` exists to prove the
   credential, so the panel now disables it when this runtime cannot see the key
   and points at Preview. Otherwise a keyless `Test` would report a `401` as a
   provider failure.

### Loop 2 — implementation records

**One indirection removed before it shipped.** The first `preview.ts` used a
dynamic `import()` to reach `fetchUpstreamModels`, on the assumption that the
storage module might import back into `lib/providers/`. Grep showed no such
import, so the indirection bought nothing and made the default read path
untestable at module level. It is a static import now; the reader stays
overridable through `deps.readCatalog`.

**Nine lint warnings on the first pass** (prettier line breaks in the preview
card, `padding-line-between-statements` before two early `return`s, one import
layout in `request.ts`). All fixed by hand; `npm run lint` is zero-warning.

**`npm run verify` FAILED on the first run, honestly recorded.**

```text
verify: FAIL
  FAIL          repository:check exit 1
  PASS          test            exit 0 · 1259/1259 tests, 0 skipped
  …
repository-check: FAIL
  - dev/fids/README.md does not register active FID-2026-1123-002
```

The register row was missing because the FID was written after the previous
closure commit. The row is added, `npm run repository:check` passes with 13
active FIDs, and the full run is repeated below.

**Live keyless proof needed a shim, and that limit is stated.**
`lib/providers/request.ts` imports `server-only`, so a plain `node` script cannot
import it; Next also refuses a second dev server for the same project, and port
3100 was already held by an unrelated process that was left alone. The keyless
proof therefore ran the shipped modules under a `.scratch` loader that maps
`server-only` to an empty module — scaffolding, not project code — against the
real vendor with `INFERHUB_API_KEY` deleted from the process environment. It is a
proof of the code path, not of a keyless deployment.

## Resolution

- **Closed Date:** 2026-11-23
- **Fix Description:** `authHeaders` takes `key: string | null` and omits
  `Authorization`/`x-api-key` when it is null while keeping `Accept`, the
  provider's `defaultHeaders` and the Anthropic `anthropic-version` wire header.
  `lib/providers/request.ts` gained `providerPreviewHeaders` /
  `providerPreviewFetch` over one shared fetch implementation, so the credential
  rule lives in one place. `lib/providers/preview.ts` (`previewProviderCatalog`)
  takes no database handle, reads with the shipped paginated
  `fetchUpstreamModels`, and counts with `buildSyncedCatalog` — the same builder
  the sync uses — returning `{ keyless, upstreamRows, imported, free, paid,
  subscriptionOnly, refused, sample }`. `POST
  /api/admin/providers/{slug}/preview` is admin-guarded, returns 404 for an
  unknown slug and 502 with the provider's own text on an upstream refusal.
  `components/admin/provider-preview.tsx` renders the counts, refusals,
  keyed/keyless statement and a 12-row cost sample; the panel adds a Preview
  button and disables Test when this runtime has no key. Documented in
  [docs/providers.md](docs/providers.md#preview-a-catalog-without-a-key).
- **Tests Added:** `tests/provider-catalog-preview.test.mjs` (8 cases: keyless
  headers keep provider headers and drop both credential headers, an Anthropic
  read keeps the wire version, a configured key still produces credentials, the
  counts equal the importer's, a configured key reports `keyless: false`, a
  provider that forbids free-pool resale shows that refusal, a 401 throws the
  provider's text instead of a zero, and the shipped reader follows pagination
  with the injected transport). Suite total 1251 → 1259.
- **Verification Evidence:** `npm run verify` PASS — 12/12 gates, 1259/1259
  tests, 0 skipped, 183.5s, after a first run that FAILED `repository:check` for
  the missing register row (recorded in Loop 2). Live keyed read through the
  admin API on the running server: `200 {keyless: false, upstreamRows: 531,
  imported: 272, free: 0, paid: 272, refused: {alias: 245, media: 14,
  freePool: 0}}`, and `404` for an unknown slug. Live keyless read of the same
  row with `INFERHUB_API_KEY` deleted from the process: identical counts with
  `keyless: true`. The database was unchanged afterwards — 465 model rows,
  InferHub `synced_at` still `2026-11-23T18:52:48.175Z`, zero sync leases.
  Implementation commit `fecc7f1`.
- **Archived:** 2026-11-23
