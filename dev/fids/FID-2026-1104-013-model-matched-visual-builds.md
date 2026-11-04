# FID: Model-matched visual builds from Pelican SDF and OpenRouter

**Filename:** `FID-2026-1104-013-model-matched-visual-builds.md`
**ID:** FID-2026-1104-013
**Severity:** medium
**Status:** converged
**Created:** 2026-11-04 17:15 UTC
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Build one Savant visual showcase from Pelican SDF and OpenRouter artifacts,
with precise links to the existing model catalog. Preserve each source's
prompt, model version, generation configuration, provenance and rights record.
Import immutable snapshots, review them, and display executable examples only
inside an isolated viewer. This session produces the implementation contract
and its Perfection Loop; it does not implement or publish the feature.

## Environment

- Windows / PowerShell; observed Node v24.21.0, npm 12.2.1; Next.js 16.4.3.
- Declared runtime is Node 22.x. Runtime reconciliation belongs to
  FID-2026-1104-008; this record does not certify the observed runtime.
- Grounding HEAD: `b735304411df2d6c07195beae2ca6dec3c5fb4c5`.
- Concurrent admission work is present in the working tree. Only this FID,
  this session's SCOPE section and its planning receipt may be edited here.
- PostgreSQL/PGlite, existing catalog, model-detail and admin authentication.
- Planning authority: "make the fid, run full perfection loop on it then present it".
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
lib/benchmarks.ts:108 normalizeModelKey folds spelling; preserves date tokens
lib/benchmarks.ts:182 matchBenchmarks includes a withoutBuildDate fallback
lib/content/linking.ts:70 modelAliases; :154 suggestModelLinks matches mentions
lib/content/store/links.ts replaceAutoLinks preserves existing operator links
lib/storage/schema/content.ts content.items kind check has no visual-build kind
app/models/[...id]/page.tsx:226 CoveragePanel; :234 IdentityPanel
next.config.mjs:17 X-Frame-Options: DENY applies to /:path*
14 active FIDs before allocation; 013 is unused in active and archive lists
```

Source reads on 2026-11-04, without inference, votes or outbound messages:

| Source | Observed format | Publication evidence / limits |
| --- | --- | --- |
| Pelican SDF | `data/manifest.json`, `data/results/*.json`, `data/artifacts/*.js`; 76 manifest paths | Public repository MIT license; pin a commit and retain its license text. Run records separately expose model, effort, hashes, validation and measurement environment. |
| OpenRouter games | Server-rendered page payload with model, provider, prompt, `documentUrl`, `thumbnailUrl`, `costUsd`, `generationTimeMs` | Prior read extracted 44 HTML document URLs; one returned HTTP 200. These are page artifacts, not a confirmed documented artifact API. Recheck before implementation fixtures are accepted. |

Pelican commit observed: `63190d7e5fb883175b8612374de5e7f094293548`.
Sample `gpt-6-1-sol-high-run-01.json` reports source status `unverified`,
validation `passed`, effort `high`, and API-equivalent subscription cost.
Those fields cannot be flattened into "verified" or "amount paid".

OpenRouter's exact interactive voxel page has not been located. Do not invent
an endpoint or promise a voxel category from the confirmed games evidence.
The games adapter must work against the observed HTML artifacts; add voxel
scenarios only after a real source page and payload pass the same contract.

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
`lib/benchmarks.ts`, schema registration, transport from FID-006 and existing
guards. New bounded domain under `lib/visual-builds/`, schema/store modules,
showcase components, public reads and protected admin routes. Planned paths
are new implementation targets, not claims that those files already exist.

### Risk Level

- [x] Medium: absent product capability; wrong identity links can mislead buyers.
- Executable source, redirects, mutable assets and unbounded imports create
  material security/reliability risks unless the following contracts hold.

## Proposed Solution

### Approach

#### 1. Sources and reuse

Implement exactly `pelican_sdf` and `openrouter_artifacts`. Additive records
live in a `showcase` namespace on the existing database, separate from money
and article ingestion. This feature does not depend on `CONTENT_ENABLED`.
Use `VISUAL_BUILDS_ENABLED=true` as an explicit public-surface switch;
unset/false hides public navigation, panels, routes and bundle reads. Admin
review remains available; importing is an authenticated explicit action.

Pelican reads only published manifest entries at a pinned commit, then their
declared result/artifact/thumbnail paths. Never scan drafts, raw transcripts or
private metadata. Verify advertised artifact hashes; save the entire approved
license notice with the snapshot. A manifest entry is not a quality endorsement.

OpenRouter reads configured, operator-selected benchmark scenario pages and
decodes their structured payload as data. Never `eval` page scripts or regex
arbitrary script bodies into executable code. Require a validated schema and
stable source identity; payload changes fail visibly without replacing good
records. Discover assets only under approved model-assets paths.

Rights are an explicit record: `pending`, `approved`, `withdrawn`, with evidence
URL/text, allowed display/cache/redistribution modes, attribution and reviewer.
The Data API's CC BY scope must not be assumed to license separate HTML/assets.
An OpenRouter record may be imported for review but stays unpublished until
artifact reuse is evidenced. A source link is not a substitute interactive build.

#### 2. Durable records and revision rules

Use these logical tables, with additive idempotent schema registration:

- `showcase.sources`: two fixed kinds, configured scenario pages/commit,
  enabled state, allowed origins/paths and source-level rights evidence.
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
  rejected state, match method, evidence, reviewer and catalog identity snapshot.
- `showcase.aliases`: source-scoped original identity to exact catalog identity,
  creator/version qualifiers, reviewer and durable rejection/override history.
- `showcase.reviews`: append-only operator decisions and viewer receipts bound
  to revision, bundle/dependency/license hashes and the accepted binding-set hash.

Catalog bindings reference real `models.id` rows. Catalog deletion removes the
binding, not source provenance. Public reads intersect bindings with the same
current catalog visibility used by model detail; disabled/delisted/hidden rows
cannot leak through a stale alias. Free, paid and subscription offerings stay
separate links; they can share a build only when each identity is proven exact.
Recheck current rights at every public read and bundle request. Source disable,
withdrawal or an accepted binding change removes affected publication atomically;
new review is required. Receipt hashes cannot authorize changed asset bytes.
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

Persist outcome `exact`, `alias`, `ambiguous` or `unmatched`, candidate ids and
reason. An accepted identity maps the model; effort/harness/run remain separate
artifact facets and visible labels. Missing settings remain unstated. Matching
does not prove our serving route reproduces a source's runtime or settings.

Public results require a reviewed identity and an active catalog binding.
Unmatched records remain in admin review and rematch after catalog changes;
they are not assigned to a neighboring generation to inflate coverage.

#### 4. Bounded import and artifact packaging

Depends on FID-2026-1104-006's byte-bounded transport and durable ownership;
verify that contract on disk before implementation, never copy the current
buffer-then-check fetcher. If FID-006 is still unimplemented, transport is a
named implementation dependency, not permission to ship an unsafe importer.

HTTPS, no credentials, fixed source origin/path allowlists, no private/reserved
resolved addresses, connection destination pinning, and validation of every
redirect/dependency. No arbitrary URL parameter in a public proxy. A URL found
in a source document is still untrusted. Strip URL credentials and secret query
values from safe errors. Never forward Savant credentials/cookies upstream.

Defaults: 2 MiB metadata/page, 2 MiB complete artifact bundle, 256 KiB preview,
64 dependencies and 256 MiB total unique stored bytes; count decoded bytes
while streaming and before allocation. Enforce total storage quota atomically
across concurrent imports, including unpublished revisions. A quota refusal
does not evict published data. Admin purges unreferenced assets explicitly.
The bundle reader returns at most 3 MiB serialized JSON, including base64
expansion; it does not return original source plus the packaged copy together.
Bound JSON nesting to 32, ids/labels to 300 characters, URLs to 2,048 and
prompts to 120,000; reject malformed dates, nonfinite/negative measurements
and unknown execution formats. Missing metrics stay null. Store observed-at
separately from source generation time and label source status without inventing
freshness. Dependency versions and their license notices belong to the bundle.

One source lease across instances; 45-second request deadline under a 60-second
route budget; at most 50 metadata records and one packaged artifact per request,
four simultaneous network reads, 15-second individual fetch deadlines.
Persist cursor/progress and continue with a new explicit admin request. No
detached promises or new scheduler. Expired ownership cannot advance a cursor
or publish over a newer owner. A partial cycle never marks missing builds gone.

Package Pelican's exported canvas module using a trusted thin-canvas wrapper.
Package OpenRouter's HTML and its approved static dependencies into a complete
offline document. Use pinned esbuild browser bundling with in-memory virtual
modules, no source-supplied plugin/config file and no filesystem resolver.
Do not execute imported JavaScript on the server or during packaging.
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
scripts limited to packaged inline/blob code, images/styles to packaged data.
Use `default-src 'none'; connect-src 'none'; frame-src 'none'; object-src
'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline' blob:;
style-src 'unsafe-inline'; img-src data: blob:`. Trusted serialization prevents
source strings closing a wrapper script; prohibit eval/WASM/remote imports.
All dependencies are in the approved bundle, not arbitrary live CDN scripts.
The application keeps its global `X-Frame-Options: DENY`; `srcDoc` avoids a
same-origin HTML route exception. Direct bundle requests return JSON only.

Any wrapper messages require `event.source === iframe.contentWindow`, a
per-mount nonce, a small allowlisted schema and bounded length. An opaque
origin reports `null`; accepting that string alone is never authentication.
Messages cannot ask the parent to fetch a URL, run code or call admin APIs.

Do not describe iframe/CSP as an OS sandbox or a complete network firewall.
Self-navigation and browser/GPU resource abuse require an adversarial browser
receipt and reviewed assets; source code receives no account data. Teardown
removes the frame, listeners and object URLs. Only one viewer is live; switching
or closing destroys the previous instance. Pause by unmounting when hidden.
An eight-second readiness watchdog shows failure, not successful rendering.
It is best-effort UI recovery, not a hard CPU execution deadline.

#### 6. Product and operator surfaces

`/showcase` shows 24 static preview cards per page, source/model/task filters,
stable id tie-break sorting and shareable query state. Interactive execution
starts on explicit Open build; no grid of running WebGL contexts. Detail names
the original prompt, model/version, effort, method, source/date, attribution,
nullable cost/time and its meaning. Missing thumbnails use an honest text card,
not a synthetic image attributed to the source.

Model detail adds a six-item visual examples panel and View all link using
exact current catalog ids, while preserving existing price/identity/coverage.
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

All steps below are `blocked` for code in this planning session: the operator
requested the FID and presentation only. Their design is specified here.

1. Verify source fixtures and the FID-006 transport dependency; record rights.
2. Add domain validation, bounded records/schema and durable import ownership.
3. Implement the two adapters, immutable assets/revisions and offline packager.
4. Add exact matching, source aliases, durable refusals and catalog reconciliation.
5. Wire guarded admin review, previews and revision-specific publication.
6. Wire isolated execution, public gallery/detail and exact model panels.
7. Run regressions and browser journeys with both source formats; separately
   record live source/rights receipts or their specific publication blockers.
8. Re-run full gates, document operation/rollback, commit verified code, then
   close/archive this record with CHANGELOG and implementation evidence.

### Verification

Planned test artifacts (none exist or ran as feature tests in this session):

- `tests/visual-builds-sources.test.mjs`: published-manifest-only Pelican reads,
  hashes, unknown/null metrics, OpenRouter structured payload/asset schema,
  incompatible pages, duplicate ids and removed-source refusal.
- `tests/visual-builds-matching.test.mjs`: exact ids, namespace/date/version
  collisions, reviewed aliases, ambiguous names, separate effort runs,
  rejection persistence and free/paid/subscription/catalog-visibility behavior.
- `tests/visual-builds-store.test.mjs`: fresh/upgrade migration twice, atomic
  unique-byte quota, concurrent claims/fencing, partial imports, stable public
  ids, revision/publish races, rights withdrawal and preserved manual decisions.
- `tests/visual-builds-packaging.test.mjs`: dependency graph and byte/deadline
  limits, no server execution/file reads, redirects/private destinations,
  offline output, separate original/wrapper hashes and no source repair.
- `tests/visual-builds-publication.test.mjs`: feature guards, only reviewed
  current revisions, accepted identity/current catalog intersection, unsafe
  asset denial, structured source/metrics copy and unpublish rollback.

Production HTTP cases extend `scripts/http-suite/visual-builds-checks.mjs`,
called by the existing HTTP suite after build: admin guards/origin refusals,
import/review/publish/withdraw and public reads. Browser journeys live in
`scripts/visual-builds-browser.mjs`, run after build against a disposable server:
both formats, keyboard/touch, both themes, 320/1024/1440 widths, frame teardown
and hostile artifacts. Add `test:visual-builds:browser` to package scripts and
`commands.test_visual_builds_browser` to protocol config during implementation;
the full verify runner must invoke that command after its build gate. Unit
tests never assume a pre-existing `.next` or invoke a production build.

Browser probes attempt parent DOM/cookie/storage reads, parent API calls,
forms/popups/top navigation, spoofed messages, dependency exfiltration and
direct source opening. Prove parent origin isolation and blocked subresource
requests, and record any self-navigation/resource limitation honestly.
Record actual pixels/WebGL interaction; an iframe load event is not proof.
Browser suite must fail rather than skip if its installed browser is missing.
Pin its harness dependency when implementing; no browser package is added now.

RED acceptance: each incorrect identity, unsafe execution/publication or
partial-import case fails against a deliberately broken fixture. GREEN must
pass those refusals and render one representative artifact per source format
from lawful fixtures. Actual source publication additionally requires a real
permitted build per selected source; fixture proofs do not establish permission.
Per the 2026-10-16 closure ruling, missing external publication evidence moves
to `dev/tracking/internal-followups.json` at implementation closure with its
specific blocker. It cannot be called live acceptance or silently discarded.

Planned production reachability (verify after wiring, not claimed now):
schema index -> showcase schema; admin route -> import -> adapter/transport ->
revision store/matcher; publish -> transactional revision gates; public pages
and model detail -> published reader -> current-catalog intersection; Open build
-> trusted viewer -> JSON bundle -> isolated frame. Every new config/helper
requires a production caller and the HTTP/browser receipt.

### YAGNI

Two adapters, one artifact domain, one viewer shell, existing database/guards.
No GLB renderer after the source removal, new object-storage vendor, paid
generation, self-service uploads, source voting, blended score or new billing.
Bundling is justified by offline execution; do not add a general remote build
service. Do not expand the article taxonomy for executable scenes.

## Verification Gates

Planning checks: FID metadata/template/section audit, active-ID uniqueness,
SCOPE registration, reference resolution, measured document deltas,
`git diff --check`, `npm run attribution`, and current-tree static checks.
Any concurrent-work failure is recorded with its real output and owner record.

Implementation gates (future; not a receipt of implemented behavior):

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: config_check — `npm run config:check`.
- gate: test tests/visual-builds-sources.test.mjs
- gate: test tests/visual-builds-matching.test.mjs
- gate: test tests/visual-builds-store.test.mjs
- gate: test tests/visual-builds-packaging.test.mjs
- gate: test tests/visual-builds-publication.test.mjs
- gate: test tests/verify-summary.test.mjs — regress new after-build gate ordering.
- gate: test — `npm test` includes all five promised feature test paths.
- gate: quality — `npm run quality`, 400-line production-file ceiling.
- gate: build — `npm run build`.
- gate: test_http — `npm run test:http` includes the wired showcase HTTP module.
- gate: test_visual_builds_browser — planned `npm run test:visual-builds:browser`;
  register the command and enforce it in `verify` during implementation.
- gate: test_postgres — `npm run test:postgres`.
- gate: test_recovery — `npm run test:recovery`, including stored artifact bytes.
- gate: verify — `npm run verify`, real output and log receipt.

### Verification Receipt

2026-11-04 planning receipt: document contract 12/12; adversarial design
coverage 15/15; existing references 11/11; five planned unit paths all gated;
013 unique/registered, active count 15/20. Lint/typecheck/quality/attribution/
config checks exit 0; existing matching/SKU tests 34/34, zero skipped.
Exact commands/output and measured deltas are retained in
`dev/session-summaries/2026-11-04-visual-builds-design.md`.
Implementation receipt: absent; feature test paths above are explicitly planned.

## Perfection Loop

### Loop 1 — RED

- **RED:** no artifact domain; unsafe identity reuse; no isolated execution;
  source permissions and the exact OpenRouter voxel page remain unconfirmed.
- **GREEN:** the design specifies immutable source revisions, conservative
  identity binding, explicit rights/publication gates and isolated offline builds.
- **AUDIT:** repository/source evidence above; planned call graph and test
  contracts cover both selected adapters. No application implementation claimed.
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
4. Is OpenRouter's voxel endpoint known? No; verified games artifacts form the
   first adapter contract, and voxel support requires real payload evidence.
5. Does source validation mean measured quality? No; keep source status,
   validation, measurement environment and local rendering checks distinct.
6. Can model-generated code execute on the server? Never; packaging parses
   bytes and the browser receives an opaque-origin isolated document.
7. Does removing SCAD leave GLB work? No; the operator removed that source,
   so this implementation contains no GLB-specific pipeline.
8. Must a source outage trigger a live fetch during a page render? No; all
   public reads use stored approved snapshots and local bounded queries.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] Commit SHA, actual file ranges, production call graph and gate output.
- [ ] Steps 1–8 implemented with tests and source/browser receipts.
- All code steps are blocked pending implementation authorization; rights or
  unavailable source evidence are separately recorded per revision/source.

### Code Verification Evidence

- [x] Existing integration points were inspected; new paths are labelled planned.
- [x] No source adapter/viewer/schema is claimed as implemented.
- [ ] Implementation matches this design and all declared gates pass.

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

### Final convergence passes

Pass 5: contract/reference/gate audit, zero changes (0%). Pass 6: adversarial
walkthrough, zero changes (0%); the wording-only probe correction changed no
FID text. Both are below 2%, with no remaining actionable design correction.
Receipt/status finalization is checked again before presentation. The document
converged; implementation remains blocked on the operator's next instruction.

### Loop 4 — Public read and concurrency challenge

- **RED:** a preview/hash URL or cached bundle could bypass withdrawal; catalog
  id reuse and stale publication actions need stronger identity checks.
- **GREEN:** all asset reads check live eligibility with no-store; catalog
  identity digests and transactional expected hashes fence stale publication.
  Metadata bounds, dependency notices and the verify-order regression are explicit.
- **AUDIT:** all five planned unit paths have gate lines; 013 is unique,
  registered, and the active count is 15/20. Existing matching suites: 34/34.
- **ADVERSARIAL:** a prior downloaded copy cannot be recalled; withdrawal makes
  subsequent reads fail. No claim of retroactive revocation is made.
- **CHANGE DELTA:** measured against Loop 3 in the planning receipt.

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

- **State:** design converged 2026-11-04; implementation has not started.
- **Closed Date:** unset; no implementation commit or feature receipt exists.
- **Tests Added:** none; five unit suites plus HTTP/browser gate scripts planned.
- **Archived:** no; retain as an active implementation contract after convergence.

## Lessons Learned

Source identity, catalog SKU and generation configuration are different facts.
Combining visual examples is useful only while those facts remain inspectable.
