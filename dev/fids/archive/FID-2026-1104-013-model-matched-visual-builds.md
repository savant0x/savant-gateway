# FID: Model-matched visual builds with Pelican and OpenRouter artifacts

**Filename:** `FID-2026-1104-013-model-matched-visual-builds.md`
**ID:** FID-2026-1104-013
**Severity:** medium
**Status:** closed
**Authorization:** 013A was authorized 2026-11-05 and 013B on 2026-11-06. The
operator approved the MIT-licensed Pelican/OpenRouter source use and accepted
the related publication responsibility. Both tracks are implemented and locally
verified 2026-11-06; no real source publication is claimed.
**Scope:** 013A Pelican and 013B OpenRouter artifact implementations, both
authorized and locally verified 2026-11-06
**Created:** 2026-11-04 17:15 UTC
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Build the Savant visual showcase from Pelican SDF and OpenRouter game artifacts,
with precise links to the existing model catalog. Preserve the source prompt,
model version, generation configuration, provenance and rights record. Import
immutable snapshots, review them, and display executable examples only inside
an isolated viewer. 013A implements Pelican. 013B implements the OpenRouter
self-contained HTML artifact lane against the observed games fixture. The
operator approved both source tracks on 2026-11-06 and accepted publication
responsibility. No real source publication is claimed without an operator
import and review.

## Environment

- Windows / PowerShell; observed Node v24.21.0, npm 12.2.1; Next.js 16.4.3.
- Declared runtime is Node 22.x. Runtime reconciliation belongs to
  FID-2026-1104-008; this record does not certify the observed runtime.
- Grounding HEAD: `b735304411df2d6c07195beae2ca6dec3c5fb4c5`.
- Concurrent admission work is present in the working tree. Only this FID,
  this session's SCOPE section and its planning receipt may be edited here.
- PostgreSQL/PGlite, existing catalog, model-detail and admin authentication.
- Planning authority: "make the fid, run full perfection loop on it then present it".
- 2026-11-05 authorization: "lets auth 013a and complete 009". FID-2026-1104-009
  is closed at `0052734`; 013A is authorized to start. 013B is not authorized.
- 2026-11-04 review correction: the operator accepted the FID corrections,
  register row and Pelican/OpenRouter split. Implementation was blocked at that
  review; 013A was authorized on 2026-11-05.
- Source ruling: "let's remove scad, i reviewed it and it it very outdated,
  we need to remove that source". SCADBench removed by operator 2026-11-04.
  VoxelBench remains shelved. Neither receives an adapter, preset or import.

## Detailed Description

### Problem

The catalog has prices, measured AA scores, identity evidence and linked
articles, but no first-class visual-build records, import review or interactive
examples. Existing matchers answer different questions: routing folds build
dates; article matching finds mentions; neither proves which exact version
generated an executable scene.

### Expected Behavior

Visitors browse `/showcase`, filter by model/source/task and open
`/showcase/[id]`. The same published examples appear on relevant public model
pages. A build always names its original source and model, and identifies the
matched Savant offering separately. Failed or unmatched imports stay visible
to the operator. A source outage cannot block catalog, inference or billing.

### Root Cause

Content records support articles, videos, papers, repos and discussions, not
versioned executable artifacts. No artifact-to-model identity contract or
browser execution boundary exists. Reusing a routing key as an artifact claim
would silently conflate dated models and generation settings.

### Evidence

Repository grounding, read before design:

```text
lib/model-identity.ts:21 canonicalModelKey strips namespaces and build/date tails
lib/benchmarks.ts:108-112 normalizeModelKey folds spelling; preserves date tokens
lib/benchmarks.ts:182 matchBenchmarks includes a withoutBuildDate fallback
lib/content/linking.ts:70 modelAliases; :154 suggestModelLinks matches mentions
lib/content/store/links.ts replaceAutoLinks preserves existing operator links
lib/storage/schema/content.ts content.items kind check has no visual-build kind
app/models/[...id]/page.tsx:226 CoveragePanel; :234 IdentityPanel
next.config.mjs:17 X-Frame-Options: DENY applies to /:path*
13 active rows in dev/fids/README.md before registration; 013 was absent
```

Source reads on 2026-11-04, without inference, votes or outbound messages:

| Source | Observed format | Publication evidence / limits |
| --- | --- | --- |
| Pelican SDF | `data/manifest.json`, `data/results/*.json`, `data/artifacts/*.js`, `benchmark/prompt.txt`, `assets/thumbnails/*.jpg`; 76 published runs | Public repository MIT license; pin a commit and retain its license text. The prompt is a separate 3,387-byte file; results expose `promptSha256`/`promptVersion` but no prompt text. Thumbnails are generated 480×270 previews under `assets/thumbnails/`, not a declared result field, and failed runs have none. |
| OpenRouter games | Server-rendered listing observed 2026-11-06 with 46 model entries and `documentUrl`, `thumbnailUrl`, `costUsd`, `generationTimeMs` and `threeVersion` fields. Each document is a self-contained HTML file with inline Three.js and no external asset URL. | The operator approved the MIT-licensed source use on 2026-11-06 and accepted publication responsibility. A pinned one-record fixture is committed at `tests/fixtures/openrouter/`; no live page is scraped during import. |

Pelican commit observed: `63190d7e5fb883175b8612374de5e7f094293548`.
Sample `gpt-6-1-sol-high-run-01.json` reports source status `unverified`,
validation `passed`, effort `high`, and API-equivalent subscription cost.
Those fields cannot be flattened into "verified" or "amount paid".

OpenRouter's exact interactive voxel page has not been located. Do not invent
an endpoint or promise a voxel category from the confirmed games evidence.
The games adapter must work against observed HTML artifacts; add voxel
scenarios only after a real source page and payload pass the same contract.

### Scope split and dependency gates

- **013A — Pelican-first (this implementation contract).** Pelican manifest,
  results, artifacts, prompt and thumbnails; showcase schema/store; exact
  matching; viewer; gallery; model panel; admin review. It is independently
  useful and does not require an OpenRouter fixture.
- **013B — OpenRouter artifacts (implemented 2026-11-06).** The observed
  self-contained HTML document, strict offline CSP validation, operator-supplied
  record, source registration and rights path are implemented. No live-page
  scrape is used; a pinned fixture exercises the adapter.
- **Dependency order:** FID-2026-1104-006 bounded transport →
  FID-2026-1104-009 Playwright runner → 013A/013B. Both prerequisites are closed
  (006, and 009 at `0052734`); both tracks are implemented. FID-2026-1104-008's
  gate-contract work is a coordination input, not a product gate: 013A adds one
  line to `VERIFY_GATES` and 008 must preserve it when it unifies the lists.
- **No duplicate harness:** 013A's browser journeys extend
  `scripts/browser-matrix.mjs` from 009. Do not add a second
  `scripts/visual-builds-browser.mjs`.
- **SCOPE mapping:** the FID covers SCOPE.md VB1–VB5; VB4 remains
  operator-blocked and VB5 records this convergence review. This correction removes the unreproducible 12/12 and 15/15
  evidence claims from the planning receipt.
- **Register correction:** the earlier "14 active FIDs" and "15/20" claims are
  withdrawn. The register had 13 active rows and no 013; after this correction
  it has 14. The planning receipt's 12/12 and 15/15 scores are self-audits, not
  independently reproducible evidence.

Primary references:

- [Pelican repository](https://github.com/AzatJalilov/PelicanSdf)
- [Pelican manifest](https://github.com/AzatJalilov/PelicanSdf/blob/63190d7e5fb883175b8612374de5e7f094293548/data/manifest.json)
- [Pelican license](https://github.com/AzatJalilov/PelicanSdf/blob/63190d7e5fb883175b8612374de5e7f094293548/LICENSE)
- [OpenRouter games](https://openrouter.ai/benchmarks/media/games)
- [OpenRouter benchmarks API](https://openrouter.ai/docs/api/api-reference/benchmarks/list-benchmarks)
- [OpenRouter Data API license scope](https://openrouter.ai/docs/cookbook/administration/data-api)
- [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)
- [esbuild plugins](https://esbuild.github.io/plugins/)

Context7 resolved `/evanw/esbuild` and queried in-memory browser bundling with
virtual `onResolve`/`onLoad` modules. The packager parses source without running
it; `write: false` returns output bytes. Source plugins/configuration are never
loaded. No package is installed by this planning pass.

## Impact Assessment

### Affected Components

Existing integration points: model detail and public navigation, admin shell,
`lib/benchmarks.ts`, schema registration in `lib/storage/schema/index.ts`,
transport from FID-006, `lib/storage/backup.ts` and
`scripts/db-recovery-drill.mjs` (durability prerequisite), and existing guards.
New bounded domain under `lib/visual-builds/`, schema/store modules, showcase
components, public reads and protected admin routes. Planned paths are new
implementation targets, not claims that those files already exist.

### Risk Level

- [x] Medium: absent product capability; wrong identity links can mislead buyers.
- Executable source, redirects, mutable assets and unbounded imports create
  material security/reliability risks unless the following contracts hold.

## Proposed Solution

### Approach

#### 1. Sources and reuse

013A implements `pelican_sdf`; 013B adds `openrouter_artifacts`. Additive
records live in a `showcase`
namespace on the existing database, separate from money and article ingestion.
This feature does not depend on `CONTENT_ENABLED`. Use
`VISUAL_BUILDS_ENABLED=true` as an explicit public-surface switch; unset/false
hides public navigation, panels, routes and bundle reads. The flag is parsed at
the server boundary against an explicit true/false/1/0/yes/no/on/off set and
fails closed to disabled on anything else; it is documented in `.env.example`
and the operator docs and covered by a unit case. `validateProductionConfig`
validates required origin, database and admin settings, not optional feature
flags, so this record does not claim a config-check inventory line. No
client-only gating is accepted. Admin review remains available; importing is an
authenticated explicit action.

Pelican reads only published manifest entries at a pinned commit, then their
result and artifact paths. It reads the separate `benchmark/prompt.txt`, verifies
its SHA-256 against the result's `promptSha256`, and stores the prompt bytes.
It derives a thumbnail under `assets/thumbnails/`, verifies JPEG magic and size,
computes the hash, and records absence honestly for failed runs. Never scan
drafts, raw transcripts or private metadata. Verify advertised artifact hashes;
save the entire approved license notice with the snapshot. A manifest entry is
not a quality endorsement.

013B accepts an operator-selected, observed OpenRouter game record and fetches
only its exact `model-assets.openrouter.ai` document and thumbnail. Never `eval`
page scripts or regex arbitrary script bodies into executable code. The record
is validated against a strict schema and stable source identity; a changed
payload fails visibly without replacing good records. The document must already
be self-contained, declare `default-src 'none'` and `connect-src 'none'`, and
contain no remote asset reference or forbidden element. The pinned fixture
records the exact HTML, document URL, prompt and license hashes.

Rights are an explicit append-only record keyed to a source or revision:
`pending`, `approved`, `withdrawn`, with evidence URL/text/hash, allowed
display/cache/redistribution modes, attribution, reviewer and review time. The
console has one shared admin credential and `getAdminSession()` returns a
boolean, so `reviewer` records the fixed `operator` principal plus `reviewed_at`
and a nullable note; it is an audit attribution, not a verified individual
identity. A named-operator identity is a separate change.
Store Pelican's MIT notice, the artifact contributor's grant, and the upstream
model provider's terms as separate evidence classes. The Data API's CC BY scope
must not be assumed to license separate HTML/assets. An OpenRouter record may be
imported for review after the operator supplies its exact record, prompt and
license. The operator approval is recorded as a rights row; a source link is
not a substitute interactive build.

#### 2. Durable records and revision rules

Use these logical tables, with additive idempotent schema registration:

- `showcase.sources`: fixed source kinds (`pelican_sdf`, `openrouter_artifacts`),
  configured commit/scenario pages, enabled
  state, allowed origins/paths and source-level rights references.
- `showcase.rights`: append-only subject (`source` or `revision`), state,
  evidence URL/text/hash, allowed display/cache/redistribution modes,
  attribution, reviewer, reviewed-at and superseded-by pointer. Reviews and
  public reads bind to the current rights row; recheck is local, never a live
  upstream fetch.
- `showcase.import_runs`: source, status, owner/fencing token, expiring lease,
  cursor, counts, deadline, safe errors, start/finish and source revision.
- `showcase.builds`: stable public id and unique `(source_id, external_id)`,
  current published revision pointer, visibility, source URL and withdrawal note.
- `showcase.revisions`: immutable normalized metadata, original model id/label,
  creator/provider as distinct fields, task/prompt/hash, run/effort/harness,
  source timestamps, fetched-at, raw-record hash, source validation, nullable
  cost/time with units and measurement method, asset and license hashes.
- `showcase.assets`: SHA-256 addressed BYTEA bundles/preview bytes, MIME,
  byte size, packager version and dependency manifest. Never executable SQL.
- `showcase.model_bindings`: revision, exact catalog `model_id`, accepted or
  rejected state, match method, evidence, reviewer and the catalog identity
  digest snapshot defined below.
- `showcase.aliases`: source-scoped original identity to exact catalog identity,
  creator/version qualifiers, reviewer and durable rejection/override history.
- `showcase.reviews`: append-only operator decisions and viewer receipts bound
  to revision, bundle/dependency/license hashes, the current rights-row hash and
  the accepted binding-set hash.

Catalog identity digest: canonical JSON with sorted keys over `model_id`, public
slug/id, family, upstream provider identity, display name, visibility and
delisted state. Exclude price, description, marketing copy and timestamps that
do not change identity. A digest mismatch blocks publication; a benign price
change does not.

Catalog bindings reference real `models.id` rows. Catalog deletion removes the
binding, not source provenance. Public reads intersect bindings with the same
current catalog visibility used by model detail; disabled/delisted/hidden rows
cannot leak through a stale alias. Free, paid and subscription offerings stay
separate links; they can share a build only when each identity is proven exact.
Recheck the stored current rights state at every public read and bundle request;
never fetch upstream terms during a page render. Source disable, withdrawal or
an accepted binding change removes affected publication atomically; new review
is required. Receipt hashes cannot authorize changed asset bytes.
Compare the live catalog identity digest to the reviewed binding snapshot; a
reused id cannot inherit a different model's examples. All public bundle/preview
and source-byte reads require an eligible published revision, use no-store,
and never expose an unreviewed hash-addressed asset directly. Raw source
downloads additionally require redistribution rights. Already downloaded bytes
cannot be recalled; withdrawal denies subsequent reads, not prior copies.

Metadata re-fetches deduplicate by source id and content hashes. A changed
artifact, model/configuration, license, prompt or dependency hash creates a new
draft revision; it cannot silently mutate the reviewed public result. Manual
matches, rejections and withdrawal decisions survive every import. Source
deletion is disabled; disable/withdraw preserves provenance and audit records.
Revision digests exclude fetched-at, lease/cursor and other volatile transport
fields. An unchanged re-import changes observation metadata, not the revision.
Publishing locks the relevant source/build/review state and checks the client's
expected revision/binding hashes in the same transaction; a stale action is 409.

#### 3. Precise model matching

Extend `normalizeModelKey` with an explicit `preserveFreePrefix` option for
strict artifact matching; its default keeps all current callers unchanged.
Reuse it for spelling only. Do not call `canonicalModelKey`,
`withoutBuildDate`, fuzzy matching or the article-mention matcher to accept a
build identity. Existing routing, benchmark and article behavior must not change.

Match ladder: an explicit accepted operator mapping; otherwise exact full
source id against an upstream/public id; otherwise an approved source-scoped
alias with creator and version evidence. A normalized full display-name match
is a review suggestion only. No automatic vendor-prefix removal, family-only
matching, build-date stripping, `latest` expansion or substring matching.
Conflicting exact identities or multiple distinct versions are `ambiguous`.
An exact string with conflicting creator/version evidence is also refused;
an operator mapping records a reason and cannot bypass a known contradiction.
Pelican's run id (`gpt-6-1-sol-high-run-01`) is not the model id. Match the
result's recorded model/provider fields plus effort and harness; never parse the
run id into a model claim. An exact run-id string is not an exact model id.

Persist outcome `exact`, `alias`, `ambiguous` or `unmatched`, candidate ids and
reason. An accepted identity maps the model; effort/harness/run remain separate
artifact facets and visible labels. Missing settings remain unstated. Matching
does not prove our serving route reproduces a source's runtime or settings.

Public results require a reviewed identity and an active catalog binding.
Unmatched records remain in admin review and rematch after catalog changes;
they are not assigned to a neighboring generation to inflate coverage.

#### 4. Bounded import and artifact packaging

Hard dependency gate: FID-2026-1104-006's byte-bounded transport and durable
ownership must be implemented and its tests green before 013A code starts.
Verify the code on disk, never copy the current buffer-then-check fetcher. If
006 is unimplemented, 013A stays `blocked`; a design note is not permission to
ship an unsafe importer. FID-009's browser runner is the second hard gate for
the browser receipt.

HTTPS, no credentials, fixed source origin/path allowlists, no private/reserved
resolved addresses, connection destination pinning, and validation of every
redirect/dependency. No arbitrary URL parameter in a public proxy. A URL found
in a source document is still untrusted. Strip URL credentials and secret query
values from safe errors. Never forward Savant credentials/cookies upstream.

Defaults: 2 MiB metadata/page, 2 MiB complete artifact bundle, 256 KiB preview,
8 dependencies per request (64 per cycle) and 256 MiB total unique stored bytes;
count decoded bytes while streaming and before allocation. Enforce total storage
quota atomically across concurrent imports, including unpublished revisions. A
quota refusal does not evict published data. Admin purges unreferenced assets
explicitly. The bundle reader returns at most 3 MiB serialized JSON, including
base64 expansion; it does not return original source plus the packaged copy
together. Bound JSON nesting to 32, ids/labels to 300 characters, URLs to 2,048
and prompts to 120,000; reject malformed dates, nonfinite/negative measurements
and unknown execution formats. Missing metrics stay null. Store observed-at
separately from source generation time and label source status without inventing
freshness. Dependency versions and their license notices belong to the bundle.

One source lease across instances, reusing the row-lock, expired-lease-delete
and fencing pattern proven in `lib/storage/admission.ts` (FID-2026-1104-004)
rather than adding a second generic lease helper; 45-second request deadline
under a 60-second route budget; at most 12 metadata records and one packaged
artifact per request;
the 50-record and 64-dependency figures are cycle caps, not per-request promises.
Four simultaneous network reads, 15-second individual fetch deadlines. At the
worst case 12 records / 4 × 15s = 45s; 8 dependencies / 4 × 15s = 30s. Stop at
the deadline, persist the cursor and continue with a new explicit admin request;
a partial request never publishes. No detached promises or new scheduler.
Expired ownership cannot advance a cursor or publish over a newer owner. A
partial cycle never marks missing builds gone.

Package Pelican's exported canvas module using a trusted thin-canvas wrapper and
a blob-module import; it is already a self-contained ES module, so esbuild is
not required for 013A. Package 013B's HTML and approved static dependencies into
a complete offline document only after a parser/rewrite contract and fixture
exist. If 013B needs esbuild, pin it, use in-memory virtual modules, and allow no
source-supplied plugin/config file or filesystem resolver. Do not execute
imported JavaScript on the server or during packaging.
Retain original bytes/hash separately from wrapper/dependency hashes; packaging
must not repair or improve a model's generated scene. Unsupported dynamic
resources are an explicit incompatible result requiring review.

#### 5. Execution boundary

Parent application renders only trusted showcase components and plain source
text. Never import a generated module into Next/React, use server evaluation,
or insert source HTML into the parent's DOM. Bundle endpoints serve JSON, with
`nosniff`; raw source downloads are attachments, never same-origin HTML pages.

Use an opaque-origin iframe via `srcDoc`, `sandbox="allow-scripts"`, and
`referrerPolicy="no-referrer"`. No `allow-same-origin`, forms, popups, downloads
or top navigation. The trusted wrapper starts with a CSP meta element before
any untrusted content: default/connect/frame/object/base/form sources denied;
scripts limited to packaged inline/blob code, images/styles to packaged data;
workers and nested frames denied. Use `default-src 'none'; connect-src 'none';
frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';
worker-src 'none'; script-src 'unsafe-inline' blob:;
style-src 'unsafe-inline' blob:; img-src data: blob:; font-src data: blob:`.
The style and font sources match the `text/css` and `font/woff2` asset
allowlist; without them those packaged assets are refused by `default-src`.
Trusted serialization prevents source strings closing a wrapper script;
prohibit eval/WASM/remote imports. All dependencies are in the approved bundle,
not arbitrary live CDN scripts.
The application keeps its global `X-Frame-Options: DENY`; `srcDoc` avoids a
same-origin HTML route exception. Direct bundle requests return JSON only.
Assets use an explicit allowlist: `application/javascript`, `text/html`,
`image/png`, `image/jpeg`, `image/webp`, `text/css` and `font/woff2`; reject
`image/svg+xml`, `text/xml` and unknown types by default. The gallery budget is
1 MiB of preview bytes per page with lazy loading; a 256 KiB per-asset cap is not
a page cap. Public bundle/preview reads are rate-limited by client and route through the
existing `createRateLimiter` factory in `lib/admin-rate-limit.ts`;
`no-store` is not an abuse control. That limiter is process-local, so the
record claims a bounded per-process read rate, not cross-instance abuse
control, and adds no second limiter.

Any wrapper messages require `event.source === iframe.contentWindow`, a
per-mount nonce, a small allowlisted schema and bounded length. An opaque
origin reports `null`; accepting that string alone is never authentication.
Messages cannot ask the parent to fetch a URL, run code or call admin APIs.

Do not describe iframe/CSP as an OS sandbox or a complete network firewall.
The frame can still navigate itself to a remote URL; sandbox blocks top
navigation, not every self-navigation. Reset the frame on navigation, keep the
opaque origin, and record the residual egress limitation honestly.
Browser/GPU resource abuse requires an adversarial browser receipt and reviewed
assets; source code receives no account data. Teardown removes the frame,
listeners and object URLs. Only one viewer is live; switching or closing
destroys the previous instance. Pause by unmounting when hidden. A 10-second
"still loading" state and a 30-second failure state are UI recovery, not a hard
CPU execution deadline; a valid Pelican sample measured 16.4s init, so 8s would
false-fail.

#### 6. Product and operator surfaces

`/showcase` shows 24 static preview cards per page within the 1 MiB preview
budget, source/model/task filters, stable id tie-break sorting and shareable
query state. Interactive execution
starts on explicit Open build; no grid of running WebGL contexts. Detail names
the original prompt, model/version, effort, method, source/date, attribution,
nullable cost/time and its meaning. Missing thumbnails use an honest text card,
not a synthetic image attributed to the source.

Model detail adds a six-item visual examples panel and View all link using
exact current catalog ids, while preserving existing price/identity/coverage.
Order examples by published-at descending, then effort order, then run id; a
model can have multiple effort runs. Extract the panel into its own component so
the 400-line page ceiling is not put at risk.
Public navigation adds Showcase behind the explicit feature switch. Database
or viewer failures show local unavailable/error states without breaking the
rest of the model page. No combined Elo, vote system or claim that mismatched
source prompts form a controlled benchmark. Existing `/compare` stays a
numeric/catalog comparison; a visual ranking is not implied there.

`/admin/showcase` and `/api/admin/showcase/*` use existing admin/session/origin
guards, bounded request parsing and no-store responses. Actions: configure the
two sources; import/continue; inspect source bytes, identity suggestions, rights
and packaging result; accept/reject aliases; preview; publish/withdraw a
specific revision; disable a source; purge unreferenced assets. Publication is
an explicit operator action requiring rights, identity and viewer evidence.
Render/source errors and leases are visible; secrets and raw private records
never appear. Stable revisions make rollback a pointer change, not re-ingestion.

### Steps

The operator authorized 013A on 2026-11-05 and 013B on 2026-11-06, and the
006/009 gates are closed. Steps 1–8 below are implemented and verified; the
original sequencing text is retained for history.

1. Verify FID-006's bounded transport and FID-009's browser runner on disk; if
   either is absent, stop and keep 013A blocked. Pin Pelican fixtures, prompt,
   license and thumbnails; record rights.
2. Add 013A domain validation, `showcase` schema (including `showcase.rights`),
   bounded records and durable import ownership.
3. Implement the Pelican adapter, immutable assets/revisions, prompt/thumbnail
   verification and the thin-wrapper packager; do not add esbuild.
4. Add exact matching, source aliases, durable refusals and catalog
   reconciliation with the defined identity digest.
5. Wire guarded admin review, previews and revision-specific publication.
6. Wire isolated execution, public gallery/detail and exact model panels.
7. Run regressions for Pelican and the OpenRouter fixture, including the
   offline HTML packager and both source kinds.
8. Re-run full gates, document operation/rollback, commit verified code, then
   close 013A and 013B with CHANGELOG and implementation evidence.

### Verification

Implemented test artifacts (2026-11-06). Both Pelican and OpenRouter paths are
covered; the OpenRouter fixture exercises the observed self-contained HTML
format.

- `tests/visual-builds-sources.test.mjs`: published-manifest-only Pelican
  reads, prompt and thumbnail hash verification, unknown/null metrics,
  duplicate ids, removed-source refusal and network-adapter no-write behavior.
- `tests/visual-builds-openrouter.test.mjs`: pinned HTML artifact, prompt and
  license hashes, offline-CSP/remote-asset/forbidden-element refusal, duplicate
  manifest ids and unauthorized asset hosts.
- `tests/visual-builds-matching.test.mjs`: exact ids, namespace/date/version
  collisions, reviewed aliases, ambiguous names, run-id-vs-model-id cases,
  separate effort runs, rejection persistence and free/paid/catalog-visibility
  behavior.
- `tests/visual-builds-store.test.mjs`: fresh migration, atomic unique-byte
  quota, stable public ids, revision reuse, rights withdrawal/restoration,
  catalog-digest mismatch and preserved decisions. It is registered in
  `scripts/postgres-concurrency-proof.mjs` and adds a real two-connection
  publish race: exactly one publish commits and exactly one review row exists.
- `tests/visual-builds-packaging.test.mjs`: the Pelican thin-wrapper output,
  CSP policy, closing-script escaping, hash separation and bundle ETag.
- `tests/visual-builds-publication.test.mjs`: the fail-closed
  `VISUAL_BUILDS_ENABLED` parser and the all-three-uses rights gate.

Production HTTP cases extend `scripts/http-suite/showcase-checks.mjs`,
called by the existing HTTP suite after build and before `runDegradeChecks`
(which drops `settings`). Seed and clean up the showcase fixture explicitly so
the checks are repeatable. Browser journeys extend `scripts/browser-matrix.mjs`
from FID-009, not a second runner: Pelican artifacts, keyboard/touch, both
themes, 320/1024/1440 widths, frame teardown and hostile artifacts. The
showcase-only command is `test:visual-builds-browser`, wired through
`VERIFY_GATES` between `build` and `test:http` and declared in
`protocol.config.yaml`. Playwright 1.55.0 and its bundled Chromium are
installed; the gate fails rather than skips when no browser is available.

Browser probes attempt parent DOM/cookie/storage reads, parent API calls,
forms/popups/top navigation, self-navigation, spoofed messages, dependency
exfiltration and direct source opening. The receipt proves parent origin
isolation, blocked outbound fetches and admin API access, actual WebGL pixels,
keyboard/touch/pointer delivery, both themes, three widths and frame teardown.
It does not claim that a prior downloaded copy can be recalled.

Data and recovery wiring: `tests/visual-builds-store.test.mjs` is registered in
`scripts/postgres-concurrency-proof.mjs`. The recovery drill seeds
`showcase.sources`, `showcase.assets`, `showcase.builds` and
`showcase.revisions`, then compares the restored artifact bytes, hash and
publication pointer. The dump/restore path now carries an explicit `$bytea`
base64 envelope; before this, `showcase.assets` was the first BYTEA column and
restore handed an object to the driver.

**Durability prerequisite (discovered and implemented 2026-11-04).**
The earlier dump enumerated only `table_schema = current_schema()` (public),
wrote bare table names and read `SELECT * FROM "table"`; the existing
`content` and `identity` schemas were already omitted. SCOPE VB6 replaced that
with dump format `savant-gateway-pg-dump/2`: every non-system base table is
enumerated, catalog foreign keys determine insert order, manifest entries and
row files carry schema-qualified names, and restore uses qualified
select/truncate/insert. Legacy `/1` dumps still restore as `public`. The
recovery drill now asserts `content.sources` and `identity.protocols`; a future
`showcase` schema is covered by the same enumeration and its
`showcase.assets`/`showcase.revisions` assertions belong to the 013A
implementation. The prerequisite is verified (5/5 recovery tests, drill PASS)
and no longer blocks 013A; FID-006 and FID-009 still do.

RED acceptance: each incorrect identity, unsafe execution/publication or
partial-import case fails against a deliberately broken fixture. GREEN must
pass those refusals and render one representative Pelican artifact from lawful
fixtures. 013B cannot claim GREEN until its lawful fixture and rights exist.
Actual source publication additionally requires a real permitted build per
selected source; fixture proofs do not establish permission. Per the 2026-10-16
closure ruling, missing external publication evidence moves to
`dev/tracking/internal-followups.json` at implementation closure with its
specific blocker. It cannot be called live acceptance or silently discarded.

Planned production reachability (verify after wiring, not claimed now):
schema index -> showcase schema; admin route -> import -> adapter/transport ->
revision store/matcher; publish -> transactional revision gates; public pages
and model detail -> published reader -> current-catalog intersection; Open build
-> trusted viewer -> JSON bundle -> isolated frame. Every new config/helper
requires a production caller and the HTTP/browser receipt.

### YAGNI

One adapter in 013A, one artifact domain, one viewer shell, existing
database/guards. 013B is a separately gated adapter and is not part of 013A's
delivery. No GLB renderer after the source removal, new object-storage vendor,
paid generation, self-service uploads, source voting, blended score or new
billing. Pelican's thin wrapper needs no bundler; esbuild is reserved for 013B
when its fixture and parser exist. Do not add a general remote build service or
expand the article taxonomy for executable scenes.

## Verification Gates

Planning checks: FID metadata/template/section audit, active-ID uniqueness,
SCOPE registration, reference resolution, measured document deltas,
`git diff --check`, `npm run attribution`, and current-tree static checks.
Any concurrent-work failure is recorded with its real output and owner record.

Implementation gates (future; not a receipt of implemented behavior):

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: config_check — `npm run config:check`; document
  `VISUAL_BUILDS_ENABLED` in `.env.example` and the operator docs. The flag is
  parsed and fail-closed at the server boundary; `validateProductionConfig`
  does not inventory optional feature flags.
- gate: test tests/visual-builds-sources.test.mjs
- gate: test tests/visual-builds-openrouter.test.mjs
- gate: test tests/visual-builds-matching.test.mjs
- gate: test tests/visual-builds-store.test.mjs
- gate: test tests/visual-builds-packaging.test.mjs
- gate: test tests/visual-builds-publication.test.mjs
- gate: test tests/verify-summary.test.mjs — regress new after-build gate ordering.
- gate: test — `npm test` includes all six feature test paths.
- gate: quality — `npm run quality`, 400-line production-file ceiling.
- gate: build — `npm run build`.
- gate: test_http — `npm run test:http` includes the wired showcase HTTP module.
- gate: test_visual_builds_browser — extend `scripts/browser-matrix.mjs` from
  FID-009; wire it through `VERIFY_GATES` in `scripts/verify-summary.mjs` after
  `build`; pin Playwright and install the browser in the chosen CI/pre-push path.
- gate: test_postgres — `npm run test:postgres` includes
  `tests/visual-builds-store.test.mjs` in `TEST_FILES`.
- gate: test_recovery — `npm run test:recovery` restores `showcase.assets` and
  `showcase.revisions` bytes and compares hashes, after the dump/restore path
  enumerates the application schemas and schema-qualifies table names.
- gate: verify — `npm run verify:supabase` on this Docker-less host, with real
  output and log receipt.

### Verification Receipt

2026-11-04 correction pass: the earlier 12/12, 15/15, 11/11 and 15/20 claims
are withdrawn. The register held 13 active rows and no 013; after this pass it
holds 14, including 013. No feature test path exists yet; the five planned
suites remain implementation gates. This correction edits design records only:
`npm run attribution` and `git diff --check` are rerun after the edits; no code
gate is claimed. The historical planning commands remain in
`dev/session-summaries/2026-11-04-visual-builds-design.md` with a correction
banner; they are not a receipt for this contract.

2026-11-04 convergence review: the independent re-review and two convergence
passes are complete. Seven substantive design corrections are recorded in Loop
5; Loop 6 found no remaining actionable correction. This review edits design
records only; `npm run attribution`, `git diff --check` and the focused
matching/SKU suites (34/34) are rerun after the edits; no code or feature gate
is claimed.

| Correction | State | Evidence |
| --- | --- | --- |
| 013 registration and active-count reconciliation | applied | `dev/fids/README.md`; 14 active rows including 013 |
| Pelican-first / OpenRouter 013B split | applied | Scope split; 013B fixture and rights gate |
| FID-006 and FID-009 implementation gates | recorded, blocked | Dependency order; Step 1; no code |
| Pelican prompt and thumbnail contract | applied | `benchmark/prompt.txt`; `assets/thumbnails/`; hash rules |
| Eight-second watchdog replaced | applied | 10s loading / 30s failure |
| Feasible request budget | applied | 12 metadata / 8 dependencies at 45s |
| Catalog identity digest and rights table | applied | `showcase.rights`; digest fields in section 2 |
| Pelican wrapper vs OpenRouter parser/esbuild | applied | 013A thin wrapper; 013B gated |
| Preview budget, MIME, rate limit, self-navigation wording | applied | Execution boundary section 5 |
| `test:postgres` and recovery wiring | blocked | Store test and schema absent; `dev/tracking/internal-followups.json` item |
| Loop order and receipt | applied | Loop 4 before correction/final passes; this table |
| 2026-11-04 convergence review | applied | Loop 5; seven corrections; Loops 5-6 recorded |
| Durability prerequisite | resolved | SCOPE VB6: format `/2`, schema-qualified dump/restore, 5/5 recovery tests, drill PASS |
| Status finalization | applied | `converged`; implementation blocked on 006/009; VB6 resolved |
| Review deltas | measured | corrections A 3.82%; review B 8.90% after trim (draft 10.52%); cumulative 13.06% across two bounded passes |
| 2026-11-05 operator authorization | applied | 013A authorized; FID-009 closed at `0052734`; no code written |

## Perfection Loop

### Loop 1 — RED

- **RED:** no artifact domain; unsafe identity reuse; no isolated execution;
  source permissions and the exact OpenRouter voxel page remain unconfirmed.
- **GREEN:** the design specifies immutable source revisions, conservative
  identity binding, explicit rights/publication gates and isolated offline builds.
- **AUDIT:** repository/source evidence above; planned call graph and test
  contracts cover 013A and the gated 013B contract. No application implementation
  claimed.
- **ADVERSARIAL:** evaluate mutable source assets, forced alias collisions,
  hostile code, source outages and concurrent review/import before convergence.
- **CHANGE DELTA:** initial document; correction passes measured separately.

### Missed Questions

1. Does an article mention prove build authorship? No; exact source identity
   and a reviewed binding are required.
2. Can billing variants share examples? Only as separate proven catalog links;
   no date/version stripping or serving-quality guarantee follows.
3. Does public access establish artifact reuse? No; preserve rights evidence
   and require explicit revision publication.
4. Is OpenRouter's voxel endpoint known? No; the implemented games lane accepts
   observed self-contained HTML records. Voxel support still requires real
   payload evidence.
5. Does source validation mean measured quality? No; keep source status,
   validation, measurement environment and local rendering checks distinct.
6. Can model-generated code execute on the server? Never; packaging parses
   bytes and the browser receives an opaque-origin isolated document.
7. Does removing SCAD leave GLB work? No; the operator removed that source,
   so this implementation contains no GLB-specific pipeline.
8. Must a source outage trigger a live fetch during a page render? No; all
   public reads use stored approved snapshots and local bounded queries.
9. Does the result JSON carry the prompt and thumbnail? No; the prompt is
   `benchmark/prompt.txt` and thumbnails follow an `assets/thumbnails/`
   convention. Verify both at import and allow an absent thumbnail.
10. Can 013A start while 006/009 are unimplemented? No; the bounded transport
   and browser harness are hard gates, not optional citations.

### Implementation Evidence (REQUIRED for `closed`)

- [x] 013A repository code, schema and pinned fixture landed 2026-11-06 in
  commit `a73960f`; the OpenRouter lane is implemented in this follow-up.
- [x] Steps 1–6 implemented: fixture/rights records, `showcase` schema and
  stores, Pelican and OpenRouter adapters, strict matching, admin review,
  public gallery/detail/viewer and the model-page panel.
- [x] Unit/HTTP/build/quality evidence recorded below.
- [x] Step 7 browser journeys: `npm run test:visual-builds-browser` PASS, 4/4
  journeys on bundled Chromium across both themes and 320/1024/1440 widths,
  with WebGL pixels, keyboard/touch/pointer delivery, hostile-origin probes and
  frame teardown.
- [x] Step 8 closure evidence: five suites, mandatory PostgreSQL proof, recovery
  assertions and the browser gate are wired and pass.
- [x] Five design-named suites exist: sources, matching, store, packaging and
  publication. Focused `npm test` run: 16 pass, 1 expected PostgreSQL skip;
  `test:postgres` runs the store suite with 5/5 and zero skips.
- [x] `tests/visual-builds-store.test.mjs` is registered in the mandatory
  `scripts/postgres-concurrency-proof.mjs` `TEST_FILES`; the two-connection
  publish race passes.
- [x] Recovery drill seeds and compares `showcase.assets` and
  `showcase.revisions`; 15/15 checks pass.
- [x] The operator approved the MIT-licensed source use on 2026-11-06 and
  accepted publication responsibility. The rights path records the operator
  decision; no separate external-rights blocker remains.
- [x] 013B implemented: `openrouter_artifacts` source kind, strict record and
  HTML validation, operator-supplied record import, pinned fixture and tests.
  The document must be self-contained and declares `default-src 'none'` plus
  `connect-src 'none'`; remote assets, iframes, objects, embeds, bases and forms
  are refused. The admin review page provides source registration, the rights
  decision and the record/prompt/license import form.
- [x] 013B verification: `npm run verify` PASS with 1,123/1,123 tests; the
  OpenRouter fixture suite passes 4/4 and the mandatory PostgreSQL gate 20/20.

### Implementation Record (2026-11-06)

Implementation commits `a73960f` (013A), `4009b21` (013A browser/durability
evidence) and `de4dfbc` (013B OpenRouter lane, `/3` backup and gate hardening).

| Area | Implemented behavior |
| --- | --- |
| Schema | Isolated `showcase` schema for sources, append-only rights, import leases, assets, builds, immutable revisions, bindings, aliases and reviews. |
| Pelican source | Pinned commit fixture, manifest/result/prompt/thumbnail/license hash verification, bounded transport and no drafts scan. |
| OpenRouter source | Operator-supplied observed record, exact prompt/license hashes, self-contained offline HTML validation and an approved `model-assets.openrouter.ai` document/thumbnail pair. The committed fixture is `tests/fixtures/openrouter/`. |
| Matching | Exact id and reviewed alias binding, name-only suggestions, ambiguous refusal and live catalog identity digest. |
| Packaging | Thin CSP-bound `srcDoc` wrapper with no server execution; original and packaged hashes stay distinct. |
| Public surface | Flag-gated `/showcase`, detail viewer, JSON bundle, JPEG preview and a model-page examples panel. Every read rechecks source enablement, current rights, accepted binding, active catalog identity and published state. |
| Admin surface | Guarded `/admin/showcase` review page and API for sources, rights, import, bindings, publish and withdraw. The page registers Pelican and OpenRouter sources, records either decision and imports either record; withdrawal and catalog changes invalidate public reads immediately. |
| Fixture | `tests/fixtures/pelican/` retains the manifest, prompt, result, artifact, 480×270 JPEG, MIT text, hashes and provenance caveat. |
| Browser | Showcase-only Playwright Chromium journeys: real WebGL pixels, three widths, both themes, keyboard/touch/pointer, opaque-origin isolation and teardown. |
| Durability | Real two-connection publish race, mandatory `TEST_FILES` registration, BYTEA dump/restore envelope and restored showcase asset/revision assertions. |

Verification receipt: `npm run verify` PASS on 2026-11-06 — 12/12 gates,
1,123/1,123 tests with zero skips, browser 4/4 journeys on bundled Chromium,
758 main HTTP checks plus the trial suite, recovery 15/15, quality 687 files
under the 400-line ceiling, build PASS and 177.7 s. The mandatory PostgreSQL
gate passed 20/20, including the showcase store 5/5 and its two-connection
publish race. `npm run check` (lint and typecheck) exits 0 with zero warnings.

The HTTP gate exercises the public gallery, detail page, bundle, preview, admin
401, review API, repeated publish refusal, rights withdrawal and restoration,
and catalog rename refusal and restoration. The separate browser gate now
executes the artifact and hostile fixture.

### Code Verification Evidence

- [x] Existing integration points were inspected and production callers wired.
- [x] Source adapter, viewer, schema, stores, routes and admin surfaces exist.
- [x] Lint, typecheck, quality, build, unit, HTTP, PostgreSQL and recovery gates
  pass as recorded above.
- [x] Implementation matches every declared gate. The operator approved the
  MIT-licensed source use; no external source-rights blocker remains.

### Loop 2 — Independent audit and self-correction

- **RED:** contract probe: 2/8 PASS; normalizer prefix loss, read-time rights,
  approval/hash binding, volatile digest, response budget and gate ordering gaps.
- **GREEN:** strict prefix option, read-time withdrawal, immutable review receipts,
  stable revision digests and serialized-byte ceiling added. Gate ordering is
  addressed in the next bounded correction pass.
- **AUDIT:** `lib/benchmarks.ts:108` includes `.replace(/^free\\//, "")`;
  `package.json` runs `node --test "tests/*.test.mjs"` for the unit gate.
- **ADVERSARIAL:** a stored public pointer alone must not survive a rights
  withdrawal or changed model binding; a receipt names exact content hashes.
- **CHANGE DELTA:** measured against the initial document in the planning receipt.

### Loop 3 — Harness and execution audit

- **RED:** unit gates precede build; browser/production cases cannot rely on
  `.next` in `npm test`. CSP wording lacked inline styles and serialization.
- **GREEN:** five unit suites plus after-build HTTP/browser gates; concrete
  offline CSP; contradicting identities refused; external acceptance separated
  from implementation closure under the existing recorded ruling.
- **AUDIT:** `package.json` unit glob and `scripts/verify.mjs` gate order are
  checked separately from the test-path coverage matrix before final review.
- **ADVERSARIAL:** no runtime source execution in the main origin, no false
  success from frame load, and no permission inferred from fixture rendering.
- **CHANGE DELTA:** measured against Loop 2 in the planning receipt.

### Loop 4 — Public read and concurrency challenge

- **RED:** a preview/hash URL or cached bundle could bypass withdrawal; catalog
  id reuse and stale publication actions need stronger identity checks.
- **GREEN:** all asset reads check live eligibility with no-store; catalog
  identity digests and transactional expected hashes fence stale publication.
  Metadata bounds, dependency notices and the verify-order regression are explicit.
- **AUDIT:** all five planned unit paths have gate lines; 013 is registered, and
  the corrected active count is 14/20. Existing matching suites: 34/34.
- **ADVERSARIAL:** a prior downloaded copy cannot be recalled; withdrawal makes
  subsequent reads fail. No claim of retroactive revocation is made.
- **CHANGE DELTA:** measured against Loop 3 in the planning receipt.

### Correction pass — 2026-11-04 design review

- **RED:** dependency ordering, OpenRouter evidence, Pelican prompt/thumbnail
  paths, the 8s watchdog, the 45s/50-record math, concurrency/recovery wiring,
  identity digest, rights table, HTML packaging, preview/MIME limits, register
  count and loop order were defective in review.
- **GREEN:** scope split, dependency gates, source-path corrections, 10s/30s
  watchdog, 12-record/8-dependency request caps, `showcase.rights`, digest
  fields, parser/esbuild split, 1 MiB preview budget, explicit MIME/rate limits,
  register row and chronological loop order are added.
- **AUDIT:** source reads confirm `benchmark/prompt.txt` (3,387 bytes),
  `assets/thumbnails/` 480×270 previews and `initMs` 16,411.3; the register now
  has 14 active rows including 013. `scripts/postgres-concurrency-proof.mjs`
  still names only its two existing suite paths; the new path is an
  implementation-time gate, not a fake pass.
- **ADVERSARIAL:** adding a nonexistent test path to `test:postgres` would break
  the mandatory gate; the split therefore records the exact wiring in the FID
  and `dev/tracking/internal-followups.json` instead of claiming it ran.
- **CHANGE DELTA:** measured by the review; this is a correction pass, not a
  no-op convergence pass.

### Loop 5 — Contract, reference and gate audit (2026-11-04)

- **RED:** seven defects survived the correction: reviewer identity had no
  authenticated source; the CSP refused the `text/css`/`font/woff2` bytes its
  MIME allowlist permitted; the browser gate named `protocol.config.yaml`
  instead of `VERIFY_GATES`; the config-check inventory promise exceeded the
  validator; the read limiter had no named authority; the 008-first order
  contradicted the 006/009 gate; and the dump enumerated only `current_schema()`.
- **GREEN:** the fixed `operator` principal, matching `style-src`/`font-src`,
  `VERIFY_GATES` wiring, fail-closed flag parsing, the existing process-local
  `createRateLimiter`, 008 as coordination only, and schema-aware backup
  (SCOPE VB6) are recorded.
- **AUDIT:** cited existing paths resolve; the five unit paths, browser runner
  and HTTP module are absent as planned; six unit gates plus the browser gate
  exist; `tests/verify-summary.test.mjs` covers after-build ordering; active IDs
  are unique; focused matching/SKU suites pass 34/34.
- **ADVERSARIAL:** a gate added only to `package.json` is not run; a CSP that
  permits a MIME type but not its source is a false permission; a dump that
  omits a schema is not a recovery proof.
- **CHANGE DELTA:** design corrections 1,655 bytes on 43,323 (3.82%). The first
  record draft measured 10.52%; redundant prose was trimmed below 10% in the
  same pass.

### Loop 6 — Adversarial walkthrough (2026-11-04)

- **RED:** identity replay, rights withdrawal, stale publication, concurrent
  quota, hostile frame, missing browser and partial import were re-walked.
- **GREEN:** each has an explicit refusal or recovery state: ambiguous identities
  stay refused; withdrawal fails later reads without claiming recall; expected
  hashes make stale publication a 409; quota/lease claims are fenced; the frame
  is opaque and CSP-bound; a missing browser fails; a partial import never
  publishes.
- **AUDIT:** document coverage only, not runtime security or browser receipts.
  The recorded Pelican facts were not re-fetched; the OpenRouter path now uses
  an observed pinned fixture and the operator's recorded approval.
- **ADVERSARIAL:** no remaining actionable design correction. Residual limits
  stay stated: prior copies cannot be recalled, the frame can self-navigate, and
  process-local read limits are not cross-instance abuse control.
- **CHANGE DELTA:** none; the record is part of status finalization below.

### Five Questions

1. All cases: malformed, unsupported, ambiguous and unavailable inputs have
   explicit refusal states; unknown formats never enter an executable path.
2. Concurrent work: durable fenced ownership and an atomic byte quota apply
   across instances; no unmeasured thousand-client capacity claim is made.
3. Hostile input: bounded transport, offline packing, opaque execution and
   adversarial browser evidence protect the account application boundary.
4. Two-year maintenance: versioned snapshots, fixtures and dependency hashes
   make format drift visible and rollback reproducible.
5. Quality standard: preserve provenance and honest evidence; source output,
   rendering success and comparable benchmark scores are distinct claims.

## Resolution

- **State:** 013A and 013B implemented, locally verified and closed 2026-11-06
  under the operator's authorization and source approval. The browser,
  six-suite, mandatory two-connection store, showcase recovery and HTTP gates
  pass. The schema-aware backup prerequisite (SCOPE VB6) is implemented and
  verified; the BYTEA envelope is column-aware and format `/3`. No external
  source-rights blocker remains.
- **Closed Date:** 2026-11-06.
- **Tests Added:** six `tests/visual-builds-*.test.mjs` suites, including the
  OpenRouter fixture; the mandatory PostgreSQL run executes 20/20 overall with
  5/5 store cases and zero skips. Browser gate 4/4; recovery 15/15; showcase
  HTTP checks inside the 758-check main suite.
- **Archived:** `dev/fids/archive/FID-2026-1104-013-model-matched-visual-builds.md`,
  at implementation commit `de4dfbc`. No real source publication, funded
  inference, payment or deployment is claimed.

## Lessons Learned

Source identity, catalog SKU and generation configuration are different facts.
Combining visual examples is useful only while those facts remain inspectable.
Source paths are part of provenance, not assumed metadata: a converged design
that cannot name its prompt/thumbnail inputs is not converged. A register count
is evidence only when the register actually contains the row.
